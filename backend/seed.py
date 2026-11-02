from datetime import date, timedelta

from core import db, iso, new_id, now

# name, category, stage, priority, tags, framework, database, hosting, deploy, revenue, expenses, subs, customers, health, deploy_status, users, errors, description, production_url
PROJECTS = [
    ("EscrowDeal", "FinTech", "production", "high", ["escrow", "payments", "security", "fintech"], "Next.js", "PostgreSQL", "Vercel", "Vercel", 3400, 450, 58, 52, "healthy", "success", 1240, 2, "Decentralized & secure peer-to-peer escrow transaction settlement platform.", "https://safe-deal-lemon.vercel.app/"),
    ("TechTuneHealer", "HealthTech", "production", "high", ["telehealth", "booking", "consultations", "health"], "Next.js", "MongoDB", "Vercel", "Vercel", 2100, 320, 41, 38, "healthy", "success", 890, 1, "Digital wellness & therapy appointment booking and patient care portal.", "https://techtuneweb.vercel.app/"),
    ("Journex", "Travel", "production", "medium", ["travel", "journal", "itinerary", "maps"], "React", "Supabase", "Vercel", "Vercel", 1650, 210, 65, 60, "healthy", "success", 1450, 0, "Smart travel itinerary builder and interactive trip journaling platform.", "https://journex-khaki.vercel.app/"),
    ("Orchestrator", "DevOps", "production", "urgent", ["devops", "ci-cd", "cloud", "orchestration", "automation"], "Next.js", "PostgreSQL", "Vercel", "Vercel", 4800, 850, 110, 95, "healthy", "success", 2300, 4, "Multi-cloud workflow runner and microservice orchestration manager.", "https://orchestrator-sage-delta.vercel.app/"),
    ("rendoos", "Desktop / OS", "production", "high", ["web-os", "desktop", "portfolio", "creative", "system"], "React", "IndexedDB", "Vercel", "Vercel", 850, 60, 20, 18, "healthy", "success", 3100, 0, "Interactive browser-based operating system UI and founder personal workspace.", "https://rendoos.vercel.app/"),
    ("stackgen", "Dev tool", "production", "high", ["scaffolding", "code-gen", "starter-kits", "cli"], "Next.js", "PostgreSQL", "Vercel", "Vercel", 1950, 180, 84, 78, "healthy", "success", 1750, 2, "Fullstack architecture code generator and production boilerplate starter kit.", "https://stackgen-gamma.vercel.app/"),
    ("ServiceFinder", "Marketplace", "production", "medium", ["marketplace", "services", "freelancers", "directory"], "Next.js", "MongoDB", "Vercel", "Vercel", 2600, 410, 52, 49, "healthy", "success", 2100, 5, "Localized contractor and professional service discovery marketplace.", "https://servicefinder-dusky.vercel.app/"),
    ("Ecommerce", "E-Commerce", "production", "high", ["storefront", "cart", "checkout", "stripe"], "Next.js", "PostgreSQL", "Vercel", "Vercel", 5400, 920, 140, 132, "healthy", "success", 4200, 1, "High-performance headless online storefront with instant checkout.", "https://ecommerce-red-one-29.vercel.app/"),
    ("JAVIS", "AI tool", "production", "urgent", ["ai", "assistant", "voice", "llm", "automation"], "React / FastAPI", "Vector DB", "Vercel", "Vercel", 3900, 1100, 175, 160, "healthy", "success", 2800, 8, "Personal AI assistant powered by LLMs with contextual memory & actions.", "https://javis-sand.vercel.app/"),
    ("Real-Estate", "PropTech", "production", "medium", ["property", "listings", "real-estate", "map", "rentals"], "Next.js", "PostgreSQL", "Vercel", "Vercel", 2200, 340, 38, 35, "healthy", "success", 1600, 1, "Premium property rental and real estate listing platform with map search.", "https://real-estate-five-indol-78.vercel.app/"),
    ("CVGen", "AI tool", "production", "high", ["resume", "cv-builder", "pdf", "careers", "ai"], "React", "PostgreSQL", "Vercel", "Vercel", 1850, 190, 92, 88, "healthy", "success", 3400, 3, "ATS-friendly AI resume and CV generator with real-time PDF preview.", "https://cv-gen-one.vercel.app/"),
    ("TokMenu", "Food & Bev", "production", "high", ["qr-menu", "restaurants", "ordering", "pos", "saas"], "Next.js", "MongoDB", "Vercel", "Vercel", 3100, 480, 74, 68, "healthy", "success", 1900, 2, "Digital QR code contactless menu and order management for restaurants.", "https://tokmenu.vercel.app/"),
    ("StayPilot", "Hospitality", "production", "medium", ["hotel", "airbnb", "booking", "channel-manager"], "Next.js", "PostgreSQL", "Vercel", "Vercel", 2750, 390, 46, 42, "healthy", "success", 1100, 0, "Vacation rental and boutique hotel reservation management system.", "https://stay-pilot-sigma.vercel.app/"),
    ("Portfolio", "Personal", "production", "low", ["portfolio", "showcase", "engineering", "resume"], "Next.js", "None", "Vercel", "Vercel", 0, 15, 0, 0, "healthy", "success", 5200, 0, "Official engineering portfolio showcasing projects, experience, and skills.", "https://portfolio-inky-ten-20.vercel.app/"),
    ("Formora", "SaaS", "production", "high", ["forms", "survey", "lead-capture", "analytics", "nocode"], "Next.js", "PostgreSQL", "Vercel", "Vercel", 2350, 270, 80, 75, "healthy", "success", 2400, 1, "Conversational form builder and lead capture automation engine.", "https://formora-delta.vercel.app/"),
]

