import os
from datetime import timedelta
from typing import Optional

import bcrypt
import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from core import JWT_ALG, NO_ID, audit, client_ip, db, get_current_user, iso, new_id, now, role_for

router = APIRouter(prefix="/api/auth")
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() == "true"
COOKIE_SAMESITE = "none" if COOKIE_SECURE else "lax"
COOKIE = dict(httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, path="/")


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    return bcrypt.checkpw(p.encode(), h.encode())


def make_token(user_id: str, kind: str, delta: timedelta) -> str:
    return jwt.encode({"sub": user_id, "type": kind, "exp": now() + delta}, os.environ["JWT_SECRET"], algorithm=JWT_ALG)


def set_jwt_cookies(resp: Response, user_id: str):
    resp.set_cookie("access_token", make_token(user_id, "access", timedelta(minutes=60)), max_age=3600, **COOKIE)
    resp.set_cookie("refresh_token", make_token(user_id, "refresh", timedelta(days=7)), max_age=604800, **COOKIE)


def public_user(u: dict) -> dict:
    return {k: u.get(k) for k in ("id", "email", "name", "picture", "auth_methods", "created_at")} | {"role": role_for(u["email"])}


async def seed_owner():
    email = os.environ["ADMIN_EMAIL"].lower()
    if not await db.users.find_one({"email": email}):
        await db.users.insert_one({
            "id": new_id("user"), "email": email, "name": "Founder",
            "password_hash": hash_password(os.environ["ADMIN_PASSWORD"]),
            "auth_methods": ["password"], "picture": None, "created_at": iso(),
        })


class LoginIn(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.strip().lower()
    ident = f"{client_ip(request)}:{email}"
    att = await db.login_attempts.find_one({"identifier": ident}, NO_ID)
    if att and att.get("locked_until") and att["locked_until"] > iso():
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not role_for(email) or not verify_password(body.password, user["password_hash"]):
        count = (att or {}).get("count", 0) + 1
        upd = {"identifier": ident, "count": count}
        if count >= 5:
            upd["locked_until"] = iso(now() + timedelta(minutes=15))
            upd["count"] = 0
        await db.login_attempts.update_one({"identifier": ident}, {"$set": upd}, upsert=True)
        raise HTTPException(401, "Invalid email or password")
    await db.login_attempts.delete_many({"identifier": ident})
    set_jwt_cookies(response, user["id"])
    await audit(user, "auth.login", email, "password", request)
    ret = public_user(user)
    ret["access_token"] = make_token(user["id"], "access", timedelta(minutes=60))
    ret["refresh_token"] = make_token(user["id"], "refresh", timedelta(days=7))
    return ret


class RefreshIn(BaseModel):
    refresh_token: Optional[str] = None


@router.post("/refresh")
async def refresh(request: Request, response: Response, body: Optional[RefreshIn] = None):
    token = request.cookies.get("refresh_token") or (body and body.refresh_token)
    if not token:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "No refresh token")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALG])
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(401, "Invalid token type")
    user = await db.users.find_one({"id": payload["sub"]}, NO_ID)
    if not user or not role_for(user["email"]):
        raise HTTPException(401, "Access revoked")
    set_jwt_cookies(response, user["id"])
    return {
        "ok": True,
        "access_token": make_token(user["id"], "access", timedelta(minutes=60)),
        "refresh_token": make_token(user["id"], "refresh", timedelta(days=7))
    }


class SessionIn(BaseModel):
    session_id: str = Field(min_length=4, max_length=500)


@router.post("/google/session")
async def google_session(body: SessionIn, request: Request, response: Response):
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data", headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(401, "Google sign-in could not be verified")
    data = r.json()
    email = data["email"].lower()
    if not role_for(email):
        await audit({"email": email}, "auth.denied", email, "google account not allow-listed", request)
        raise HTTPException(403, "This Google account is not allowed to access Founder OS")
    user = await db.users.find_one({"email": email}, NO_ID)
    if not user:
        user = {"id": new_id("user"), "email": email, "name": data.get("name") or "Founder", "picture": data.get("picture"), "auth_methods": ["google"], "created_at": iso()}
        await db.users.insert_one(dict(user))
    else:
        methods = sorted(set(user.get("auth_methods", [])) | {"google"})
        await db.users.update_one({"email": email}, {"$set": {"picture": data.get("picture"), "auth_methods": methods}})
        user["auth_methods"] = methods
    await db.user_sessions.insert_one({"session_token": data["session_token"], "user_id": user["id"], "expires_at": iso(now() + timedelta(days=7)), "created_at": iso()})
    response.set_cookie("session_token", data["session_token"], max_age=604800, **COOKIE)
    await audit(user, "auth.login", email, "google", request)
    ret = public_user(user)
    ret["access_token"] = make_token(user["id"], "access", timedelta(minutes=60))
    ret["session_token"] = data["session_token"]
    return ret


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    for name in ("access_token", "refresh_token", "session_token"):
        response.delete_cookie(name, path="/", secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE)
    return {"ok": True}


class PasswordIn(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str = Field(min_length=10, max_length=200)


@router.post("/change-password")
async def change_password(body: PasswordIn, request: Request, user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"id": user["id"]})
    if not doc.get("password_hash") or not verify_password(body.current_password, doc["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await audit(user, "auth.password_changed", user["email"], "", request)
    return {"ok": True}
