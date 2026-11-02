import asyncio
import json
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel

from core import audit, db, decrypt, encrypt, iso, log_event, new_id, now, require_owner
from ops_models import evaluate_resource, raise_alert

router = APIRouter(prefix="/api")

FIELDS = {
    "vercel": [("token", "Access token", True), ("team_id", "Team ID (optional)", False)],
    "railway": [("token", "Account or team token", True)],
    "sentry": [("token", "Auth token (project:read, event:read)", True), ("org", "Organization slug", True), ("host", "Host (default https://sentry.io)", False)],
    "posthog": [("api_key", "Personal API key", True), ("host", "Host (e.g. https://us.posthog.com)", True)],
    "prometheus": [("base_url", "Prometheus base URL", True), ("bearer", "Bearer token (optional)", False)],
    "aws": [("access_key_id", "Access key ID (read-only IAM)", True), ("secret_access_key", "Secret access key", True), ("region", "Region (e.g. us-east-1)", True)],
}
LINK_FOR = {"vercel": "vercel_project_id", "railway": "railway_service_id", "sentry": "sentry_project", "posthog": "posthog_project_id"}


async def creds(key):
    doc = await db.integrations.find_one({"provider": key}, {"_id": 0})
    if not doc or not doc.get("credentials_ciphertext"):
        return None, None
    return doc, json.loads(decrypt(doc["credentials_ciphertext"]))


def ms_iso(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat() if ms else None


async def check_http(r: httpx.Response, name: str):
    if r.status_code in (401, 403):
        raise HTTPException(400, f"{name} rejected the credentials ({r.status_code})")
    if r.is_error:
        raise HTTPException(400, f"{name} returned {r.status_code}")
    return r.json()


def railway_q(c: httpx.AsyncClient, token: str, query: str, variables=None):
    return c.post("https://backboard.railway.app/graphql/v2", json={"query": query, "variables": variables or {}}, headers={"Authorization": f"Bearer {token}"})


def aws_client(cr, service):
    import boto3
    return boto3.client(service, aws_access_key_id=cr["access_key_id"], aws_secret_access_key=cr["secret_access_key"], region_name=cr["region"])


async def verify(key: str, cr: dict) -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        if key == "vercel":
            j = await check_http(await c.get("https://api.vercel.com/v2/user", headers={"Authorization": f"Bearer {cr['token']}"}), "Vercel")
            return {"account": j.get("user", {}).get("username"), "team_id": cr.get("team_id") or None}
        if key == "railway":
            j = await check_http(await railway_q(c, cr["token"], "{ me { email } }"), "Railway")
            if j.get("errors"):
                raise HTTPException(400, f"Railway: {j['errors'][0].get('message')}")
            return {"account": j["data"]["me"]["email"]}
        if key == "sentry":
            host = (cr.get("host") or "https://sentry.io").rstrip("/")
            j = await check_http(await c.get(f"{host}/api/0/organizations/{cr['org']}/", headers={"Authorization": f"Bearer {cr['token']}"}), "Sentry")
            return {"account": j.get("slug"), "host": host}
        if key == "posthog":
            host = cr["host"].rstrip("/")
            j = await check_http(await c.get(f"{host}/api/users/@me/", headers={"Authorization": f"Bearer {cr['api_key']}"}), "PostHog")
            return {"account": j.get("email"), "host": host}
        if key == "prometheus":
            base = cr["base_url"].rstrip("/")
            h = {"Authorization": f"Bearer {cr['bearer']}"} if cr.get("bearer") else {}
            j = await check_http(await c.get(f"{base}/api/v1/status/buildinfo", headers=h), "Prometheus")
            return {"account": base, "version": (j.get("data") or {}).get("version")}
    if key == "aws":
        try:
            ident = await asyncio.to_thread(lambda: aws_client(cr, "sts").get_caller_identity())
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, f"AWS rejected the credentials: {str(e)[:150]}")
        return {"account": ident.get("Account"), "region": cr["region"]}
    raise HTTPException(404, "Unknown provider")


