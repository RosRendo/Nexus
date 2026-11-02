import asyncio
import hashlib
import hmac
import json
import re
import secrets
from datetime import timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from core import audit, db, decrypt, encrypt, get_current_user, iso, log_event, new_id, now, require_owner

router = APIRouter(prefix="/api")
GH = "https://api.github.com"

PROVIDERS = [
    {"key": "github", "name": "GitHub", "category": "Source & CI", "adapter": "live", "phase": 1, "capabilities": ["Repositories", "Commits", "Pull requests", "GitHub Actions", "Webhooks"]},
    {"key": "vercel", "name": "Vercel", "category": "Deployments", "adapter": "live", "link": "vercel_project_id", "capabilities": ["Deployments", "Build status", "Inspector rollback links"]},
    {"key": "railway", "name": "Railway", "category": "Deployments", "adapter": "live", "link": "railway_service_id", "capabilities": ["Service deployments", "Status"]},
    {"key": "docker", "name": "Docker", "category": "Infrastructure", "adapter": "agent", "capabilities": ["Containers via ingest agent"]},
    {"key": "pm2", "name": "PM2", "category": "Infrastructure", "adapter": "agent", "capabilities": ["Processes via ingest agent"]},
    {"key": "aws", "name": "AWS EC2 & CloudWatch", "category": "Infrastructure", "adapter": "live", "capabilities": ["EC2 instances tagged founder-os-project=<slug>", "CPU from CloudWatch"]},
    {"key": "prometheus", "name": "Prometheus / Grafana", "category": "Monitoring", "adapter": "live", "capabilities": ["Target health (up)", "label project=<slug> raises alerts"]},
    {"key": "sentry", "name": "Sentry", "category": "Monitoring", "adapter": "live", "link": "sentry_project", "capabilities": ["Unresolved issues", "Links to stack traces"]},
    {"key": "posthog", "name": "PostHog", "category": "Analytics", "adapter": "live", "link": "posthog_project_id", "capabilities": ["Daily active users"]},
]


def parse_repo(value: str):
    if not value:
        return None
    m = re.search(r"(?:github\.com[/:])?([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?/?$", value.strip())
    return f"{m.group(1)}/{m.group(2)}" if m else None


async def gh_integration():
    return await db.integrations.find_one({"provider": "github"}, {"_id": 0})


async def gh_get(token: str, client: httpx.AsyncClient, path: str, params=None):
    r = await client.get(f"{GH}{path}", params=params, headers={
        "Accept": "application/vnd.github+json", "Authorization": f"Bearer {token}", "X-GitHub-Api-Version": "2022-11-28"})
    if r.status_code == 401:
        raise HTTPException(502, "GitHub rejected the token (401). Reconnect with a valid token.")
    if r.status_code == 403 and r.headers.get("X-RateLimit-Remaining") == "0":
        raise HTTPException(429, "GitHub rate limit exceeded")
    if r.status_code == 404:
        raise HTTPException(404, "Repository not found or the token has no access to it")
    if r.is_error:
        raise HTTPException(502, f"GitHub returned {r.status_code}")
    return r.json()


def public_integration(doc):
    if not doc:
        return {"status": "disconnected", "auth_status": "not_configured", "last_sync_at": None, "last_error": None, "config": {}}
    return {k: doc.get(k) for k in ("status", "auth_status", "last_sync_at", "last_error", "connected_at")} | {"config": doc.get("config", {})}


@router.get("/integrations")
async def list_integrations(user=Depends(get_current_user)):
    gh = await gh_integration()
    out = []
    for p in PROVIDERS:
        if p["key"] == "github":
            out.append(p | public_integration(gh))
        elif p["adapter"] == "agent":
            ptype = "container" if p["key"] == "docker" else "pm2"
            live_ids = await db.projects.distinct("id", {"deleted_at": None})
            seen = await db.resources.find_one({"type": ptype, "metrics_source": "live", "deleted_at": None, "project_id": {"$in": live_ids}}, {"_id": 0, "last_seen_at": 1}, sort=[("last_seen_at", -1)])
            out.append(p | {"status": "connected" if seen else "disconnected", "auth_status": "per-project ingest key", "last_sync_at": (seen or {}).get("last_seen_at"), "last_error": None, "config": {}})
        else:
            doc = await db.integrations.find_one({"provider": p["key"]}, {"_id": 0, "credentials_ciphertext": 0, "targets": 0})
            out.append(p | public_integration(doc))
    return out


class TokenIn(BaseModel):
    token: str = Field(min_length=20, max_length=300)


