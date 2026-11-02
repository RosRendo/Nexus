import asyncio
import base64
import gzip
import hmac
import json
import os
import socket
import ssl
import time
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional

import httpx
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from core import audit, db, get_current_user, iso, log_event, new_id, now, require_owner
from ops_models import INGEST, KINDS, PATCHES, evaluate_resource, hash_key, live_projects, new_ingest_key, raise_alert, validate

router = APIRouter(prefix="/api")


def kind_or_404(kind):
    if kind not in KINDS:
        raise HTTPException(404, "Unknown record type")
    return KINDS[kind]


@router.get("/ops/{kind}")
async def list_records(kind: str, project_id: Optional[str] = None, limit: int = Query(500, le=2000), user=Depends(get_current_user)):
    coll, _, _ = kind_or_404(kind)
    projects = await live_projects()
    q = {"deleted_at": None, "project_id": project_id if project_id else {"$in": list(projects)}}
    sort = "deployed_at" if kind == "deployments" else "created_at"
    items = await db[coll].find(q, {"_id": 0}).sort(sort, -1).limit(limit).to_list(limit)
    for it in items:
        p = projects.get(it["project_id"], {})
        it["project_name"], it["project_slug"] = p.get("name"), p.get("slug")
    return items


@router.post("/ops/{kind}")
async def create_record(kind: str, request: Request, body: dict = Body(...), user=Depends(require_owner)):
    coll, model, label = kind_or_404(kind)
    data = validate(model, body)
    if not await db.projects.find_one({"id": data["project_id"], "deleted_at": None}):
        raise HTTPException(400, "Project not found or in trash")
    data.update({"id": new_id(kind[:3]), "source": "manual", "deleted_at": None, "created_at": iso(), "updated_at": iso()})
    if kind == "deployments":
        data["deployed_at"] = data.get("deployed_at") or iso()
    if kind == "monitors":
        data.update({"up": None, "history": [], "last_checked_at": None})
    if kind == "resources":
        data.update({"metrics": None, "last_seen_at": None})
    await db[coll].insert_one(dict(data))
    if kind == "deployments" and data.get("status") == "failed":
        await raise_alert(data["project_id"], "failed_deployment", "critical",
                          f"Deployment failed ({data.get('environment', 'production')})",
                          data.get("message") or data.get("branch") or "Deployment failed",
                          "manual", f"dep:{data['id']}:failed")
    if kind == "resources" and data.get("status") == "down":
        await raise_alert(data["project_id"], "resource_down", "critical",
                          f"{data['name']} is down", f"{data['type']} reported down",
                          "manual", f"res:{data['id']}:down")
    await log_event(data["project_id"], kind.rstrip("s"), f"{kind[:-1].title() if kind.endswith('s') else kind.title()} added: {data.get(label) or ''}")
    await audit(user, f"{kind}.create", data["id"], str(data.get(label)), request)
    return data


@router.patch("/ops/{kind}/{rid}")
async def update_record(kind: str, rid: str, request: Request, body: dict = Body(...), user=Depends(require_owner)):
    coll, _, label = kind_or_404(kind)
    if not await db[coll].find_one({"id": rid, "deleted_at": None}):
        raise HTTPException(404, "Record not found")
    upd = validate(PATCHES[kind], body) | {"updated_at": iso()}
    await db[coll].update_one({"id": rid}, {"$set": upd})
    if kind == "deployments" and upd.get("status") == "failed":
        rec = await db.deployments.find_one({"id": rid})
        if rec:
            await raise_alert(rec["project_id"], "failed_deployment", "critical",
                              f"Deployment failed ({rec.get('environment', 'production')})",
                              rec.get("message") or rec.get("branch") or "Deployment failed",
                              rec.get("source", "manual"), f"dep:{rid}:failed")
    if kind == "resources" and upd.get("status") == "down":
        rec = await db.resources.find_one({"id": rid})
        if rec:
            await raise_alert(rec["project_id"], "resource_down", "critical",
                              f"{rec['name']} is down", f"{rec['type']} reported down",
                              rec.get("source", "manual"), f"res:{rid}:down")
    await audit(user, f"{kind}.update", rid, ", ".join(upd), request)
    return await db[coll].find_one({"id": rid}, {"_id": 0})