TASKS = {
    "EscrowDeal": [("Audit multi-sig release smart contract", "review", "urgent", 2, ["security", "crypto"], 5), ("Add dispute resolution timer", "in_progress", "high", 4, ["feature"], 3)],
    "TechTuneHealer": [("Integrate HIPAA-compliant video calls", "in_progress", "high", 3, ["telehealth"], 5), ("Doctor calendar sync webhook", "completed", "medium", -3, ["feature"], 2)],
    "Journex": [("Offline maps cache synchronization", "in_progress", "medium", 5, ["feature"], 4), ("Export itinerary to Apple Wallet", "backlog", "low", 12, ["mobile"], 3)],
    "Orchestrator": [("Add Kubernetes cluster auto-discovery", "in_progress", "urgent", 1, ["cloud", "devops"], 8), ("Webhook trigger rate limiter", "review", "high", 3, ["ops"], 2)],
    "rendoos": [("Window docking and multi-monitor layout", "in_progress", "high", 4, ["ui", "desktop"], 3), ("Custom theme marketplace", "backlog", "low", 15, ["feature"], 5)],
    "stackgen": [("Add FastAPI + Motor template", "review", "high", 2, ["templates"], 3), ("Next.js 15 App Router scaffold", "completed", "urgent", -5, ["core"], 4)],
    "ServiceFinder": [("Distance-based geohash sorting", "in_progress", "medium", 6, ["search", "geo"], 4), ("Stripe Connect provider payout", "backlog", "high", 9, ["billing"], 6)],
    "Ecommerce": [("One-click Apple Pay / Google Pay checkout", "in_progress", "urgent", 2, ["payments"], 3), ("Abandoned cart email automation", "review", "medium", 5, ["growth"], 2)],
    "JAVIS": [("Stream response latency optimization", "in_progress", "urgent", 1, ["ai", "perf"], 3), ("Function calling tool registry", "completed", "high", -2, ["ai"], 5)],
    "Real-Estate": [("Interactive Mapbox clustered pins", "in_progress", "medium", 4, ["ui", "maps"], 4), ("Virtual tour 360 viewer", "backlog", "low", 14, ["media"], 6)],
    "CVGen": [("Export ATS score breakdown PDF", "in_progress", "high", 2, ["ai", "pdf"], 3), ("LinkedIn profile JSON importer", "completed", "medium", -4, ["feature"], 2)],
    "TokMenu": [("Table QR dynamic generator & printer export", "in_progress", "high", 3, ["qr", "pos"], 3), ("Kitchen display system (KDS) live mode", "review", "high", 5, ["ops"], 4)],
    "StayPilot": [("iCal calendar synchronization for Airbnb & VRBO", "in_progress", "high", 3, ["sync", "ota"], 5), ("Automated guest check-in PIN generation", "completed", "medium", -2, ["iot"], 3)],
    "Portfolio": [("Showcase 15 live production apps", "completed", "urgent", 0, ["portfolio"], 2), ("Add interactive terminal easter egg", "backlog", "low", 20, ["fun"], 1)],
    "Formora": [("Logic branching conditional questions", "in_progress", "urgent", 2, ["forms", "core"], 4), ("Zapier & Webhook instant dispatch", "review", "high", 4, ["integrations"], 3)],
}

MILESTONES = {
    "EscrowDeal": [("Audit & Mainnet Release", "active", -10, 14, "v1.0")],
    "Orchestrator": [("v2 Enterprise Runner Engine", "active", -5, 20, "v2.0")],
    "JAVIS": [("Voice Mode & Live Tool Execution", "active", -7, 10, "v1.5")],
    "Ecommerce": [("Black Friday Global Scale Hardening", "planned", 5, 30, "v2.2")],
    "TokMenu": [("POS Cloud Integration", "active", -3, 12, "v1.2")],
}