@router.post("/integrations/github/connect")
async def github_connect(body: TokenIn, request: Request, user=Depends(require_owner)):
    token = body.token.strip()
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{GH}/user", headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})
    if r.status_code != 200:
        await audit(user, "integration.github.connect_failed", "github", f"status {r.status_code}", request)
        raise HTTPException(400, f"GitHub did not accept this token (status {r.status_code})")
    login = r.json().get("login")
    existing = await gh_integration()
    webhook_secret = decrypt(existing["webhook_secret_ciphertext"]) if existing and existing.get("webhook_secret_ciphertext") else secrets.token_urlsafe(32)
    doc = {
        "provider": "github", "status": "connected", "auth_status": "valid", "token_ciphertext": encrypt(token),
        "webhook_secret_ciphertext": encrypt(webhook_secret), "last_sync_at": iso(), "last_error": None, "connected_at": iso(),
        "config": {"account": login, "scopes": r.headers.get("X-OAuth-Scopes") or "fine-grained", "token_hint": f"…{token[-4:]}"},
    }
    await db.integrations.replace_one({"provider": "github"}, doc, upsert=True)
    await audit(user, "integration.github.connect", "github", login, request)
    return public_integration(doc)


class DisconnectIn(BaseModel):
    confirm: str


@router.post("/integrations/github/disconnect")
async def github_disconnect(body: DisconnectIn, request: Request, user=Depends(require_owner)):
    if body.confirm.strip().lower() != "disconnect github":
        raise HTTPException(400, "Type 'disconnect github' to confirm")
    await db.integrations.delete_one({"provider": "github"})
    await audit(user, "integration.github.disconnect", "github", "token and webhook secret erased", request)
    return {"ok": True}


@router.post("/integrations/github/test")
async def github_test(request: Request, user=Depends(require_owner)):
    gh = await gh_integration()
    if not gh:
        raise HTTPException(400, "GitHub is not connected")
    async with httpx.AsyncClient(timeout=20) as c:
        try:
            await gh_get(decrypt(gh["token_ciphertext"]), c, "/user")
            upd = {"status": "connected", "auth_status": "valid", "last_sync_at": iso(), "last_error": None}
        except HTTPException as e:
            upd = {"status": "error", "auth_status": "invalid" if e.status_code == 502 else "valid", "last_error": e.detail, "last_sync_at": iso()}
    await db.integrations.update_one({"provider": "github"}, {"$set": upd})
    return public_integration(await gh_integration())


@router.get("/integrations/github/webhook-secret")
async def github_webhook_secret(request: Request, user=Depends(require_owner)):
    gh = await gh_integration()
    if not gh:
        raise HTTPException(400, "GitHub is not connected")
    await audit(user, "integration.github.reveal_webhook_secret", "github", "", request)
    return {"secret": decrypt(gh["webhook_secret_ciphertext"])}


def demo_github(repo: str):
    base = now()
    msgs = ["Fix flaky auth test", "Bump dependencies", "Add rate limiting to public API", "Refactor billing webhook", "Improve onboarding copy", "Cache project list query"]
    commits = [{"sha": hashlib.sha1(f"{repo}{i}".encode()).hexdigest(), "message": m, "author": "you", "date": iso(base - timedelta(hours=7 * i + 2)), "url": None} for i, m in enumerate(msgs)]
    pulls = [{"number": 40 + i, "title": t, "author": "you", "state": "open", "updated_at": iso(base - timedelta(hours=11 * i + 3)), "url": None} for i, t in enumerate(["Usage-based pricing", "Dark mode for emails"])]
    runs = [{"id": i, "name": "CI", "branch": "main", "status": "completed", "conclusion": c, "sha": commits[i]["sha"], "created_at": commits[i]["date"], "duration_s": 140 + i * 17, "url": None} for i, c in enumerate(["success", "failure", "success", "success"])]
    return {"commits": commits, "pulls": pulls, "runs": runs}


