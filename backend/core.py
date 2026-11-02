import os
import re
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone

import jwt
from cryptography.fernet import Fernet
from fastapi import HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
fernet = Fernet(os.environ["ENCRYPTION_KEY"].encode())
JWT_ALG = "HS256"
NO_ID = {"_id": 0}


def now():
    return datetime.now(timezone.utc)


def iso(dt=None):
    return (dt or now()).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "project"


def aware(dt):
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def email_set(var: str) -> set:
    return {e.strip().lower() for e in os.environ.get(var, "").split(",") if e.strip()}


def role_for(email: str):
    email = email.lower()
    if email in email_set("OWNER_EMAILS"):
        return "owner"
    if email in email_set("VIEWER_EMAILS"):
        return "viewer"
    return None


def encrypt(value: str) -> str:
    return fernet.encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return fernet.decrypt(value.encode()).decode()


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    bearer = auth[7:] if auth.startswith("Bearer ") else None
    user_id = None
    for token in (request.cookies.get("access_token"), bearer):
        if not token:
            continue
        try:
            payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALG])
            if payload.get("type") == "access":
                user_id = payload["sub"]
                break
        except jwt.InvalidTokenError:
            continue
    if not user_id:
        for token in (request.cookies.get("session_token"), bearer):
            if not token:
                continue
            sess = await db.user_sessions.find_one({"session_token": token}, NO_ID)
            if sess and aware(sess["expires_at"]) > now():
                user_id = sess["user_id"]
                break
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user or not role_for(user["email"]):
        raise HTTPException(status_code=401, detail="Access revoked")
    user["role"] = role_for(user["email"])
    return user


async def require_owner(request: Request) -> dict:
    user = await get_current_user(request)
    if user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Owner role required for this action")
    return user


async def audit(user: dict, action: str, target: str = "", detail: str = "", request: Request = None):
    await db.audit_logs.insert_one({
        "id": new_id("aud"), "user_id": user.get("id") if user else None,
        "user_email": user.get("email") if user else None, "action": action,
        "target": target, "detail": detail,
        "ip": client_ip(request) if request else None, "created_at": iso(),
    })


async def log_event(project_id, type_: str, message: str, source: str = "manual"):
    await db.events.insert_one({
        "id": new_id("evt"), "project_id": project_id, "type": type_,
        "message": message, "source": source, "created_at": iso(),
    })
    if project_id:
        await db.projects.update_one({"id": project_id}, {"$set": {"last_activity_at": iso()}})


class RateLimiter:
    def __init__(self, limit: int, window: int):
        self.limit, self.window = limit, window
        self.hits = defaultdict(deque)

    def allow(self, key: str) -> bool:
        t = time.monotonic()
        q = self.hits[key]
        while q and q[0] < t - self.window:
            q.popleft()
        if len(q) >= self.limit:
            return False
        q.append(t)
        return True
