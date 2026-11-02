from datetime import date, timedelta
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from core import audit, db, get_current_user, iso, log_event, new_id, now, require_owner, slugify

router = APIRouter(prefix="/api")

Stage = Literal["idea", "planning", "development", "testing", "staging", "production", "maintenance", "archived"]
Priority = Literal["urgent", "high", "medium", "low"]
TaskStatus = Literal["backlog", "in_progress", "review", "completed", "blocked"]
PRIORITY_WEIGHT = {"urgent": 40, "high": 25, "medium": 12, "low": 4}
SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
DEV_STAGES = {"development", "testing", "staging"}
PROD_STAGES = {"production", "maintenance"}


class DevInfo(BaseModel):
    repo: str = Field("", max_length=200)
    branch: str = Field("main", max_length=100)
    stack: List[str] = []
    framework: str = Field("", max_length=100)
    database: str = Field("", max_length=100)
    architecture_notes: str = Field("", max_length=5000)


class ProdInfo(BaseModel):
    production_url: str = Field("", max_length=300)
    preview_url: str = Field("", max_length=300)
    backend_url: str = Field("", max_length=300)
    hosting_provider: str = Field("", max_length=100)
    deployment_provider: str = Field("", max_length=100)
    environment_notes: str = Field("", max_length=3000)
    monitoring_notes: str = Field("", max_length=3000)


class BizInfo(BaseModel):
    revenue_model: str = Field("", max_length=100)
    monthly_revenue: float = Field(0, ge=0)
    monthly_expenses: float = Field(0, ge=0)
    subscriptions: int = Field(0, ge=0)
    customers: int = Field(0, ge=0)


class NotifyRules(BaseModel):
    failed_deployments: bool = True
    downtime: bool = True
    error_spikes: bool = True
    blocked_tasks: bool = False


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    slug: Optional[str] = Field(None, max_length=60)
    description: str = Field("", max_length=1000)
    logo_url: str = Field("", max_length=500)
    category: str = Field("", max_length=60)
    priority: Priority = "medium"
    stage: Stage = "idea"
    tags: List[str] = []
    dev: DevInfo = DevInfo()
    prod: ProdInfo = ProdInfo()
    business: BizInfo = BizInfo()


class ProviderLinks(BaseModel):
    vercel_project_id: str = Field("", max_length=100)
    railway_service_id: str = Field("", max_length=100)
    sentry_project: str = Field("", max_length=100)
    posthog_project_id: str = Field("", max_length=100)


class ProjectPatch(BaseModel):
    links: Optional[ProviderLinks] = None
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    slug: Optional[str] = Field(None, max_length=60)
    description: Optional[str] = Field(None, max_length=1000)
    logo_url: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = Field(None, max_length=60)
    priority: Optional[Priority] = None
    stage: Optional[Stage] = None
    tags: Optional[List[str]] = None
    dev: Optional[DevInfo] = None
    prod: Optional[ProdInfo] = None
    business: Optional[BizInfo] = None
    notification_rules: Optional[NotifyRules] = None


class ConfirmIn(BaseModel):
    confirm_name: str


class BulkIn(BaseModel):
    ids: List[str] = Field(min_length=1, max_length=100)
    action: Literal["stage", "priority", "archive"]
    value: Optional[str] = None


async def unique_slug(base: str, exclude_id: str = None) -> str:
    slug, i = slugify(base), 2
    root = slug
    while await db.projects.find_one({"slug": slug, "id": {"$ne": exclude_id}}):
        slug, i = f"{root}-{i}", i + 1
    return slug