@router.get("/projects/{pid}/github")
async def project_github(pid: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"$or": [{"id": pid}, {"slug": pid}]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Project not found")
    repo = parse_repo((p.get("dev") or {}).get("repo", ""))
    if not repo:
        return {"source": "none", "repo": None, "connected": False}
    gh = await gh_integration()
    if not gh or gh.get("status") == "disconnected":
        return {"source": "demo", "repo": repo, "connected": False, **demo_github(repo)}
    token = decrypt(gh["token_ciphertext"])
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            info, commits, pulls, runs = await asyncio.gather(
                gh_get(token, c, f"/repos/{repo}"),
                gh_get(token, c, f"/repos/{repo}/commits", {"per_page": 8}),
                gh_get(token, c, f"/repos/{repo}/pulls", {"state": "open", "per_page": 8}),
                gh_get(token, c, f"/repos/{repo}/actions/runs", {"per_page": 8}),
            )
    except HTTPException as e:
        await db.integrations.update_one({"provider": "github"}, {"$set": {"last_error": f"{repo}: {e.detail}", "last_sync_at": iso()}})
        return {"source": "live", "repo": repo, "connected": True, "error": e.detail, "commits": [], "pulls": [], "runs": []}
    await db.integrations.update_one({"provider": "github"}, {"$set": {"last_sync_at": iso(), "last_error": None, "status": "connected"}})

    def dur(r):
        try:
            from datetime import datetime
            return int((datetime.fromisoformat(r["updated_at"].replace("Z", "+00:00")) - datetime.fromisoformat(r["run_started_at"].replace("Z", "+00:00"))).total_seconds())
        except (KeyError, TypeError, ValueError, AttributeError):
            return None
    return {
        "source": "live", "repo": repo, "connected": True,
        "info": {"default_branch": info.get("default_branch"), "stars": info.get("stargazers_count"), "open_issues": info.get("open_issues_count"), "url": info.get("html_url"), "private": info.get("private")},
        "commits": [{"sha": c["sha"], "message": (c["commit"]["message"] or "").split("\n")[0], "author": (c.get("author") or {}).get("login") or c["commit"]["author"]["name"], "date": c["commit"]["author"]["date"], "url": c["html_url"]} for c in commits],
        "pulls": [{"number": pr["number"], "title": pr["title"], "author": pr["user"]["login"], "state": pr["state"], "updated_at": pr["updated_at"], "url": pr["html_url"]} for pr in pulls],
        "runs": [{"id": r["id"], "name": r["name"], "branch": r["head_branch"], "status": r["status"], "conclusion": r["conclusion"], "sha": r["head_sha"], "created_at": r["created_at"], "duration_s": dur(r), "url": r["html_url"]} for r in runs.get("workflow_runs", [])],
    }


@router.post("/integrations/github/webhook")
async def github_webhook(request: Request):
    gh = await gh_integration()
    if not gh:
        raise HTTPException(404, "GitHub integration not configured")
    body = await request.body()
    sig = request.headers.get("X-Hub-Signature-256", "")
    expected = "sha256=" + hmac.new(decrypt(gh["webhook_secret_ciphertext"]).encode(), body, hashlib.sha256).hexdigest()
    if not sig or not hmac.compare_digest(expected, sig):
        raise HTTPException(401, "Invalid signature")
    delivery = request.headers.get("X-GitHub-Delivery")
    event = request.headers.get("X-GitHub-Event", "unknown")
    if not delivery:
        raise HTTPException(400, "Missing delivery id")
    res = await db.github_deliveries.update_one({"_id": delivery}, {"$setOnInsert": {"event": event, "received_at": iso()}}, upsert=True)
    if res.upserted_id is None:
        return {"ok": True, "duplicate": True}
    payload = json.loads(body or b"{}")
    full = (payload.get("repository") or {}).get("full_name")
    project = None
    if full:
        async for p in db.projects.find({"deleted_at": None}, {"_id": 0, "id": 1, "name": 1, "dev": 1}):
            if (parse_repo((p.get("dev") or {}).get("repo", "")) or "").lower() == full.lower():
                project = p
                break
    if project:
        if event == "push":
            n = len(payload.get("commits", []))
            await log_event(project["id"], "github", f"{n} commit(s) pushed to {payload.get('ref', '').split('/')[-1]}", "live")
        elif event == "pull_request":
            pr = payload.get("pull_request", {})
            await log_event(project["id"], "github", f"PR #{pr.get('number')} {payload.get('action')}: {pr.get('title')}", "live")
        elif event == "workflow_run":
            run = payload.get("workflow_run", {})
            await log_event(project["id"], "github", f"Workflow {run.get('name')} {run.get('conclusion') or run.get('status')}", "live")
            if run.get("conclusion") == "failure":
                await db.alerts.insert_one({"id": new_id("alr"), "project_id": project["id"], "type": "failed_build", "severity": "high",
                                            "title": f"GitHub Actions failed: {run.get('name')}", "detail": f"Branch {run.get('head_branch')} · {run.get('head_sha', '')[:7]}",
                                            "link": run.get("html_url"), "source": "live", "acknowledged": False, "created_at": iso()})
    await db.integrations.update_one({"provider": "github"}, {"$set": {"last_sync_at": iso()}})
    return {"ok": True}