VERCEL_STATE = {"READY": "success", "ERROR": "failed", "BUILDING": "building", "QUEUED": "queued", "INITIALIZING": "queued", "CANCELED": "canceled"}
RAILWAY_STATE = {"SUCCESS": "success", "FAILED": "failed", "CRASHED": "failed", "BUILDING": "building", "DEPLOYING": "building", "INITIALIZING": "queued", "QUEUED": "queued", "REMOVED": "canceled", "SKIPPED": "canceled"}


async def upsert_deployment(p, ext_id, data):
    res = await db.deployments.update_one({"external_id": ext_id}, {"$set": data, "$setOnInsert": {"id": new_id("dep"), "project_id": p["id"], "source": "live", "deleted_at": None, "created_at": iso()}}, upsert=True)
    if res.upserted_id:
        await log_event(p["id"], "deployment", f"{data['provider']} deployment {data['status']} ({data.get('branch') or data['environment']})", "live")
    if data["status"] == "failed":
        await raise_alert(p["id"], "failed_deployment", "critical", f"{data['provider'].title()} deployment failed", data.get("message") or data["environment"], "live", f"dep:{ext_id}")


async def sync_provider(key: str) -> dict:
    doc, cr = await creds(key)
    if not cr:
        raise HTTPException(400, f"{key} is not connected")
    projects = await db.projects.find({"deleted_at": None}, {"_id": 0}).to_list(500)
    linked = [p for p in projects if (p.get("links") or {}).get(LINK_FOR.get(key, "_"))]
    n = 0
    async with httpx.AsyncClient(timeout=25) as c:
        if key == "vercel":
            for p in linked:
                params = {"projectId": p["links"]["vercel_project_id"], "limit": 20} | ({"teamId": cr["team_id"]} if cr.get("team_id") else {})
                j = await check_http(await c.get("https://api.vercel.com/v6/deployments", params=params, headers={"Authorization": f"Bearer {cr['token']}"}), "Vercel")
                for d in j.get("deployments", []):
                    m = d.get("meta") or {}
                    dur = (d["ready"] - d["buildingAt"]) // 1000 if d.get("ready") and d.get("buildingAt") else None
                    await upsert_deployment(p, f"vercel:{d['uid']}", {"provider": "vercel", "environment": "production" if d.get("target") == "production" else "preview",
                                                                      "status": VERCEL_STATE.get(d.get("state") or d.get("readyState"), "queued"), "commit_sha": m.get("githubCommitSha", ""),
                                                                      "branch": m.get("githubCommitRef", ""), "author": m.get("githubCommitAuthorLogin") or (d.get("creator") or {}).get("username", ""),
                                                                      "message": (m.get("githubCommitMessage") or "")[:300], "duration_s": dur, "url": f"https://{d['url']}" if d.get("url") else "",
                                                                      "rollback_url": d.get("inspectorUrl") or "", "deployed_at": ms_iso(d.get("created")), "logs": ""})
                    n += 1
        elif key == "railway":
            q = "query($id: String!) { deployments(first: 20, input: { serviceId: $id }) { edges { node { id status createdAt staticUrl meta } } } }"
            for p in linked:
                j = await check_http(await railway_q(c, cr["token"], q, {"id": p["links"]["railway_service_id"]}), "Railway")
                if j.get("errors"):
                    raise HTTPException(400, f"Railway: {j['errors'][0].get('message')}")
                for e in j["data"]["deployments"]["edges"]:
                    d, m = e["node"], e["node"].get("meta") or {}
                    await upsert_deployment(p, f"railway:{d['id']}", {"provider": "railway", "environment": "production", "status": RAILWAY_STATE.get(d["status"], "queued"),
                                                                      "commit_sha": m.get("commitHash", ""), "branch": m.get("branch", ""), "author": m.get("commitAuthor", ""),
                                                                      "message": (m.get("commitMessage") or "")[:300], "duration_s": None, "url": f"https://{d['staticUrl']}" if d.get("staticUrl") else "",
                                                                      "rollback_url": "", "deployed_at": d["createdAt"], "logs": ""})
                    n += 1
        elif key == "sentry":
            host = doc["config"]["host"]
            for p in linked:
                j = await check_http(await c.get(f"{host}/api/0/projects/{cr['org']}/{p['links']['sentry_project']}/issues/", params={"query": "is:unresolved", "limit": 25},
                                                 headers={"Authorization": f"Bearer {cr['token']}"}), "Sentry")
                for i in j:
                    await db.errors.update_one({"external_id": f"sentry:{i['id']}"}, {"$set": {"title": i["title"], "level": i.get("level", "error"), "count": int(i.get("count", 1)), "last_seen": i["lastSeen"],
                                                                                              "first_seen": i["firstSeen"], "stack": f"{i.get('culprit', '')}\n\nFull stack trace: {i.get('permalink')}", "link": i.get("permalink"),
                                                                                              "status": "open"},
                                                                                     "$setOnInsert": {"id": new_id("err"), "project_id": p["id"], "service": "sentry", "environment": "production", "source": "live"}}, upsert=True)
                    n += 1
        elif key == "posthog":
            host = doc["config"]["host"]
            hog = "select toDate(timestamp) as d, count(distinct person_id) from events where timestamp > now() - interval 14 day group by d order by d"
            for p in linked:
                j = await check_http(await c.post(f"{host}/api/projects/{p['links']['posthog_project_id']}/query/", json={"query": {"kind": "HogQLQuery", "query": hog}},
                                                  headers={"Authorization": f"Bearer {cr['api_key']}"}), "PostHog")
                series = [{"date": str(r[0]), "users": r[1]} for r in j.get("results", [])]
                await db.projects.update_one({"id": p["id"]}, {"$set": {"analytics": {"source": "live", "series": series, "synced_at": iso()}}})
                n += 1
        elif key == "prometheus":
            base = cr["base_url"].rstrip("/")
            h = {"Authorization": f"Bearer {cr['bearer']}"} if cr.get("bearer") else {}
            j = await check_http(await c.get(f"{base}/api/v1/query", params={"query": "up"}, headers=h), "Prometheus")
            targets = [{"job": r["metric"].get("job"), "instance": r["metric"].get("instance"), "project": r["metric"].get("project"), "up": r["value"][1] == "1"} for r in j["data"]["result"]]
            slugs = {p["slug"]: p for p in projects}
            for t in targets:
                if not t["up"] and t["project"] in slugs:
                    await raise_alert(slugs[t["project"]]["id"], "api_downtime", "critical", f"Prometheus target down: {t['instance']}", t["job"], "live", f"prom:{t['instance']}")
            await db.integrations.update_one({"provider": key}, {"$set": {"config.targets_up": sum(t["up"] for t in targets), "config.targets_total": len(targets), "targets": targets}})
            n = len(targets)
    if key == "aws":
        slugs = {p["slug"]: p for p in projects}

        def fetch():
            ec2, cw = aws_client(cr, "ec2"), aws_client(cr, "cloudwatch")
            out = []
            for r in ec2.describe_instances()["Reservations"]:
                for i in r["Instances"]:
                    tags = {t["Key"]: t["Value"] for t in i.get("Tags", [])}
                    stats = cw.get_metric_statistics(Namespace="AWS/EC2", MetricName="CPUUtilization", Dimensions=[{"Name": "InstanceId", "Value": i["InstanceId"]}],
                                                     StartTime=now() - timedelta(minutes=30), EndTime=now(), Period=300, Statistics=["Average"])["Datapoints"]
                    cpu = sorted(stats, key=lambda s: s["Timestamp"])[-1]["Average"] if stats else None
                    out.append((i, tags, cpu))
            return out
        try:
            instances = await asyncio.to_thread(fetch)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, f"AWS: {str(e)[:150]}")
        for i, tags, cpu in instances:
            p = slugs.get(tags.get("founder-os-project"))
            if not p:
                continue
            state = i["State"]["Name"]
            await db.resources.update_one({"external_id": f"aws:{i['InstanceId']}"}, {"$set": {"name": tags.get("Name") or i["InstanceId"], "status": "running" if state == "running" else "down" if state in ("stopped", "terminated") else "degraded",
                                                                                              "metrics": {"cpu": round(cpu, 1)} if cpu is not None else None, "metrics_source": "live", "last_seen_at": iso(), "region": cr["region"], "host": i.get("PublicDnsName", "")},
                                                                                     "$setOnInsert": {"id": new_id("res"), "project_id": p["id"], "type": "cloud", "provider": "AWS EC2", "thresholds": {"cpu": 85, "ram": 90, "disk": 90}, "notes": i["InstanceType"], "source": "live", "deleted_at": None, "created_at": iso()}}, upsert=True)
            await evaluate_resource(await db.resources.find_one({"external_id": f"aws:{i['InstanceId']}"}, {"_id": 0}), "live")
            n += 1
    await db.integrations.update_one({"provider": key}, {"$set": {"last_sync_at": iso(), "last_error": None, "status": "connected", "config.linked_projects": len(linked)}})
    return {"synced": n, "linked_projects": len(linked)}