async def get_project_or_404(pid: str) -> dict:
    p = await db.projects.find_one({"$or": [{"id": pid}, {"slug": pid}]}, {"_id": 0, "ingest_key_hash": 0})
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@router.get("/projects")
async def list_projects(deleted: bool = False, stage: Optional[str] = None, limit: int = Query(200, le=500), skip: int = 0, user=Depends(get_current_user)):
    q = {"deleted_at": {"$ne": None}} if deleted else {"deleted_at": None}
    if stage:
        q["stage"] = stage
    total = await db.projects.count_documents(q)
    items = await db.projects.find(q, {"_id": 0, "ingest_key_hash": 0}).sort("name", 1).skip(skip).limit(limit).to_list(limit)
    open_alerts = await db.alerts.aggregate([{"$match": {"acknowledged": False}}, {"$group": {"_id": "$project_id", "n": {"$sum": 1}}}]).to_list(1000)
    counts = {a["_id"]: a["n"] for a in open_alerts}
    for p in items:
        p["open_alerts"] = counts.get(p["id"], 0)
    return {"items": items, "total": total}


@router.post("/projects")
async def create_project(body: ProjectIn, request: Request, user=Depends(require_owner)):
    doc = body.model_dump()
    doc.update({
        "id": new_id("prj"), "slug": await unique_slug(body.slug or body.name), "source": "manual",
        "telemetry": None, "github_repo": None, "notification_rules": NotifyRules().model_dump(),
        "previous_stage": None, "deleted_at": None, "created_at": iso(), "updated_at": iso(), "last_activity_at": iso(),
    })
    await db.projects.insert_one(dict(doc))
    await log_event(doc["id"], "project", f"Project {doc['name']} created")
    await audit(user, "project.create", doc["id"], doc["name"], request)
    return doc


@router.get("/projects/{pid}")
async def get_project(pid: str, user=Depends(get_current_user)):
    return await get_project_or_404(pid)


@router.patch("/projects/{pid}")
async def update_project(pid: str, body: ProjectPatch, request: Request, user=Depends(require_owner)):
    p = await get_project_or_404(pid)
    upd = body.model_dump(exclude_unset=True)
    if upd.get("slug"):
        upd["slug"] = await unique_slug(upd["slug"], p["id"])
    else:
        upd.pop("slug", None)
    if upd.get("stage") == "archived" and p["stage"] != "archived":
        upd["previous_stage"] = p["stage"]
    upd["updated_at"] = iso()
    await db.projects.update_one({"id": p["id"]}, {"$set": upd})
    changed = ", ".join(k for k in upd if k != "updated_at")
    if "stage" in upd and upd["stage"] != p["stage"]:
        await log_event(p["id"], "project", f"{p['name']} moved from {p['stage']} to {upd['stage']}")
    else:
        await log_event(p["id"], "project", f"{p['name']} updated ({changed})")
    await audit(user, "project.update", p["id"], changed, request)
    return await get_project_or_404(p["id"])


@router.post("/projects/bulk")
async def bulk_projects(body: BulkIn, request: Request, user=Depends(require_owner)):
    if body.action == "archive":
        projects = await db.projects.find({"id": {"$in": body.ids}, "stage": {"$ne": "archived"}}, {"_id": 0}).to_list(100)
        for p in projects:
            await db.projects.update_one({"id": p["id"]}, {"$set": {"stage": "archived", "previous_stage": p["stage"], "updated_at": iso()}})
    else:
        allowed = Stage.__args__ if body.action == "stage" else Priority.__args__
        if body.value not in allowed:
            raise HTTPException(422, f"Invalid {body.action}")
        await db.projects.update_many({"id": {"$in": body.ids}}, {"$set": {body.action: body.value, "updated_at": iso()}})
    await audit(user, f"project.bulk_{body.action}", ",".join(body.ids), body.value or "", request)
    return {"ok": True, "count": len(body.ids)}


@router.post("/projects/{pid}/delete")
async def delete_project(pid: str, body: ConfirmIn, request: Request, user=Depends(require_owner)):
    p = await get_project_or_404(pid)
    if body.confirm_name.strip() != p["name"]:
        raise HTTPException(400, "Confirmation name does not match the project name")
    await db.projects.update_one({"id": p["id"]}, {"$set": {"deleted_at": iso()}})
    await log_event(p["id"], "project", f"{p['name']} moved to trash")
    await audit(user, "project.delete", p["id"], p["name"], request)
    return {"ok": True}