class ConfirmIn(BaseModel):
    confirm: str = ""


@router.post("/ops/{kind}/{rid}/delete")
async def delete_record(kind: str, rid: str, body: ConfirmIn, request: Request, user=Depends(require_owner)):
    coll, _, label = kind_or_404(kind)
    rec = await db[coll].find_one({"id": rid, "deleted_at": None}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Record not found")
    if kind == "resources" and body.confirm.strip() != rec["name"]:
        raise HTTPException(400, "Type the resource name to confirm deletion")
    await db[coll].update_one({"id": rid}, {"$set": {"deleted_at": iso()}})
    await audit(user, f"{kind}.delete", rid, str(rec.get(label)), request)
    return {"ok": True}


# ---------- Live checks ----------
def _ssl_info(host: str):
    ctx = ssl.create_default_context()
    with socket.create_connection((host, 443), timeout=8) as sock:
        with ctx.wrap_socket(sock, server_hostname=host) as s:
            cert = s.getpeercert()
    exp = datetime.strptime(cert["notAfter"], "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
    issuer = dict(x[0] for x in cert.get("issuer", [])).get("organizationName", "")
    return {"valid": True, "expires_at": exp.isoformat(), "issuer": issuer, "error": None}


async def check_domain(d: dict):
    try:
        info = await asyncio.to_thread(_ssl_info, d["domain"])
    except (OSError, ssl.SSLError, ValueError, KeyError) as e:
        info = {"valid": False, "expires_at": None, "issuer": "", "error": str(e)[:200]}
    info["checked_at"] = iso()
    await db.domains.update_one({"id": d["id"]}, {"$set": {"ssl": info, "ssl_source": "live"}})
    if not info["valid"]:
        await raise_alert(d["project_id"], "ssl_invalid", "high", f"SSL check failed for {d['domain']}", info["error"], "live", f"ssl:{d['id']}:invalid")
    else:
        days = (datetime.fromisoformat(info["expires_at"]) - now()).days
        if days <= 14:
            await raise_alert(d["project_id"], "ssl_expiry", "high" if days <= 7 else "medium", f"SSL expires in {days} days", d["domain"], "live", f"ssl:{d['id']}:exp")
    return info


async def check_monitor(m: dict, client: httpx.AsyncClient):
    t0 = time.monotonic()
    try:
        r = await client.get(m["url"])
        code, up = r.status_code, r.status_code < 500
    except httpx.HTTPError as e:
        code, up = None, False
        m["last_error"] = str(e)[:200]
    ms = round((time.monotonic() - t0) * 1000)
    point = {"t": iso(), "up": up, "ms": ms, "code": code}
    await db.monitors.update_one({"id": m["id"]}, {"$set": {"up": up, "last_status_code": code, "last_latency_ms": ms, "last_checked_at": iso(), "last_error": m.get("last_error") if not up else None},
                                                   "$push": {"history": {"$each": [point], "$slice": -60}}})
    if not up:
        await raise_alert(m["project_id"], "api_downtime", "critical", f"{m['name']} is down", f"{m['url']} returned {code or 'no response'}", "live", f"mon:{m['id']}")
    return point


async def run_checks(only_project: str = None):
    q = {"deleted_at": None, "source": {"$ne": "sample"}}
    if only_project:
        q["project_id"] = only_project
    monitors = await db.monitors.find(q, {"_id": 0}).to_list(500)
    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as c:
        await asyncio.gather(*(check_monitor(m, c) for m in monitors))
    domains = await db.domains.find(q, {"_id": 0}).to_list(500)
    await asyncio.gather(*(check_domain(d) for d in domains))
    return {"monitors": len(monitors), "domains": len(domains)}


@router.post("/monitors/run")
async def run_monitors(request: Request, project_id: Optional[str] = None, user=Depends(require_owner)):
    res = await run_checks(project_id)
    await audit(user, "monitors.run", project_id or "all", json.dumps(res), request)
    return res


@router.post("/ops/domains/{rid}/check")
async def domain_check(rid: str, user=Depends(require_owner)):
    d = await db.domains.find_one({"id": rid, "deleted_at": None}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Domain not found")
    return await check_domain(d)


# ---------- Observability queries ----------
def since(hours: int):
    return iso(now() - timedelta(hours=hours))


@router.get("/obs/logs")
async def logs(project_id: Optional[str] = None, environment: Optional[str] = None, level: Optional[str] = None, service: Optional[str] = None,
               hours: int = Query(24, le=720), q: Optional[str] = Query(None, max_length=100), limit: int = Query(200, le=1000), user=Depends(get_current_user)):
    import re
    projects = await live_projects()
    f = {"project_id": project_id or {"$in": list(projects)}, "created_at": {"$gte": since(hours)}}
    for k, v in (("environment", environment), ("level", level), ("service", service)):
        if v:
            f[k] = v
    if q:
        f["message"] = {"$regex": re.escape(q), "$options": "i"}
    items = await db.logs.find(f, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    services = await db.logs.distinct("service", {"project_id": {"$in": list(projects)}})
    for it in items:
        it["project_name"] = projects.get(it["project_id"], {}).get("name")
    return {"items": items, "services": sorted(services)}


@router.get("/obs/errors")
async def errors(project_id: Optional[str] = None, environment: Optional[str] = None, status: Optional[str] = "open", hours: int = Query(720, le=2160), user=Depends(get_current_user)):
    projects = await live_projects()
    f = {"project_id": project_id or {"$in": list(projects)}, "last_seen": {"$gte": since(hours)}}
    if environment:
        f["environment"] = environment
    if status:
        f["status"] = status
    items = await db.errors.find(f, {"_id": 0}).sort("last_seen", -1).to_list(500)
    for it in items:
        it["project_name"] = projects.get(it["project_id"], {}).get("name")
    return items


class ErrorPatch(BaseModel):
    status: Literal["open", "resolved", "ignored"]


@router.patch("/obs/errors/{eid}")
async def update_error(eid: str, body: ErrorPatch, request: Request, user=Depends(require_owner)):
    res = await db.errors.update_one({"id": eid}, {"$set": {"status": body.status}})
    if not res.matched_count:
        raise HTTPException(404, "Error not found")
    await audit(user, "error.status", eid, body.status, request)
    return {"ok": True}


@router.get("/obs/metrics")
async def api_metrics(project_id: Optional[str] = None, environment: str = "production", hours: int = Query(24, le=720), user=Depends(get_current_user)):
    projects = await live_projects()
    f = {"project_id": project_id or {"$in": list(projects)}, "environment": environment, "recorded_at": {"$gte": since(hours)}}
    rows = await db.api_metrics.find(f, {"_id": 0}).sort("recorded_at", 1).to_list(5000)
    latest, series = {}, {}
    for r in rows:
        key = (r["project_id"], r["endpoint"])
        latest[key] = r
        bucket = r["recorded_at"][:13]
        s = series.setdefault(bucket, {"t": bucket, "p95": [], "rpm": 0})
        s["p95"].append(r["p95"])
        s["rpm"] += r["rpm"]
    endpoints = [r | {"project_name": projects.get(r["project_id"], {}).get("name")} for r in latest.values()]
    endpoints.sort(key=lambda r: -r["p95"])
    chart = [{"t": b["t"][11:13] + ":00", "p95": round(sum(b["p95"]) / len(b["p95"])), "rpm": round(b["rpm"])} for b in series.values()]
    return {"endpoints": endpoints, "series": chart}


@router.get("/obs/health")
async def health_matrix(user=Depends(get_current_user)):
    projects = [p for p in (await live_projects()).values() if p["stage"] != "archived"]
    ids = [p["id"] for p in projects]

    async def by_project(coll, q):
        out = {}
        for d in await db[coll].find({"deleted_at": None, "project_id": {"$in": ids}, **q}, {"_id": 0}).to_list(3000):
            out.setdefault(d["project_id"], []).append(d)
        return out
    deps, res, mons, doms = await asyncio.gather(by_project("deployments", {}), by_project("resources", {}), by_project("monitors", {}), by_project("domains", {}))
    errs = {a["_id"]: a["n"] for a in await db.errors.aggregate([{"$match": {"status": "open", "project_id": {"$in": ids}}}, {"$group": {"_id": "$project_id", "n": {"$sum": "$count"}}}]).to_list(500)}
    rows = []
    for p in projects:
        d = sorted(deps.get(p["id"], []), key=lambda x: x.get("deployed_at") or "", reverse=True)
        r, m, dm = res.get(p["id"], []), mons.get(p["id"], []), doms.get(p["id"], [])
        ssl_days = [(datetime.fromisoformat(x["ssl"]["expires_at"]) - now()).days for x in dm if (x.get("ssl") or {}).get("expires_at")]
        rows.append({
            "project_id": p["id"], "name": p["name"], "slug": p["slug"], "stage": p["stage"], "app": (p.get("telemetry") or {}).get("health"),
            "deploy": d[0]["status"] if d else None,
            "uptime": None if not m else ("down" if any(x.get("up") is False for x in m) else "up" if any(x.get("up") for x in m) else None),
            "resources": None if not r else ("down" if any(x["status"] == "down" for x in r) else "degraded" if any(x["status"] == "degraded" for x in r) else "running"),
            "errors": errs.get(p["id"], 0), "ssl_days": min(ssl_days) if ssl_days else None,
            "sources": sorted({x.get("source", "manual") for x in d[:1] + r + m}),
        })
    return rows


@router.get("/obs/analytics")
async def analytics(user=Depends(get_current_user)):
    projects = [p for p in (await live_projects()).values() if p["stage"] != "archived"]
    return [{"project_id": p["id"], "name": p["name"], "slug": p["slug"], **(p.get("analytics") or {"source": None, "series": []})} for p in projects]


# ---------- Business ----------
@router.get("/business/summary")
async def business_summary(months: int = Query(6, ge=1, le=24), user=Depends(get_current_user)):
    projects = {k: v for k, v in (await live_projects()).items() if v["stage"] != "archived"}
    rev = await db.revenue_records.find({"deleted_at": None, "project_id": {"$in": list(projects)}}, {"_id": 0}).to_list(5000)
    exp = await db.expense_records.find({"deleted_at": None, "project_id": {"$in": list(projects)}}, {"_id": 0}).to_list(5000)
    keys = sorted({r["month"] for r in rev} | {e["month"] for e in exp})[-months:]
    history = []
    for m in keys:
        row = {"month": m, "mrr": 0, "one_time": 0, "expenses": 0}
        for r in rev:
            if r["month"] == m:
                row["mrr" if r["type"] == "mrr" else "one_time"] += r["amount"]
                row[projects[r["project_id"]]["name"]] = row.get(projects[r["project_id"]]["name"], 0) + r["amount"]
        row["expenses"] = sum(e["amount"] for e in exp if e["month"] == m)
        row["profit"] = round(row["mrr"] + row["one_time"] - row["expenses"], 2)
        history.append(row)
    last = keys[-1] if keys else None
    by_project = []
    for pid, p in projects.items():
        r = sum(x["amount"] for x in rev if x["project_id"] == pid and x["month"] == last)
        e = sum(x["amount"] for x in exp if x["project_id"] == pid and x["month"] == last)
        if r or e:
            by_project.append({"project_id": pid, "name": p["name"], "revenue": r, "expenses": e, "profit": round(r - e, 2)})
    by_project.sort(key=lambda x: -x["profit"])
    categories = {}
    for e in exp:
        if e["month"] == last:
            categories[e["category"]] = categories.get(e["category"], 0) + e["amount"]
    sources = sorted({r.get("source", "manual") for r in rev + exp})
    return {"history": history, "by_project": by_project, "categories": [{"category": k, "amount": v} for k, v in categories.items()],
            "month": last, "sources": sources, "projects": [p["name"] for p in projects.values() if any(x["project_id"] == p["id"] for x in rev)],
            "verified_provider": None}


# ---------- Ingestion (monitoring agents, CI, apps) ----------
class RotateIn(BaseModel):
    confirm: str


@router.post("/projects/{pid}/ingest-key")
async def rotate_ingest_key(pid: str, body: RotateIn, request: Request, user=Depends(require_owner)):
    p = await db.projects.find_one({"id": pid, "deleted_at": None}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Project not found")
    if body.confirm.strip() != p["name"]:
        raise HTTPException(400, "Type the project name to rotate the ingest key")
    key = new_ingest_key()
    await db.projects.update_one({"id": pid}, {"$set": {"ingest_key_hash": hash_key(key), "ingest_key_hint": key[-4:], "ingest_key_rotated_at": iso()}})
    await audit(user, "project.ingest_key_rotated", pid, p["name"], request)
    return {"key": key, "hint": key[-4:]}


@router.post("/ingest/{kind}")
async def ingest(kind: str, request: Request, body=Body(...)):
    if kind not in INGEST:
        raise HTTPException(404, "Unknown ingest type")
    key = request.headers.get("X-Ingest-Key", "")
    p = await db.projects.find_one({"ingest_key_hash": hash_key(key), "deleted_at": None}, {"_id": 0}) if key else None
    if not p:
        raise HTTPException(401, "Invalid ingest key")
    items = body if isinstance(body, list) else [body]
    if len(items) > 500:
        raise HTTPException(413, "Max 500 items per request")
    pid, t = p["id"], iso()
    validated = [validate(INGEST[kind], raw) for raw in items]
    for d in validated:
        if kind == "logs":
            await db.logs.insert_one({"id": new_id("log"), "project_id": pid, "source": "live", "created_at": t, **d})
        elif kind == "errors":
            fp = hash_key(f"{d['title']}|{d['service']}|{d['environment']}")[:16]
            res = await db.errors.update_one({"project_id": pid, "fingerprint": fp}, {"$inc": {"count": 1}, "$set": {"last_seen": t, "stack": d["stack"], "status": "open"},
                                                                                     "$setOnInsert": {"id": new_id("err"), "title": d["title"], "level": d["level"], "service": d["service"], "environment": d["environment"], "first_seen": t, "source": "live"}}, upsert=True)
            if res.upserted_id:
                await raise_alert(pid, "error_spike", "high" if d["level"] == "fatal" else "medium", f"New error: {d['title'][:80]}", d["service"], "live", f"err:{pid}:{fp}")
        elif kind == "metrics":
            await db.api_metrics.insert_one({"id": new_id("met"), "project_id": pid, "source": "live", "recorded_at": t, **d})
            if d["error_rate"] >= 5:
                await raise_alert(pid, "error_rate", "high", f"Error rate {d['error_rate']:.1f}% on {d['endpoint']}", d["environment"], "live", f"rate:{pid}:{d['endpoint']}")
        elif kind == "resource":
            metrics = {k: d[k] for k in ("cpu", "ram", "disk", "net_mbps", "connections", "restarts") if d.get(k) is not None}
            await db.resources.update_one({"project_id": pid, "name": d["name"], "deleted_at": None},
                                          {"$set": {"status": d["status"], "metrics": metrics, "metrics_source": "live", "last_seen_at": t, "type": d["type"]},
                                           "$setOnInsert": {"id": new_id("res"), "provider": "agent", "region": "", "host": "", "thresholds": {"cpu": 85, "ram": 90, "disk": 90}, "notes": "", "source": "live", "created_at": t}}, upsert=True)
            await evaluate_resource(await db.resources.find_one({"project_id": pid, "name": d["name"], "deleted_at": None}, {"_id": 0}), "live")
        elif kind == "deployment":
            await db.deployments.insert_one({"id": new_id("dep"), "project_id": pid, "source": "live", "deleted_at": None, "created_at": t, **d, "deployed_at": d.get("deployed_at") or t})
            await log_event(pid, "deployment", f"{d['provider']} deployment {d['status']} ({d['branch']} · {d['commit_sha'][:7]})", "live")
            if d["status"] == "failed":
                await raise_alert(pid, "failed_deployment", "critical", f"Deployment failed ({d['environment']})", d["message"] or d["branch"], "live", f"dep:{pid}:{d['commit_sha']}")
        elif kind == "job":
            inc = {"runs_24h": 1} | ({"failures_24h": 1} if d["status"] == "failed" else {})
            await db.jobs.update_one({"project_id": pid, "name": d["name"], "deleted_at": None}, {"$set": {"last_run_at": t, "last_status": d["status"], "last_duration_s": d["duration_s"], "metrics_source": "live"}, "$inc": inc,
                                                                                                "$setOnInsert": {"id": new_id("job"), "queue": "", "schedule": "", "status": "active", "notes": "", "source": "live", "created_at": t}}, upsert=True)
            if d["status"] == "failed":
                await raise_alert(pid, "job_failure", "medium", f"Job failed: {d['name']}", "Background job reported failure", "live", f"job:{pid}:{d['name']}")
    return {"ok": True, "accepted": len(items)}


# ---------- Notifications ----------
@router.get("/notifications")
async def notifications(unread: bool = False, user=Depends(get_current_user)):
    live = {"project_id": {"$in": list(await live_projects())}}
    q = {"read": False, **live} if unread else live
    items = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return {"items": items, "unread": await db.notifications.count_documents({"read": False, **live})}


class ReadIn(BaseModel):
    ids: Optional[list] = None


@router.post("/notifications/read")
async def mark_read(body: ReadIn, user=Depends(require_owner)):
    q = {"id": {"$in": body.ids}} if body.ids else {}
    await db.notifications.update_many(q, {"$set": {"read": True}})
    return {"ok": True}


class EmailSettingsIn(BaseModel):
    enabled: bool = True
    min_severity: Literal["critical", "high"] = "critical"
    recipients: Optional[List[str]] = None
    provider: Optional[str] = None
    smtp_host: Optional[str] = ""
    smtp_port: Optional[int] = 587
    smtp_user: Optional[str] = ""
    smtp_pass: Optional[str] = None
    smtp_tls: Optional[bool] = True
    smtp_from: Optional[str] = ""
    resend_api_key: Optional[str] = None


EmailSettingsIn.model_rebuild()


@router.get("/notifications/email-settings")
async def get_email_settings(user=Depends(require_owner)):
    from emailer import email_settings
    cfg = await email_settings()
    last = await db.notifications.find_one({"email": {"$exists": True}}, {"_id": 0, "email": 1, "title": 1}, sort=[("email.at", -1)])
    if cfg.get("smtp_pass"):
        cfg["smtp_pass"] = "••••••••"
    if cfg.get("resend_api_key"):
        cfg["resend_api_key"] = "••••••••"
    return cfg | {"last_delivery": last}


@router.put("/notifications/email-settings")
async def put_email_settings(body: EmailSettingsIn, request: Request, user=Depends(require_owner)):
    data = body.model_dump(exclude_unset=True)
    if data.get("smtp_pass") in ("••••••••", None, ""):
        data.pop("smtp_pass", None)
    if data.get("resend_api_key") in ("••••••••", None, ""):
        data.pop("resend_api_key", None)
    if "recipients" in data and data["recipients"] is not None:
        data["recipients"] = [r.strip().lower() for r in data["recipients"] if r and "@" in r]
    await db.settings.update_one({"key": "email_alerts"}, {"$set": {"key": "email_alerts", **data}}, upsert=True)
    await audit(user, "notifications.email_settings", "", json.dumps({k: v for k, v in data.items() if "pass" not in k and "key" not in k}), request)
    from emailer import email_settings
    cfg = await email_settings()
    if cfg.get("smtp_pass"):
        cfg["smtp_pass"] = "••••••••"
    if cfg.get("resend_api_key"):
        cfg["resend_api_key"] = "••••••••"
    return cfg


@router.post("/notifications/email-test")
async def email_test(request: Request, user=Depends(require_owner)):
    from emailer import alert_template, email_settings, send_email
    if await db.audit_logs.count_documents({"action": "notifications.email_test", "created_at": {"$gte": since(1)}}) >= 10:
        raise HTTPException(429, "Test email limit reached (10 per hour)")
    cfg = await email_settings()
    target_recipients = cfg.get("recipients") or [user["email"]]
    subject, html = alert_template("Test alert: critical alert delivery active", "Nexus Control", "This test confirms that critical alerts (failed deployments, service downtime, errors) are delivered directly to your inbox.", "critical", "test")
    results = []
    for r in target_recipients:
        res = await send_email(to=r, subject=subject, html=html)
        results.append(res)
    await audit(user, "notifications.email_test", ",".join(target_recipients), json.dumps([r.get("status") for r in results]), request)
    bad = next((r for r in results if r["status"] != "sent"), None)
    if bad:
        raise HTTPException(502, bad.get("error") or "Email could not be sent")
    first = results[0] if results else {}
    return {"ok": True, "to": target_recipients, "mode": first.get("mode", "smtp"), "note": first.get("note")}


# ---------- Backups ----------
BACKUP_COLLECTIONS = ["projects", "tasks", "milestones", "documents", "events", "alerts", "deployments", "resources", "domains", "jobs", "monitors",
                      "revenue_records", "expense_records", "customers", "notifications", "audit_logs"]


async def make_backup(trigger: str):
    data = {c: await db[c].find({}, {"_id": 0, "ingest_key_hash": 0}).to_list(100000) for c in BACKUP_COLLECTIONS}
    raw = gzip.compress(json.dumps(data, default=str).encode())
    bid = new_id("bak")
    file_id = await AsyncIOMotorGridFSBucket(db, bucket_name="backup_files").upload_from_stream(f"{bid}.json.gz", raw)
    doc = {"id": bid, "trigger": trigger, "created_at": iso(), "size_bytes": len(raw), "counts": {c: len(v) for c, v in data.items()}, "file_id": str(file_id)}
    await db.backups.insert_one(dict(doc))
    old = await db.backups.find({}, {"_id": 0, "id": 1, "file_id": 1}).sort("created_at", -1).skip(14).to_list(100)
    for o in old:
        if o.get("file_id"):
            await AsyncIOMotorGridFSBucket(db, bucket_name="backup_files").delete(ObjectId(o["file_id"]))
        await db.backups.delete_one({"id": o["id"]})
    return {k: v for k, v in doc.items() if k != "file_id"}


@router.get("/backups")
async def list_backups(user=Depends(require_owner)):
    return await db.backups.find({}, {"_id": 0, "payload_b64": 0, "file_id": 0}).sort("created_at", -1).to_list(30)


@router.post("/backups")
async def create_backup(request: Request, user=Depends(require_owner)):
    doc = await make_backup("manual")
    await audit(user, "backup.create", doc["id"], f"{doc['size_bytes']} bytes", request)
    return doc


@router.get("/backups/{bid}/download")
async def download_backup(bid: str, request: Request, user=Depends(require_owner)):
    from fastapi.responses import Response
    b = await db.backups.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Backup not found")
    await audit(user, "backup.download", bid, "", request)
    if b.get("file_id"):
        stream = await AsyncIOMotorGridFSBucket(db, bucket_name="backup_files").open_download_stream(ObjectId(b["file_id"]))
        payload = await stream.read()
    else:
        payload = base64.b64decode(b["payload_b64"])
    return Response(payload, media_type="application/gzip", headers={"Content-Disposition": f'attachment; filename="founder-os-{b["created_at"][:10]}.json.gz"'})


# ---------- Scheduled jobs ----------
async def scheduled_sync(run_id: str):
    from adapters import sync_all
    try:
        await run_checks()
        await sync_all()
        await db.cron_runs.update_one({"run_id": run_id}, {"$set": {"status": "done", "finished_at": iso()}})
    except Exception as e:  # noqa: BLE001
        await db.cron_runs.update_one({"run_id": run_id}, {"$set": {"status": "error", "error": str(e)[:300]}})


async def scheduled_backup(run_id: str):
    await make_backup("scheduled")
    await db.cron_runs.update_one({"run_id": run_id}, {"$set": {"status": "done", "finished_at": iso()}})


async def accept_cron(request: Request, background: BackgroundTasks, job):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or not hmac.compare_digest(auth[7:], os.environ["WEBHOOK_CRON_SECRET"]):
        raise HTTPException(401, "Unauthorized")
    raw = await request.body()
    try:
        envelope = json.loads(raw) if raw.strip() else {}
    except ValueError:
        raise HTTPException(400, "Invalid body")
    run_id = request.headers.get("X-Webhook-Id") or (envelope or {}).get("run_id") or new_id("run")
    res = await db.cron_runs.update_one({"run_id": run_id}, {"$setOnInsert": {"run_id": run_id, "job": job.__name__, "status": "queued", "created_at": iso()}}, upsert=True)
    if res.upserted_id:
        background.add_task(job, run_id)
    return {"ok": True}


@router.post("/cron/sync")
async def cron_sync(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    return await accept_cron(request, background, scheduled_sync)


@router.post("/cron/backup")
async def cron_backup(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    return await accept_cron(request, background, scheduled_backup)


@router.get("/cron/runs")
async def cron_runs(user=Depends(require_owner)):
    return await db.cron_runs.find({}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