async def sync_all():
    for key in FIELDS:
        doc = await db.integrations.find_one({"provider": key}, {"_id": 0, "status": 1})
        if doc:
            try:
                await sync_provider(key)
            except HTTPException as e:
                await db.integrations.update_one({"provider": key}, {"$set": {"last_error": e.detail, "status": "error", "last_sync_at": iso()}})


class ConnectIn(BaseModel):
    credentials: dict


@router.get("/integrations/fields")
async def provider_fields(user=Depends(require_owner)):
    return {k: [{"key": f, "label": lbl, "required": req} for f, lbl, req in v] for k, v in FIELDS.items()}


@router.post("/integrations/{key}/connect")
async def connect(key: str, body: ConnectIn, request: Request, user=Depends(require_owner)):
    if key not in FIELDS:
        raise HTTPException(404, "Unknown provider")
    cr = {f: str(body.credentials.get(f, "")).strip()[:500] for f, _, _ in FIELDS[key]}
    missing = [lbl for f, lbl, req in FIELDS[key] if req and not cr[f]]
    if missing:
        raise HTTPException(422, f"Missing: {', '.join(missing)}")
    try:
        config = await verify(key, cr)
    except httpx.HTTPError as e:
        raise HTTPException(400, f"Could not reach {key}: {str(e)[:120]}")
    await db.integrations.replace_one({"provider": key}, {"provider": key, "status": "connected", "auth_status": "valid", "credentials_ciphertext": encrypt(json.dumps(cr)),
                                                          "config": config, "connected_at": iso(), "last_sync_at": iso(), "last_error": None}, upsert=True)
    await audit(user, f"integration.{key}.connect", key, str(config.get("account")), request)
    return {"ok": True, "config": config}


@router.post("/integrations/{key}/sync")
async def sync(key: str, request: Request, user=Depends(require_owner)):
    try:
        res = await sync_provider(key)
    except HTTPException as e:
        await db.integrations.update_one({"provider": key}, {"$set": {"last_error": e.detail, "status": "error", "last_sync_at": iso()}})
        raise
    except httpx.HTTPError as e:
        await db.integrations.update_one({"provider": key}, {"$set": {"last_error": str(e)[:200], "status": "error"}})
        raise HTTPException(502, f"{key} unreachable")
    await audit(user, f"integration.{key}.sync", key, json.dumps(res), request)
    return res


@router.post("/integrations/{key}/disconnect")
async def disconnect(key: str, request: Request, body: dict = Body(...), user=Depends(require_owner)):
    if key not in FIELDS:
        raise HTTPException(404, "Unknown provider")
    if str(body.get("confirm", "")).strip().lower() != f"disconnect {key}":
        raise HTTPException(400, f"Type 'disconnect {key}' to confirm")
    await db.integrations.delete_one({"provider": key})
    await audit(user, f"integration.{key}.disconnect", key, "credentials erased", request)
    return {"ok": True}