@router.post("/projects/{pid}/restore")
async def restore_project(pid: str, request: Request, user=Depends(require_owner)):
    p = await get_project_or_404(pid)
    upd = {"updated_at": iso()}
    if p.get("deleted_at"):
        upd["deleted_at"] = None
    elif p["stage"] == "archived":
        upd["stage"] = p.get("previous_stage") or "maintenance"
    else:
        raise HTTPException(400, "Project is neither archived nor deleted")
    await db.projects.update_one({"id": p["id"]}, {"$set": upd})
    await log_event(p["id"], "project", f"{p['name']} restored")
    await audit(user, "project.restore", p["id"], p["name"], request)
    return await get_project_or_404(p["id"])


# ---------- Tasks ----------
class TaskIn(BaseModel):
    project_id: str
    title: str = Field(min_length=1, max_length=200)
    description: str = Field("", max_length=5000)
    status: TaskStatus = "backlog"
    priority: Priority = "medium"
    due_date: Optional[date] = None
    start_date: Optional[date] = None
    labels: List[str] = []
    assignee: str = Field("", max_length=80)
    effort: Optional[float] = Field(None, ge=0, le=999)
    dependencies: List[str] = []
    milestone_id: Optional[str] = None


class TaskPatch(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=5000)
    status: Optional[TaskStatus] = None
    priority: Optional[Priority] = None
    due_date: Optional[date] = None
    start_date: Optional[date] = None
    labels: Optional[List[str]] = None
    assignee: Optional[str] = Field(None, max_length=80)
    effort: Optional[float] = Field(None, ge=0, le=999)
    dependencies: Optional[List[str]] = None
    milestone_id: Optional[str] = None


def task_doc(d: dict) -> dict:
    for k in ("due_date", "start_date"):
        if isinstance(d.get(k), date):
            d[k] = d[k].isoformat()
    return d


@router.get("/tasks")
async def list_tasks(project_id: Optional[str] = None, status: Optional[str] = None, user=Depends(get_current_user)):
    q = {"deleted_at": None}
    if project_id:
        q["project_id"] = project_id
    else:
        live = await db.projects.distinct("id", {"deleted_at": None})
        q["project_id"] = {"$in": live}
    if status:
        q["status"] = status
    return await db.tasks.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)


@router.post("/tasks")
async def create_task(body: TaskIn, request: Request, user=Depends(require_owner)):
    p = await get_project_or_404(body.project_id)
    if p.get("deleted_at"):
        raise HTTPException(400, "Project is in trash")
    doc = task_doc(body.model_dump())
    doc.update({"id": new_id("tsk"), "project_id": p["id"], "source": "manual", "deleted_at": None, "created_at": iso(), "updated_at": iso(), "completed_at": None})
    await db.tasks.insert_one(dict(doc))
    await log_event(p["id"], "task", f"Task created: {doc['title']}")
    await audit(user, "task.create", doc["id"], doc["title"], request)
    return doc