DOCS = {
    "architecture": "# System Architecture\n\n## Overview\nProduction cloud web application hosted on Vercel with high-availability microservices.\n\n## Stack\n- Frontend: React / Next.js\n- API & Backend: RESTful endpoints / Serverless\n- Monitoring: Uptime probes, telemetry, and error reporting\n",
    "runbook": "# Operations & Runbook\n\n## Deployment\nAutomatic Git-driven CI/CD deployment pipelines on Vercel.\n\n## Rollback\nRollback via Vercel Dashboard -> Deployments -> Instant Rollback.\n\n## Incident Triage\n1. Check Vercel runtime logs.\n2. Verify database connection pool.\n3. Escalate to engineering on-call.\n",
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
    for i, (name, cat, stage, prio, tags, fw, dbname, host, dep, rev, exp, subs, cust, health, dstat, users, errs, desc, prod_url) in enumerate(PROJECTS):
        pid = new_id("prj")
        ids[name] = pid
        slug = name.lower().replace(" ", "-")
        history = {m: round(rev * (0.68 + 0.064 * k), 2) for k, m in enumerate(months)} if rev else {}
        telemetry = None
        if health:
            telemetry = {
                "health": health, "deployment_status": dstat, "active_users": users, "errors_24h": errs,
                "last_deployment_at": iso(t0 - timedelta(hours=2 + i * 4)), "source": "live_monitor"
            }
        await db.projects.insert_one({
            "id": pid, "name": name, "slug": slug, "description": desc, "logo_url": "", "category": cat, "priority": prio,
            "stage": stage, "tags": tags, "source": "portfolio", "previous_stage": None,
            "dev": {"repo": f"RosRendo/{slug}", "branch": "main", "stack": [s for s in (fw, dbname) if s and s != "None"], "framework": fw, "database": dbname, "architecture_notes": f"Production architecture for {name}."},
            "prod": {"production_url": prod_url, "preview_url": prod_url,
                     "backend_url": "", "hosting_provider": host, "deployment_provider": dep, "environment_notes": "Live on Vercel CDN", "monitoring_notes": "Automated uptime checks enabled"},
            "business": {"revenue_model": "Subscription / SaaS" if rev else "Portfolio / Showcase", "monthly_revenue": rev, "monthly_expenses": exp, "subscriptions": subs, "customers": cust, "revenue_history": history},
            "telemetry": telemetry, "github_repo": f"RosRendo/{slug}",
            "notification_rules": {"failed_deployments": True, "downtime": True, "error_spikes": True, "blocked_tasks": False},
            "deleted_at": None, "created_at": iso(t0 - timedelta(days=120 - i * 6)), "updated_at": iso(), "last_activity_at": iso(t0 - timedelta(hours=i * 2 + 1)),
        })
        for kind, content in DOCS.items():
            await db.documents.insert_one({"id": new_id("doc"), "project_id": pid, "title": f"{name} {kind.title()}", "category": kind,
                                           "content": content.replace("# ", f"# {name} ", 1), "source": "portfolio", "deleted_at": None,
                                           "created_at": iso(), "updated_at": iso(t0 - timedelta(days=i + 1))})
    for name, items in MILESTONES.items():
        if name not in ids:
            continue
        mids = []
        for title, status, start, due, release in items:
            mid = new_id("mil")
            await db.milestones.insert_one({"id": mid, "project_id": ids[name], "title": title, "description": f"Key delivery milestone for {name}", "status": status, "release": release,
                                            "start_date": (today + timedelta(days=start)).isoformat(), "due_date": (today + timedelta(days=due)).isoformat(),
                                            "depends_on": mids[-1:], "deleted_at": None, "created_at": iso()})
            mids.append(mid)
    for name, items in TASKS.items():
        if name not in ids:
            continue
        created = []
        for k, (title, status, prio, due, labels, effort) in enumerate(items):
            tid = new_id("tsk")
            deps = [created[0]] if status == "blocked" and created else []
            await db.tasks.insert_one({
                "id": tid, "project_id": ids[name], "title": title, "description": f"Sprint item for {name}", "status": status, "priority": prio,
                "due_date": (today + timedelta(days=due)).isoformat(), "start_date": (today + timedelta(days=due - max(2, int(effort)))).isoformat(),
                "labels": labels, "assignee": "Ros Rendo", "effort": effort, "dependencies": deps, "milestone_id": None,
                "source": "portfolio", "deleted_at": None, "created_at": iso(t0 - timedelta(days=8 - k)), "updated_at": iso(t0 - timedelta(hours=k * 3)),
                "completed_at": iso(t0 - timedelta(days=1)) if status == "completed" else None,
            })
            created.append(tid)

    events = [
        ("JAVIS", "deployment", "Vercel deployment completed successfully (main · live)"),
        ("Orchestrator", "deployment", "Production build 100% green on Vercel CDN"),
        ("EscrowDeal", "task", "Audit multi-sig release smart contract moved to review"),
        ("Ecommerce", "deployment", "Instant checkout flow deployed to Vercel edge"),
        ("rendoos", "project", "rendoos web OS online & operational"),
        ("TechTuneHealer", "task", "Doctor calendar sync webhook: completed"),
        ("stackgen", "deployment", "Next.js 15 template generator deployed"),
        ("TokMenu", "milestone", "Milestone started: POS Cloud Integration"),
        ("CVGen", "task", "Export ATS score breakdown PDF in progress"),
        ("StayPilot", "project", "StayPilot channel manager operational"),
    ]
    for k, (name, typ, msg) in enumerate(events):
        if name in ids:
            await db.events.insert_one({"id": new_id("evt"), "project_id": ids[name], "type": typ, "message": msg,
                                        "source": "live", "created_at": iso(t0 - timedelta(minutes=14 + k * 35))})
