from datetime import date, timedelta

from core import db, iso, new_id, now

# name, category, stage, priority, tags, framework, database, hosting, deploy, revenue, expenses, subs, customers, health, deploy_status, users, errors, description
PROJECTS = [
    ("Lumen Analytics", "SaaS", "production", "high", ["analytics", "b2b"], "Next.js", "PostgreSQL", "AWS EC2", "Vercel", 4200, 610, 86, 74, "healthy", "success", 1840, 3, "Privacy-first product analytics for indie SaaS."),
    ("Inkwell", "AI tool", "production", "urgent", ["ai", "writing"], "Remix", "PostgreSQL", "Railway", "Railway", 2850, 940, 212, 198, "degraded", "failed", 960, 48, "AI writing assistant for technical blogs."),
    ("Shipyard CLI", "Dev tool", "maintenance", "low", ["cli", "open-source"], "Go", "SQLite", "Hetzner VPS", "GitHub Actions", 380, 45, 31, 31, "healthy", "success", 220, 0, "Deploy static sites to any VPS with one command."),
    ("Relay Inbox", "SaaS", "staging", "high", ["email", "b2c"], "Next.js", "PostgreSQL", "Railway", "Vercel", 0, 120, 0, 0, "degraded", "success", 35, 7, "Shared inbox for small support teams."),
    ("Quill Docs", "SaaS", "development", "medium", ["docs"], "Astro", "MySQL", "DigitalOcean", "Docker", 0, 40, 0, 0, "healthy", "success", 0, 1, "Docs-as-code hosting for API companies."),
    ("Harbor Status", "SaaS", "testing", "medium", ["monitoring"], "SvelteKit", "PostgreSQL", "Fly.io", "Docker", 0, 25, 0, 0, "down", "failed", 0, 12, "Hosted status pages with incident timelines."),
    ("Pocket Ledger", "Mobile", "planning", "medium", ["fintech", "mobile"], "React Native", "Firebase", "", "", 0, 0, 0, 0, None, None, None, None, "Expense tracker for freelancers."),
    ("Nimbus Forms", "SaaS", "idea", "low", ["forms"], "", "", "", "", 0, 0, 0, 0, None, None, None, None, "Form builder with built-in spam scoring."),
    ("Orbit Notes", "Desktop", "archived", "low", ["notes"], "Electron", "SQLite", "", "", 0, 0, 0, 0, None, None, None, None, "Local-first notes app (sunset)."),
]

TASKS = {
    "Lumen Analytics": [("Renew SSL for api.lumen", "in_progress", "urgent", 1, ["ops"], 1), ("Funnel report export to CSV", "review", "medium", 4, ["feature"], 3), ("Reduce dashboard p95 latency", "backlog", "high", 9, ["perf"], 5), ("Onboarding checklist v2", "completed", "medium", -6, ["growth"], 3), ("Migrate cron jobs to queue", "backlog", "medium", 18, ["infra"], 8)],
    "Inkwell": [("Fix failed Railway build (node 22)", "in_progress", "urgent", 0, ["bug", "deploy"], 2), ("Investigate error spike in /generate", "blocked", "urgent", -1, ["bug"], 3), ("Rate-limit free tier", "backlog", "high", 3, ["billing"], 2), ("Prompt library", "completed", "medium", -10, ["feature"], 5), ("Team workspaces", "backlog", "medium", 25, ["feature"], 13)],
    "Shipyard CLI": [("Restore nightly backup job", "backlog", "high", -2, ["ops"], 1), ("Release v1.8.2", "review", "low", 6, ["release"], 1)],
    "Relay Inbox": [("Fix DB connection pool exhaustion", "in_progress", "urgent", 0, ["bug", "db"], 3), ("Gmail OAuth verification", "blocked", "high", 2, ["auth"], 5), ("Beta invite flow", "backlog", "medium", 8, ["growth"], 3), ("Staging smoke tests", "completed", "medium", -3, ["qa"], 2)],
    "Quill Docs": [("OpenAPI importer", "in_progress", "high", 5, ["feature"], 8), ("Search indexing", "backlog", "medium", 12, ["feature"], 5), ("Pricing page", "backlog", "low", 20, ["marketing"], 2)],
    "Harbor Status": [("Fix staging deploy healthcheck", "in_progress", "high", 1, ["deploy"], 2), ("Incident timeline UI", "review", "medium", 4, ["feature"], 5), ("Load test status page CDN", "backlog", "medium", 10, ["perf"], 3)],
    "Pocket Ledger": [("Validate pricing with 10 freelancers", "in_progress", "high", 7, ["research"], 3), ("Write product spec", "backlog", "medium", 14, ["planning"], 2)],
    "Nimbus Forms": [("Competitor teardown", "backlog", "low", 21, ["research"], 2)],
}