@router.patch("/tasks/{tid}")
async def update_task(tid: str, body: TaskPatch, request: Request, user=Depends(require_owner)):
    t = await db.tasks.find_one({"id": tid, "deleted_at": None}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Task not found")
    upd = task_doc(body.model_dump(exclude_unset=True))
    if tid in (upd.get("dependencies") or []):
        raise HTTPException(422, "A task cannot depend on itself")
    if upd.get("status") == "completed" and t["status"] != "completed":
        upd["completed_at"] = iso()
    elif "status" in upd and upd["status"] != "completed":
        upd["completed_at"] = None
    upd["updated_at"] = iso()
    await db.tasks.update_one({"id": tid}, {"$set": upd})
    if "status" in upd and upd["status"] != t["status"]:
        await log_event(t["project_id"], "task", f"{t['title']}: {t['status']} → {upd['status']}")
    await audit(user, "task.update", tid, ", ".join(upd), request)
    return await db.tasks.find_one({"id": tid}, {"_id": 0})


@router.delete("/tasks/{tid}")
async def delete_task(tid: str, request: Request, user=Depends(require_owner)):
    t = await db.tasks.find_one({"id": tid, "deleted_at": None}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Task not found")
    await db.tasks.update_one({"id": tid}, {"$set": {"deleted_at": iso()}})
    await db.tasks.update_many({"dependencies": tid}, {"$pull": {"dependencies": tid}})
    await log_event(t["project_id"], "task", f"Task deleted: {t['title']}")
    await audit(user, "task.delete", tid, t["title"], request)
    return {"ok": True}


def rank_task(t: dict, blocking: int, today: str) -> float:
    score = PRIORITY_WEIGHT[t["priority"]] + blocking * 10
    if t.get("due_date"):
        days = (date.fromisoformat(t["due_date"]) - date.fromisoformat(today)).days
        score += 30 if days < 0 else 20 if days == 0 else max(0, 14 - days)
    if t["status"] == "in_progress":
        score += 6
    return score


async def ranked_open_tasks():
    projects = {p["id"]: p for p in await db.projects.find({"deleted_at": None, "stage": {"$ne": "archived"}}, {"_id": 0}).to_list(500)}
    tasks = await db.tasks.find({"deleted_at": None, "status": {"$ne": "completed"}, "project_id": {"$in": list(projects)}}, {"_id": 0}).to_list(3000)
    blocking = {}
    for t in tasks:
        for d in t.get("dependencies", []):
            blocking[d] = blocking.get(d, 0) + 1
    today = date.today().isoformat()
    for t in tasks:
        t["blocks_count"] = blocking.get(t["id"], 0)
        t["score"] = rank_task(t, t["blocks_count"], today)
        t["project_name"] = projects[t["project_id"]]["name"]
    tasks.sort(key=lambda x: -x["score"])
    return tasks, today


@router.get("/today")
async def today_view(user=Depends(get_current_user)):
    tasks, today = await ranked_open_tasks()
    groups = {"overdue": [], "due_today": [], "blocked": [], "up_next": []}
    for t in tasks:
        if t["status"] == "blocked":
            groups["blocked"].append(t)
        elif t.get("due_date") and t["due_date"] < today:
            groups["overdue"].append(t)
        elif t.get("due_date") == today:
            groups["due_today"].append(t)
        else:
            groups["up_next"].append(t)
    groups["up_next"] = groups["up_next"][:15]
    top = next((t for t in tasks if t["status"] != "blocked"), None)
    return {"date": today, "next_action": top, **groups}


# ---------- Milestones ----------
class MilestoneIn(BaseModel):
    project_id: str
    title: str = Field(min_length=1, max_length=150)
    description: str = Field("", max_length=3000)
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    status: Literal["planned", "active", "completed"] = "planned"
    depends_on: List[str] = []
    release: str = Field("", max_length=40)


class MilestonePatch(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=150)
    description: Optional[str] = Field(None, max_length=3000)
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    status: Optional[Literal["planned", "active", "completed"]] = None
    depends_on: Optional[List[str]] = None
    release: Optional[str] = Field(None, max_length=40)


@router.get("/milestones")
async def list_milestones(project_id: Optional[str] = None, user=Depends(get_current_user)):
    live = await db.projects.find({"deleted_at": None}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    names = {p["id"]: p["name"] for p in live}
    q = {"deleted_at": None, "project_id": project_id if project_id else {"$in": list(names)}}
    items = await db.milestones.find(q, {"_id": 0}).sort("due_date", 1).to_list(1000)
    agg = await db.tasks.aggregate([
        {"$match": {"deleted_at": None, "milestone_id": {"$in": [m["id"] for m in items]}}},
        {"$group": {"_id": "$milestone_id", "total": {"$sum": 1}, "done": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}}}},
    ]).to_list(1000)
    stats = {a["_id"]: a for a in agg}
    for m in items:
        s = stats.get(m["id"], {"total": 0, "done": 0})
        m.update({"task_total": s["total"], "task_done": s["done"], "project_name": names.get(m["project_id"])})
        m["progress"] = round(100 * s["done"] / s["total"]) if s["total"] else (100 if m["status"] == "completed" else 0)
    return items


@router.post("/milestones")
async def create_milestone(body: MilestoneIn, request: Request, user=Depends(require_owner)):
    p = await get_project_or_404(body.project_id)
    doc = task_doc(body.model_dump())
    doc.update({"id": new_id("mil"), "project_id": p["id"], "deleted_at": None, "created_at": iso()})
    await db.milestones.insert_one(dict(doc))
    await log_event(p["id"], "milestone", f"Milestone planned: {doc['title']}")
    await audit(user, "milestone.create", doc["id"], doc["title"], request)
    return doc


@router.patch("/milestones/{mid}")
async def update_milestone(mid: str, body: MilestonePatch, request: Request, user=Depends(require_owner)):
    m = await db.milestones.find_one({"id": mid, "deleted_at": None}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Milestone not found")
    upd = task_doc(body.model_dump(exclude_unset=True))
    await db.milestones.update_one({"id": mid}, {"$set": upd})
    if upd.get("status") == "completed" and m["status"] != "completed":
        await log_event(m["project_id"], "milestone", f"Milestone completed: {m['title']}")
    await audit(user, "milestone.update", mid, ", ".join(upd), request)
    return await db.milestones.find_one({"id": mid}, {"_id": 0})


@router.delete("/milestones/{mid}")
async def delete_milestone(mid: str, request: Request, user=Depends(require_owner)):
    m = await db.milestones.find_one({"id": mid, "deleted_at": None}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Milestone not found")
    await db.milestones.update_one({"id": mid}, {"$set": {"deleted_at": iso()}})
    await db.tasks.update_many({"milestone_id": mid}, {"$set": {"milestone_id": None}})
    await audit(user, "milestone.delete", mid, m["title"], request)
    return {"ok": True}


# ---------- Documents ----------
DocCategory = Literal["architecture", "api", "schema", "deployment", "runbook", "other"]


class DocIn(BaseModel):
    project_id: str
    title: str = Field(min_length=1, max_length=150)
    category: DocCategory = "other"
    content: str = Field("", max_length=100000)


class DocPatch(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=150)
    category: Optional[DocCategory] = None
    content: Optional[str] = Field(None, max_length=100000)


@router.get("/documents")
async def list_documents(project_id: Optional[str] = None, user=Depends(get_current_user)):
    live = await db.projects.find({"deleted_at": None}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    names = {p["id"]: p["name"] for p in live}
    q = {"deleted_at": None, "project_id": project_id if project_id else {"$in": list(names)}}
    items = await db.documents.find(q, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    for d in items:
        d["project_name"] = names.get(d["project_id"])
    return items


@router.post("/documents")
async def create_document(body: DocIn, request: Request, user=Depends(require_owner)):
    p = await get_project_or_404(body.project_id)
    doc = body.model_dump() | {"id": new_id("doc"), "project_id": p["id"], "source": "manual", "deleted_at": None, "created_at": iso(), "updated_at": iso()}
    await db.documents.insert_one(dict(doc))
    await log_event(p["id"], "doc", f"Doc created: {doc['title']}")
    await audit(user, "doc.create", doc["id"], doc["title"], request)
    return doc


@router.patch("/documents/{did}")
async def update_document(did: str, body: DocPatch, request: Request, user=Depends(require_owner)):
    d = await db.documents.find_one({"id": did, "deleted_at": None}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Document not found")
    upd = body.model_dump(exclude_unset=True) | {"updated_at": iso()}
    await db.documents.update_one({"id": did}, {"$set": upd})
    await log_event(d["project_id"], "doc", f"Doc updated: {upd.get('title', d['title'])}")
    await audit(user, "doc.update", did, d["title"], request)
    return await db.documents.find_one({"id": did}, {"_id": 0})


@router.delete("/documents/{did}")
async def delete_document(did: str, request: Request, user=Depends(require_owner)):
    d = await db.documents.find_one({"id": did, "deleted_at": None}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Document not found")
    await db.documents.update_one({"id": did}, {"$set": {"deleted_at": iso()}})
    await audit(user, "doc.delete", did, d["title"], request)
    return {"ok": True}


# ---------- Activity, attention, dashboard ----------
@router.get("/activity")
async def activity(project_id: Optional[str] = None, type: Optional[str] = None, limit: int = Query(50, le=200), skip: int = 0, user=Depends(get_current_user)):
    live = await db.projects.find({"deleted_at": None}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    names = {p["id"]: p["name"] for p in live}
    q = {"project_id": project_id if project_id else {"$in": list(names)}}
    if type:
        q["type"] = type
    total = await db.events.count_documents(q)
    items = await db.events.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    for e in items:
        e["project_name"] = names.get(e["project_id"])
    return {"items": items, "total": total}


async def collect_alerts(include_acknowledged=False):
    projects = {p["id"]: p for p in await db.projects.find({"deleted_at": None, "stage": {"$ne": "archived"}}, {"_id": 0}).to_list(500)}
    q = {"project_id": {"$in": list(projects)}}
    if not include_acknowledged:
        q["acknowledged"] = False
    alerts = await db.alerts.find(q, {"_id": 0}).to_list(1000)
    blocked = await db.tasks.find({"deleted_at": None, "status": "blocked", "project_id": {"$in": list(projects)}}, {"_id": 0}).to_list(500)
    for t in blocked:
        alerts.append({
            "id": f"blocked_{t['id']}", "project_id": t["project_id"], "type": "blocked_task",
            "severity": "high" if t["priority"] in ("urgent", "high") else "medium",
            "title": f"Blocked: {t['title']}", "detail": "Task is marked blocked. Resolve its dependency or unblock it.",
            "source": "live", "acknowledged": False, "created_at": t.get("updated_at"), "task_id": t["id"],
        })
    for a in alerts:
        a["project_name"] = projects[a["project_id"]]["name"]
        a["project_slug"] = projects[a["project_id"]]["slug"]
    alerts.sort(key=lambda a: a.get("created_at") or "", reverse=True)
    alerts.sort(key=lambda a: (a.get("acknowledged", False), SEVERITY_RANK.get(a["severity"], 9)))
    return alerts


@router.get("/attention")
async def attention(include_acknowledged: bool = False, user=Depends(get_current_user)):
    return await collect_alerts(include_acknowledged)


@router.post("/attention/{aid}/ack")
async def ack_alert(aid: str, request: Request, user=Depends(require_owner)):
    res = await db.alerts.update_one({"id": aid}, {"$set": {"acknowledged": True, "acknowledged_at": iso()}})
    if not res.matched_count:
        raise HTTPException(404, "Alert not found or not acknowledgeable")
    await audit(user, "alert.ack", aid, "", request)
    return {"ok": True}


def month_keys(n=6):
    d = date.today().replace(day=1)
    keys = []
    for _ in range(n):
        keys.append(d.strftime("%Y-%m"))
        d = (d - timedelta(days=1)).replace(day=1)
    return list(reversed(keys))


@router.get("/dashboard")
async def dashboard(user=Depends(get_current_user)):
    projects = await db.projects.find({"deleted_at": None}, {"_id": 0}).to_list(500)
    active = [p for p in projects if p["stage"] != "archived"]
    alerts = await collect_alerts()
    attention_ids = {a["project_id"] for a in alerts if a["severity"] in ("critical", "high")}
    attention_ids |= {p["id"] for p in active if (p.get("telemetry") or {}).get("health") in ("down", "degraded")}
    months = month_keys()
    count_trend = [sum(1 for p in active if p["created_at"][:7] <= m) for m in months]
    prod_trend = [sum(1 for p in active if p["stage"] in PROD_STAGES and p["created_at"][:7] <= m) for m in months]
    dev_trend = [sum(1 for p in active if p["stage"] in DEV_STAGES and p["created_at"][:7] <= m) for m in months]
    mrr_trend = [round(sum((p["business"].get("revenue_history") or {}).get(m, 0) for p in active), 2) for m in months]
    mrr = round(sum(p["business"].get("monthly_revenue", 0) for p in active), 2)
    if mrr_trend and not any(mrr_trend):
        mrr_trend[-1] = mrr
    tasks, _ = await ranked_open_tasks()
    top_task = next((t for t in tasks if t["status"] != "blocked"), None)
    critical = next((a for a in alerts if a["severity"] == "critical"), None)
    next_action = {"kind": "alert", "item": critical} if critical else ({"kind": "task", "item": top_task} if top_task else None)
    return {
        "kpis": {
            "total": {"value": len(active), "trend": count_trend},
            "production": {"value": sum(1 for p in active if p["stage"] in PROD_STAGES), "trend": prod_trend},
            "development": {"value": sum(1 for p in active if p["stage"] in DEV_STAGES), "trend": dev_trend},
            "attention": {"value": len(attention_ids), "trend": None},
            "mrr": {"value": mrr, "trend": mrr_trend, "months": months},
        },
        "next_action": next_action,
        "alert_count": len(alerts),
    }


@router.get("/search")
async def search(q: str = Query(min_length=1, max_length=100), user=Depends(get_current_user)):
    import re
    rx = {"$regex": re.escape(q), "$options": "i"}
    projects = await db.projects.find({"deleted_at": None, "$or": [{"name": rx}, {"slug": rx}, {"tags": rx}]}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "stage": 1}).to_list(10)
    live = await db.projects.distinct("id", {"deleted_at": None})
    tasks = await db.tasks.find({"deleted_at": None, "title": rx, "project_id": {"$in": live}}, {"_id": 0, "id": 1, "title": 1, "project_id": 1, "status": 1}).to_list(10)
    docs = await db.documents.find({"deleted_at": None, "title": rx, "project_id": {"$in": live}}, {"_id": 0, "id": 1, "title": 1, "project_id": 1}).to_list(10)
    return {"projects": projects, "tasks": tasks, "documents": docs}


@router.get("/audit-logs")
async def audit_logs(limit: int = Query(50, le=200), user=Depends(require_owner)):
    return await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)


@router.get("/workspace/welcome")
async def welcome_state(user=Depends(get_current_user)):
    s = await db.settings.find_one({"key": "welcome"}, {"_id": 0})
    sample = await db.projects.count_documents({"source": "sample"})
    return {"show": not (s and s.get("dismissed")), "sample_projects": sample}


class WelcomeIn(BaseModel):
    action: Literal["keep", "clear"]


@router.post("/workspace/welcome")
async def welcome_action(body: WelcomeIn, request: Request, user=Depends(require_owner)):
    if body.action == "clear":
        ids = await db.projects.distinct("id", {"source": "sample"})
        for coll in ("tasks", "milestones", "documents", "events", "alerts", "deployments", "resources", "domains", "jobs", "monitors", "logs", "errors", "api_metrics", "revenue_records", "expense_records", "customers", "notifications"):
            await db[coll].delete_many({"project_id": {"$in": ids}})
        await db.projects.delete_many({"id": {"$in": ids}, "source": "sample"})
    await db.settings.update_one({"key": "welcome"}, {"$set": {"key": "welcome", "dismissed": True, "sample_choice": body.action, "at": iso()}}, upsert=True)
    await audit(user, f"workspace.sample_{body.action}", "", "", request)
    return {"ok": True}
