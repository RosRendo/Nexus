import hashlib
import json
import secrets
from datetime import date
from typing import List, Literal, Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError, create_model

from core import db, iso, new_id

Env = Literal["production", "staging", "preview", "development"]
MONTH = r"^\d{4}-(0[1-9]|1[0-2])$"
RULE_FOR = {"failed_deployment": "failed_deployments", "failed_build": "failed_deployments", "api_downtime": "downtime",
            "error_rate": "error_spikes", "error_spike": "error_spikes", "blocked_task": "blocked_tasks"}


class Thresholds(BaseModel):
    cpu: float = Field(85, ge=1, le=100)
    ram: float = Field(90, ge=1, le=100)
    disk: float = Field(90, ge=1, le=100)


class DeploymentIn(BaseModel):
    project_id: str
    environment: Env = "production"
    status: Literal["queued", "building", "success", "failed", "canceled"] = "success"
    provider: str = Field("manual", max_length=40)
    commit_sha: str = Field("", max_length=64)
    branch: str = Field("main", max_length=120)
    author: str = Field("", max_length=80)
    message: str = Field("", max_length=300)
    duration_s: Optional[int] = Field(None, ge=0)
    url: str = Field("", max_length=400)
    logs: str = Field("", max_length=50000)
    rollback_url: str = Field("", max_length=400)
    deployed_at: Optional[str] = None


class ResourceIn(BaseModel):
    project_id: str
    type: Literal["vps", "cloud", "container", "pm2", "postgres", "mysql", "redis", "volume"]
    name: str = Field(min_length=1, max_length=120)
    provider: str = Field("", max_length=60)
    region: str = Field("", max_length=60)
    host: str = Field("", max_length=200)
    status: Literal["running", "degraded", "down", "unknown"] = "unknown"
    thresholds: Thresholds = Thresholds()
    notes: str = Field("", max_length=2000)


class DomainIn(BaseModel):
    project_id: str
    domain: str = Field(min_length=3, max_length=253, pattern=r"^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
    registrar: str = Field("", max_length=60)
    dns_provider: str = Field("", max_length=60)
    auto_renew: bool = True


class JobIn(BaseModel):
    project_id: str
    name: str = Field(min_length=1, max_length=120)
    queue: str = Field("", max_length=60)
    schedule: str = Field("", max_length=60)
    status: Literal["active", "paused", "failing"] = "active"
    notes: str = Field("", max_length=1000)


class MonitorIn(BaseModel):
    project_id: str
    name: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=8, max_length=400, pattern=r"^https?://")
    interval_min: int = Field(15, ge=15, le=1440)


class RevenueIn(BaseModel):
    project_id: str
    month: str = Field(pattern=MONTH)
    amount: float = Field(ge=0, le=10_000_000)
    type: Literal["mrr", "one_time"] = "mrr"
    note: str = Field("", max_length=200)


class ExpenseIn(BaseModel):
    project_id: str
    month: str = Field(pattern=MONTH)
    amount: float = Field(ge=0, le=10_000_000)
    category: Literal["hosting", "api", "tools", "marketing", "other"] = "hosting"
    vendor: str = Field("", max_length=80)


class CustomerIn(BaseModel):
    project_id: str
    name: str = Field(min_length=1, max_length=120)
    plan: str = Field("", max_length=60)
    mrr: float = Field(0, ge=0, le=1_000_000)
    status: Literal["active", "trial", "churned"] = "active"
    started_at: Optional[date] = None


def patch_model(model):
    return create_model(f"{model.__name__}Patch", **{k: (Optional[f.annotation], None) for k, f in model.model_fields.items() if k != "project_id"})


KINDS = {
    "deployments": ("deployments", DeploymentIn, "message"),
    "resources": ("resources", ResourceIn, "name"),
    "domains": ("domains", DomainIn, "domain"),
    "jobs": ("jobs", JobIn, "name"),
    "monitors": ("monitors", MonitorIn, "name"),
    "revenue": ("revenue_records", RevenueIn, "month"),
    "expenses": ("expense_records", ExpenseIn, "vendor"),
    "customers": ("customers", CustomerIn, "name"),
}
PATCHES = {k: patch_model(v[1]) for k, v in KINDS.items()}