MILESTONES = {
    "Lumen Analytics": [("v3.0 Funnels", "active", -20, 10, "v3.0"), ("SOC2 readiness", "planned", 12, 60, "")],
    "Inkwell": [("Stabilize generation", "active", -7, 5, "v2.4"), ("Team plan launch", "planned", 6, 40, "v3.0")],
    "Relay Inbox": [("Public beta", "active", -14, 14, "beta")],
    "Quill Docs": [("Private alpha", "active", -10, 21, "alpha")],
    "Harbor Status": [("Staging sign-off", "active", -5, 7, "rc1")],
    "Pocket Ledger": [("Spec complete", "planned", 0, 21, "")],
}

ALERTS = [
    ("Inkwell", "failed_deployment", "critical", "Deployment failed on Railway", "Build exited with code 1: node-gyp rebuild failed (node 22)."),
    ("Harbor Status", "api_downtime", "critical", "Staging API not responding", "Health check /healthz timing out for 23 min."),
    ("Inkwell", "error_rate", "high", "Error rate 4.8% on /api/generate", "5xx responses up 6x vs 7-day baseline."),
    ("Relay Inbox", "db_connection", "high", "PostgreSQL connection failures", "Pool exhausted: 100/100 connections in use."),
    ("Lumen Analytics", "ssl_expiry", "medium", "SSL expires in 9 days", "Certificate for api.lumen.dev expires soon."),
    ("Shipyard CLI", "backup_failure", "medium", "Nightly backup failed", "Volume snapshot job exited with status 2."),
    ("Lumen Analytics", "resource_threshold", "low", "CPU at 87% on worker-1", "Sustained above 85% threshold for 15 min."),
]

DOCS = {
    "architecture": "# Architecture\n\n## Overview\nMonolithic web app with a background worker.\n\n## Components\n- Web app\n- API\n- Worker queue\n\n## Data flow\nRequests hit the API, jobs are queued for the worker.\n",
    "runbook": "# Operational runbook\n\n## Restart the worker\n1. Check queue depth.\n2. Restart via your process manager.\n\n## Rollback\nRedeploy the previous successful build from your deployment provider.\n\n## Escalation\nYou are the on-call. Coffee first.\n",
}


