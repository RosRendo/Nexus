import random
from datetime import date, timedelta

from core import db, iso, new_id, now

STACK = """Traceback (most recent call last):
  File "/app/api/generate.py", line 88, in handle
    result = await provider.complete(prompt, timeout=30)
  File "/app/lib/llm.py", line 41, in complete
    raise UpstreamTimeout(f"provider timed out after {timeout}s")
lib.llm.UpstreamTimeout: provider timed out after 30s"""
JS_STACK = """TypeError: Cannot read properties of undefined (reading 'pool')
    at getClient (/srv/app/db/index.ts:22:17)
    at async listThreads (/srv/app/routes/inbox.ts:51:9)
    at async /srv/app/server.ts:118:5"""


async def seed_ops():
    if await db.settings.find_one({"key": "seed_ops"}):
        return
    projects = await db.projects.find({"source": "sample", "telemetry": {"$ne": None}}, {"_id": 0}).to_list(50)
    if not projects:
        return
    rnd = random.Random(42)
    t0 = now()
    base = dict(source="sample", deleted_at=None, created_at=iso())
    for i, p in enumerate(projects):
        pid, tel, prov = p["id"], p["telemetry"], p["prod"].get("deployment_provider") or "docker"
        for k in range(6):
            failed = (k == 0 and tel["deployment_status"] == "failed") or (k == 3 and i % 3 == 0)
            sha = "%040x" % rnd.getrandbits(160)
            logs = "\n".join([f"[{k}] Cloning repository…", "Installing dependencies (pnpm 9)", "Running build", "ERROR: node-gyp rebuild failed (exit 1)" if failed else "Build completed", "Deployment failed" if failed else "Deployment ready"])
            await db.deployments.insert_one({"id": new_id("dep"), "project_id": pid, "environment": "production" if k % 3 else "preview", "status": "failed" if failed else "success",
                                             "provider": prov.lower(), "commit_sha": sha, "branch": "main" if k % 3 else f"feat/{rnd.choice(['billing', 'search', 'auth'])}",
                                             "author": "you", "message": rnd.choice(["Fix flaky test", "Bump deps", "Add rate limits", "Improve caching", "Refactor billing"]),
                                             "duration_s": rnd.randint(60, 300), "url": "", "logs": logs, "rollback_url": "", "deployed_at": iso(t0 - timedelta(hours=3 + k * 19 + i * 5)), **base})
        host = p["prod"].get("hosting_provider") or "Hetzner"
        for typ, name, cpu in [("vps" if "VPS" in host or "Hetzner" in host or "Ocean" in host else "cloud", f"{p['slug']}-web-1", 40 + rnd.randint(0, 50)),
                               ("postgres" if "Postgre" in (p["dev"].get("database") or "") else "mysql", f"{p['slug']}-db", 20 + rnd.randint(0, 40)),
                               ("redis", f"{p['slug']}-cache", 5 + rnd.randint(0, 20)), ("container", f"{p['slug']}-worker", 30 + rnd.randint(0, 60))]:
            status = "down" if tel["health"] == "down" and typ != "redis" and name.endswith("web-1") else "degraded" if tel["health"] == "degraded" and typ in ("postgres", "mysql") else "running"
            await db.resources.insert_one({"id": new_id("res"), "project_id": pid, "type": typ, "name": name, "provider": host, "region": rnd.choice(["fra1", "iad1", "sfo3"]), "host": "",
                                           "status": status, "thresholds": {"cpu": 85, "ram": 90, "disk": 90}, "notes": "",
                                           "metrics": {"cpu": cpu, "ram": 30 + rnd.randint(0, 55), "disk": 20 + rnd.randint(0, 60), "net_mbps": round(rnd.uniform(0.5, 40), 1),
                                                       "connections": rnd.randint(4, 100) if typ in ("postgres", "mysql", "redis") else None, "uptime_pct": 99.2 + rnd.random() * 0.79},
                                           "metrics_source": "demo", "last_seen_at": iso(t0 - timedelta(minutes=rnd.randint(1, 9))), **base})
        if p["prod"].get("production_url") or p["prod"].get("preview_url"):
            dom = (p["prod"].get("production_url") or p["prod"]["preview_url"]).split("//")[1]
            days = 9 if p["slug"] == "lumen-analytics" else rnd.randint(30, 80)
            await db.domains.insert_one({"id": new_id("dom"), "project_id": pid, "domain": dom, "registrar": "Namecheap", "dns_provider": "Cloudflare", "auto_renew": True,
                                         "ssl": {"valid": True, "expires_at": iso(t0 + timedelta(days=days)), "issuer": "Let's Encrypt", "checked_at": iso(), "error": None}, "ssl_source": "demo", **base})
            hist = [{"t": iso(t0 - timedelta(minutes=15 * j)), "up": not (tel["health"] == "down" and j < 2), "ms": rnd.randint(80, 420), "code": 200} for j in range(40)][::-1]
            await db.monitors.insert_one({"id": new_id("mon"), "project_id": pid, "name": f"{p['name']} homepage", "url": f"https://{dom}", "interval_min": 15, "up": hist[-1]["up"],
                                          "last_status_code": 200 if hist[-1]["up"] else 503, "last_latency_ms": hist[-1]["ms"], "last_checked_at": hist[-1]["t"], "history": hist, **base})
        for jn, sched in [("send-digests", "0 * * * *"), ("sync-billing", "*/30 * * * *")]:
            fails = rnd.randint(0, 4) if tel["health"] != "healthy" else 0
            await db.jobs.insert_one({"id": new_id("job"), "project_id": pid, "name": jn, "queue": "default", "schedule": sched, "status": "failing" if fails > 2 else "active", "notes": "",
                                      "runs_24h": 24 if sched.startswith("0") else 48, "failures_24h": fails, "last_status": "failed" if fails > 2 else "success",
                                      "last_duration_s": round(rnd.uniform(0.4, 30), 1), "last_run_at": iso(t0 - timedelta(minutes=rnd.randint(2, 50))), "metrics_source": "demo", **base})
        for h in range(24):
            for ep in ["GET /api/projects", "POST /api/events", "GET /api/report"]:
                p95 = rnd.randint(90, 260) + (500 if tel["health"] == "degraded" and ep.startswith("POST") else 0)
                await db.api_metrics.insert_one({"id": new_id("met"), "project_id": pid, "endpoint": ep, "environment": "production", "p50": round(p95 * 0.45), "p95": p95, "p99": round(p95 * 1.8),
                                                 "rpm": rnd.randint(20, 400), "error_rate": round(rnd.uniform(0, 6 if tel["health"] == "degraded" else 0.8), 2), "recorded_at": iso(t0 - timedelta(hours=23 - h)), "source": "sample"})
        levels = ["info"] * 6 + ["warn"] * 2 + ["error"] * (3 if tel["errors_24h"] > 5 else 1)
        for j in range(30):
            lvl = rnd.choice(levels)
            msg = {"info": rnd.choice(["request completed 200 in 84ms", "user signed in", "job send-digests finished", "cache warmed"]),
                   "warn": rnd.choice(["slow query 1.8s on threads", "retrying webhook delivery (2/5)"]), "error": rnd.choice(["upstream timeout after 30s", "connection pool exhausted", "unhandled promise rejection"])}[lvl]
            await db.logs.insert_one({"id": new_id("log"), "project_id": pid, "level": lvl, "service": rnd.choice(["api", "worker", "web"]), "environment": rnd.choice(["production"] * 4 + ["staging"]),
                                      "message": msg, "created_at": iso(t0 - timedelta(minutes=rnd.randint(1, 1400))), "source": "sample"})
        if tel["errors_24h"]:
            for title, stack in [("UpstreamTimeout: provider timed out after 30s", STACK), ("TypeError: Cannot read properties of undefined (reading 'pool')", JS_STACK)][: 1 + (tel["errors_24h"] > 5)]:
                await db.errors.insert_one({"id": new_id("err"), "project_id": pid, "title": title, "level": "error", "service": "api", "environment": "production", "count": tel["errors_24h"] * rnd.randint(1, 4),
                                            "first_seen": iso(t0 - timedelta(days=rnd.randint(1, 9))), "last_seen": iso(t0 - timedelta(minutes=rnd.randint(3, 300))), "stack": stack, "status": "open", "source": "sample"})
        series = [{"date": (date.today() - timedelta(days=13 - d)).isoformat(), "users": max(0, int(tel["active_users"] * rnd.uniform(0.75, 1.1)))} for d in range(14)]
        await db.projects.update_one({"id": pid}, {"$set": {"analytics": {"source": "demo", "series": series}}})
        biz = p["business"]
        for m, amt in (biz.get("revenue_history") or {}).items():
            await db.revenue_records.insert_one({"id": new_id("rev"), "project_id": pid, "month": m, "amount": amt, "type": "mrr", "note": "", **base})
            for cat, share in [("hosting", 0.55), ("api", 0.3), ("tools", 0.15)]:
                await db.expense_records.insert_one({"id": new_id("exp"), "project_id": pid, "month": m, "amount": round(biz["monthly_expenses"] * share * rnd.uniform(0.85, 1.05), 2), "category": cat,
                                                     "vendor": {"hosting": host, "api": "OpenAI", "tools": "Linear"}[cat], **base})
        for c in range(min(4, biz.get("customers") or 0)):
            await db.customers.insert_one({"id": new_id("cus"), "project_id": pid, "name": rnd.choice(["Acme Co", "Northwind", "Globex", "Initech", "Umbrella", "Hooli", "Stark Labs"]) + f" {c + 1}",
                                           "plan": rnd.choice(["Starter", "Pro", "Team"]), "mrr": rnd.choice([19, 49, 99, 199]), "status": rnd.choice(["active"] * 4 + ["trial", "churned"]),
                                           "started_at": (date.today() - timedelta(days=rnd.randint(10, 300))).isoformat(), **base})
    await db.settings.insert_one({"key": "seed_ops", "at": iso()})