def validate(model, body):
    try:
        obj = model.model_validate(body)
    except ValidationError as e:
        raise HTTPException(422, json.loads(e.json(include_url=False, include_context=False)))
    patch = model.__name__.endswith("Patch")
    data = obj.model_dump(exclude_unset=patch, exclude_none=patch)
    return {k: (v.isoformat() if isinstance(v, date) else v) for k, v in data.items()}


async def live_projects():
    return {p["id"]: p for p in await db.projects.find({"deleted_at": None}, {"_id": 0}).to_list(500)}


async def raise_alert(project_id, type_, severity, title, detail, source, key):
    if await db.alerts.find_one({"key": key, "acknowledged": False}):
        return False
    await db.alerts.insert_one({"id": new_id("alr"), "key": key, "project_id": project_id, "type": type_, "severity": severity,
                                "title": title, "detail": detail, "link": None, "source": source, "acknowledged": False, "created_at": iso()})
    p = await db.projects.find_one({"id": project_id}, {"_id": 0, "notification_rules": 1, "name": 1})
    rule = RULE_FOR.get(type_)
    if p and (rule is None or (p.get("notification_rules") or {}).get(rule, True)):
        note = {"id": new_id("ntf"), "project_id": project_id, "severity": severity, "title": title,
                "body": f"{p['name']}: {detail}", "source": source, "read": False, "channel": "in_app", "created_at": iso()}
        await db.notifications.insert_one(dict(note))
        from emailer import maybe_email
        await maybe_email(note, p["name"], detail)
    return True


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def new_ingest_key() -> str:
    return "fos_ing_" + secrets.token_urlsafe(28)


async def evaluate_resource(r: dict, source: str):
    m, t = r.get("metrics") or {}, r.get("thresholds") or {}
    for k in ("cpu", "ram", "disk"):
        if m.get(k) is not None and m[k] >= t.get(k, 90):
            await raise_alert(r["project_id"], "resource_threshold", "medium" if m[k] < 95 else "high", f"{k.upper()} at {m[k]:.0f}% on {r['name']}",
                              f"Threshold {t.get(k, 90):.0f}% exceeded", source, f"res:{r['id']}:{k}")
    if r.get("status") == "down":
        await raise_alert(r["project_id"], "resource_down", "critical", f"{r['name']} is down", f"{r['type']} reported down", source, f"res:{r['id']}:down")


class IngestLog(BaseModel):
    level: Literal["debug", "info", "warn", "error", "fatal"] = "info"
    service: str = Field("app", max_length=60)
    environment: Env = "production"
    message: str = Field(min_length=1, max_length=5000)


class IngestError(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    level: Literal["warning", "error", "fatal"] = "error"
    service: str = Field("app", max_length=60)
    environment: Env = "production"
    stack: str = Field("", max_length=20000)


class IngestMetric(BaseModel):
    endpoint: str = Field(min_length=1, max_length=200)
    environment: Env = "production"
    p50: float = Field(ge=0)
    p95: float = Field(ge=0)
    p99: float = Field(ge=0)
    rpm: float = Field(ge=0)
    error_rate: float = Field(0, ge=0, le=100)


class IngestResource(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: Literal["vps", "cloud", "container", "pm2", "postgres", "mysql", "redis", "volume"]
    status: Literal["running", "degraded", "down", "unknown"] = "running"
    cpu: Optional[float] = Field(None, ge=0, le=100)
    ram: Optional[float] = Field(None, ge=0, le=100)
    disk: Optional[float] = Field(None, ge=0, le=100)
    net_mbps: Optional[float] = Field(None, ge=0)
    connections: Optional[int] = Field(None, ge=0)
    restarts: Optional[int] = Field(None, ge=0)


class IngestJob(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    status: Literal["success", "failed"]
    duration_s: Optional[float] = Field(None, ge=0)


IngestDeployment = create_model("IngestDeployment", **{k: (f.annotation, f) for k, f in DeploymentIn.model_fields.items() if k != "project_id"})
INGEST = {"logs": IngestLog, "errors": IngestError, "metrics": IngestMetric, "resource": IngestResource,
          "deployment": IngestDeployment, "job": IngestJob}
IngestBatch = List