async def seed_sample_portfolio():
    if await db.settings.find_one({"key": "welcome", "sample_choice": "clear"}) or await db.projects.count_documents({}) > 0:
        return
    today = date.today()
    t0 = now()
    months = []
    d = today.replace(day=1)
    for _ in range(6):
        months.append(d.strftime("%Y-%m"))
        d = (d - timedelta(days=1)).replace(day=1)
    months.reverse()
    ids = {}
    for i, (name, cat, stage, prio, tags, fw, dbname, host, dep, rev, exp, subs, cust, health, dstat, users, errs, desc) in enumerate(PROJECTS):
        pid = new_id("prj")
        ids[name] = pid
        slug = name.lower().replace(" ", "-")
        history = {m: round(rev * (0.62 + 0.076 * k), 2) for k, m in enumerate(months)} if rev else {}
        telemetry = None
        if health:
            telemetry = {"health": health, "deployment_status": dstat, "active_users": users, "errors_24h": errs,
                         "last_deployment_at": iso(t0 - timedelta(hours=3 + i * 9)), "source": "demo"}
        await db.projects.insert_one({
            "id": pid, "name": name, "slug": slug, "description": desc, "logo_url": "", "category": cat, "priority": prio,
            "stage": stage, "tags": tags, "source": "sample", "previous_stage": "maintenance" if stage == "archived" else None,
            "dev": {"repo": f"founder/{slug}" if fw else "", "branch": "main", "stack": [s for s in (fw, dbname) if s], "framework": fw, "database": dbname, "architecture_notes": ""},
            "prod": {"production_url": f"https://{slug}.app" if stage in ("production", "maintenance") else "", "preview_url": f"https://staging.{slug}.app" if stage in ("staging", "testing", "production") else "",
                     "backend_url": "", "hosting_provider": host, "deployment_provider": dep, "environment_notes": "", "monitoring_notes": ""},
            "business": {"revenue_model": "Subscription" if rev else "", "monthly_revenue": rev, "monthly_expenses": exp, "subscriptions": subs, "customers": cust, "revenue_history": history},
            "telemetry": telemetry, "github_repo": None,
            "notification_rules": {"failed_deployments": True, "downtime": True, "error_spikes": True, "blocked_tasks": False},
            "deleted_at": None, "created_at": iso(t0 - timedelta(days=170 - i * 18)), "updated_at": iso(), "last_activity_at": iso(t0 - timedelta(hours=i * 5 + 1)),
        })
        for kind, content in DOCS.items():
            if fw:
                await db.documents.insert_one({"id": new_id("doc"), "project_id": pid, "title": f"{name} {kind.title()}", "category": kind,
                                               "content": content.replace("# ", f"# {name} ", 1), "source": "sample", "deleted_at": None,
                                               "created_at": iso(), "updated_at": iso(t0 - timedelta(days=i + 2))})
    for name, items in MILESTONES.items():
        mids = []
        for title, status, start, due, release in items:
            mid = new_id("mil")
            await db.milestones.insert_one({"id": mid, "project_id": ids[name], "title": title, "description": "", "status": status, "release": release,
                                            "start_date": (today + timedelta(days=start)).isoformat(), "due_date": (today + timedelta(days=due)).isoformat(),
                                            "depends_on": mids[-1:], "deleted_at": None, "created_at": iso()})
            mids.append(mid)
        MILESTONES[name] = mids
    for name, items in TASKS.items():
        created = []
        for k, (title, status, prio, due, labels, effort) in enumerate(items):
            tid = new_id("tsk")
            deps = [created[0]] if status == "blocked" and created else []
            mids = MILESTONES.get(name) or []
            await db.tasks.insert_one({
                "id": tid, "project_id": ids[name], "title": title, "description": "", "status": status, "priority": prio,
                "due_date": (today + timedelta(days=due)).isoformat(), "start_date": (today + timedelta(days=due - max(2, int(effort)))).isoformat(),
                "labels": labels, "assignee": "You", "effort": effort, "dependencies": deps, "milestone_id": mids[0] if mids and k < 3 else None,
                "source": "sample", "deleted_at": None, "created_at": iso(t0 - timedelta(days=12 - k)), "updated_at": iso(t0 - timedelta(hours=k * 4)),
                "completed_at": iso(t0 - timedelta(days=2)) if status == "completed" else None,
            })
            created.append(tid)
    for h, (name, typ, sev, title, detail) in enumerate(ALERTS):
        await db.alerts.insert_one({"id": new_id("alr"), "project_id": ids[name], "type": typ, "severity": sev, "title": title, "detail": detail,
                                    "link": None, "source": "demo", "acknowledged": False, "created_at": iso(t0 - timedelta(minutes=17 + h * 41))})
    events = [("Inkwell", "deployment", "Railway deployment failed: build exited with code 1"), ("Lumen Analytics", "deployment", "Vercel deployment succeeded (main · 3f2a91c)"),
              ("Relay Inbox", "task", "Fix DB connection pool exhaustion: backlog → in_progress"), ("Harbor Status", "deployment", "Staging deploy failed healthcheck"),
              ("Quill Docs", "github", "4 commit(s) pushed to main"), ("Shipyard CLI", "task", "Release v1.8.2 moved to review"),
              ("Lumen Analytics", "milestone", "Milestone started: v3.0 Funnels"), ("Pocket Ledger", "project", "Pocket Ledger moved from idea to planning"),
              ("Inkwell", "task", "Prompt library: review → completed"), ("Quill Docs", "doc", "Doc updated: Quill Docs Architecture"), ("Nimbus Forms", "project", "Project Nimbus Forms created")]
    for k, (name, typ, msg) in enumerate(events):
        await db.events.insert_one({"id": new_id("evt"), "project_id": ids[name], "type": typ, "message": msg,
                                    "source": "demo" if typ in ("deployment", "github") else "sample", "created_at": iso(t0 - timedelta(minutes=9 + k * 53))})
