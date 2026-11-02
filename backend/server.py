from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import logging  # noqa: E402
import os  # noqa: E402
from urllib.parse import urlparse  # noqa: E402

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402

from core import RateLimiter, client, client_ip, db  # noqa: E402
from routes_auth import router as auth_router, seed_owner  # noqa: E402
from routes_integrations import router as integrations_router  # noqa: E402
from adapters import router as adapters_router  # noqa: E402
from routes_ops import router as ops_router  # noqa: E402
from routes_projects import router as projects_router  # noqa: E402
from seed import seed_sample_portfolio  # noqa: E402
from seed_ops import seed_ops  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("founder_os")

app = FastAPI(title="Founder OS API")
general_limit = RateLimiter(600, 60)
auth_limit = RateLimiter(20, 60)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    path = request.url.path
    ip = client_ip(request)
    if path.startswith("/api/auth/login") or path.startswith("/api/auth/google"):
        if not auth_limit.allow(ip):
            return JSONResponse({"detail": "Too many requests"}, status_code=429)
    elif path.startswith("/api") and not general_limit.allow(ip):
        return JSONResponse({"detail": "Too many requests"}, status_code=429)
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and path != "/api/integrations/github/webhook" and not path.startswith(("/api/ingest/", "/api/cron/")):
        origin = request.headers.get("origin")
        if origin:
            host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
            if urlparse(origin).netloc.split(":")[0] != host.split(",")[0].strip().split(":")[0]:
                logger.warning("csrf_block origin=%s host=%s path=%s", origin, host, path)
                return JSONResponse({"detail": "Cross-origin request blocked"}, status_code=403)
    return await call_next(request)


app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(integrations_router)
app.include_router(adapters_router)
app.include_router(ops_router)


@app.get("/api/")
async def root():
    return {"service": "founder-os", "ok": True}


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ["CORS_ORIGINS"].split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.projects.create_index("id", unique=True)
    await db.projects.create_index("slug", unique=True)
    await db.projects.create_index([("deleted_at", 1), ("stage", 1)])
    await db.tasks.create_index("id", unique=True)
    await db.tasks.create_index([("project_id", 1), ("status", 1), ("deleted_at", 1)])
    await db.tasks.create_index("due_date")
    await db.milestones.create_index([("project_id", 1), ("due_date", 1)])
    await db.documents.create_index([("project_id", 1), ("updated_at", -1)])
    await db.events.create_index([("project_id", 1), ("created_at", -1)])
    await db.alerts.create_index([("project_id", 1), ("acknowledged", 1)])
    await db.audit_logs.create_index([("created_at", -1)])
    await seed_owner()
    for coll, keys in {"deployments": [("project_id", 1), ("deployed_at", -1)], "resources": [("project_id", 1), ("type", 1)], "logs": [("project_id", 1), ("created_at", -1)],
                       "errors": [("project_id", 1), ("last_seen", -1)], "api_metrics": [("project_id", 1), ("recorded_at", -1)], "notifications": [("read", 1), ("created_at", -1)],
                       "revenue_records": [("project_id", 1), ("month", 1)], "expense_records": [("project_id", 1), ("month", 1)]}.items():
        await db[coll].create_index(keys)
    await db.projects.create_index("ingest_key_hash", sparse=True)
    await db.cron_runs.create_index("run_id", unique=True)
    await seed_sample_portfolio()
    await seed_ops()
    logger.info("Founder OS started")


@app.on_event("shutdown")
async def shutdown():
    client.close()
