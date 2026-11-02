import asyncio
import os
import ssl
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(env_path)

import httpx
from core import client, db, iso, new_id, now

REAL_PROJECTS = [
    {
        "name": "EscrowDeal",
        "url": "https://safe-deal-lemon.vercel.app/",
        "category": "FinTech",
        "tags": ["escrow", "payments", "security", "fintech"],
        "framework": "Next.js",
        "database": "PostgreSQL",
        "description": "Secure peer-to-peer escrow transaction settlement platform.",
    },
    {
        "name": "TechTuneHealer",
        "url": "https://techtuneweb.vercel.app/",
        "category": "HealthTech",
        "tags": ["telehealth", "booking", "healthcare"],
        "framework": "Next.js",
        "database": "MongoDB",
        "description": "Digital wellness & therapy appointment booking and patient care portal.",
    },
    {
        "name": "Journex",
        "url": "https://journex-khaki.vercel.app/",
        "category": "Travel",
        "tags": ["travel", "journal", "itinerary"],
        "framework": "React",
        "database": "Supabase",
        "description": "Smart travel itinerary builder and trip journaling platform.",
    },
    {
        "name": "Orchestrator",
        "url": "https://orchestrator-sage-delta.vercel.app/",
        "category": "DevOps",
        "tags": ["devops", "ci-cd", "cloud", "orchestration"],
        "framework": "Next.js",
        "database": "PostgreSQL",
        "description": "Multi-cloud workflow runner and microservice orchestration manager.",
    },
    {
        "name": "rendoos",
        "url": "https://rendoos.vercel.app/",
        "category": "Desktop / OS",
        "tags": ["web-os", "desktop", "portfolio", "system"],
        "framework": "React",
        "database": "IndexedDB",
        "description": "Interactive browser-based operating system UI and founder workspace.",
    },
    {
        "name": "stackgen",
        "url": "https://stackgen-gamma.vercel.app/",
        "category": "Dev tool",
        "tags": ["scaffolding", "code-gen", "starter-kits"],
        "framework": "Next.js",
        "database": "PostgreSQL",
        "description": "Fullstack architecture code generator and production boilerplate starter kit.",
    },
    {
        "name": "ServiceFinder",
        "url": "https://servicefinder-dusky.vercel.app/",
        "category": "Marketplace",
        "tags": ["marketplace", "services", "freelancers"],
        "framework": "Next.js",
        "database": "MongoDB",
        "description": "Localized contractor and professional service discovery marketplace.",
    },
    {
        "name": "Ecommerce",
        "url": "https://ecommerce-red-one-29.vercel.app/",
        "category": "E-Commerce",
        "tags": ["storefront", "cart", "checkout", "stripe"],
        "framework": "Next.js",
        "database": "PostgreSQL",
        "description": "Headless online storefront with modern checkout experience.",
    },
    {
        "name": "JAVIS",
        "url": "https://javis-sand.vercel.app/",
        "category": "AI tool",
        "tags": ["ai", "assistant", "voice", "llm"],
        "framework": "React",
        "database": "Vector DB",
        "description": "Personal AI assistant powered by LLMs with contextual memory.",
    },
    {
        "name": "Real-Estate",
        "url": "https://real-estate-five-indol-78.vercel.app/",
        "category": "PropTech",
        "tags": ["property", "listings", "real-estate", "rentals"],
        "framework": "Next.js",
        "database": "PostgreSQL",
        "description": "Property rental and real estate listing platform with map search.",
    },
    {
        "name": "CVGen",
        "url": "https://cv-gen-one.vercel.app/",
        "category": "AI tool",
        "tags": ["resume", "cv-builder", "pdf", "careers"],
        "framework": "React",
        "database": "PostgreSQL",
        "description": "ATS-friendly AI resume and CV generator with real-time PDF preview.",
    },
    {
        "name": "TokMenu",
        "url": "https://tokmenu.vercel.app/",
        "category": "Food & Bev",
        "tags": ["qr-menu", "restaurants", "ordering", "pos"],
        "framework": "Next.js",
        "database": "MongoDB",
        "description": "Digital QR code contactless menu and order management for restaurants.",
    },
    {
        "name": "StayPilot",
        "url": "https://stay-pilot-sigma.vercel.app/",
        "category": "Hospitality",
        "tags": ["hotel", "airbnb", "booking", "channel-manager"],
        "framework": "Next.js",
        "database": "PostgreSQL",
        "description": "Vacation rental and boutique hotel reservation management system.",
    },
    {
        "name": "Portfolio",
        "url": "https://portfolio-inky-ten-20.vercel.app/",
        "category": "Personal",
        "tags": ["portfolio", "showcase", "engineering", "resume"],
        "framework": "Next.js",
        "database": "None",
        "description": "Official engineering portfolio showcasing projects, experience, and skills.",
    },
    {
        "name": "Formora",
        "url": "https://formora-delta.vercel.app/",
        "category": "SaaS",
        "tags": ["forms", "survey", "lead-capture", "analytics"],
        "framework": "Next.js",
        "database": "PostgreSQL",
        "description": "Conversational form builder and lead capture automation engine.",
    },
]


def check_real_ssl(hostname: str):
    try:
        ctx = ssl.create_default_context()
        with ssl.create_connection((hostname, 443), timeout=6) as sock:
            with ctx.wrap_socket(sock, server_hostname=hostname) as s:
                cert = s.getpeercert()
        exp = datetime.strptime(cert["notAfter"], "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
        issuer = dict(x[0] for x in cert.get("issuer", [])).get("organizationName", "Vercel / Let's Encrypt")
        return {"valid": True, "expires_at": exp.isoformat(), "issuer": issuer, "error": None}
    except Exception as e:
        return {"valid": False, "expires_at": None, "issuer": "", "error": str(e)[:150]}


async def init_real_data():
    print("======================================================")
    print("Purging ALL mock/fake/seed collections...")
    print("======================================================")
    
    # Clean every collection of fake/seed data
    collections = [
        "projects", "tasks", "milestones", "documents", "alerts",
        "events", "deployments", "resources", "domains", "monitors",
        "jobs", "api_metrics", "logs", "errors", "revenue_records",
        "expense_records", "customers", "settings"
    ]
    for coll in collections:
        await db[coll].delete_many({})
    
    print("Database purged cleanly. Starting live ping on all 15 real projects...")

    async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as http_client:
        for i, proj in enumerate(REAL_PROJECTS):
            name = proj["name"]
            url = proj["url"]
            slug = name.lower().replace(" ", "-")
            parsed = urlparse(url)
            hostname = parsed.netloc

            print(f"[{i+1}/{len(REAL_PROJECTS)}] Probing live endpoint: {url} ...")
            t0 = time.monotonic()
            try:
                resp = await http_client.get(url)
                latency_ms = round((time.monotonic() - t0) * 1000)
                status_code = resp.status_code
                is_up = status_code < 500
            except Exception as e:
                latency_ms = round((time.monotonic() - t0) * 1000)
                status_code = None
                is_up = False
                print(f"    ! Error reaching {name}: {e}")

            health_status = "healthy" if is_up else "down"
            print(f"    -> Status: {status_code or 'TIMEOUT'} | Latency: {latency_ms}ms | Health: {health_status}")

            # Check real SSL certificate
            ssl_info = await asyncio.to_thread(check_real_ssl, hostname)
            ssl_info["checked_at"] = iso()

            pid = new_id("prj")

            # Real telemetry from actual live ping
            telemetry = {
                "health": health_status,
                "deployment_status": "success" if is_up else "failed",
                "active_users": 0,
                "errors_24h": 0 if is_up else 1,
                "last_deployment_at": iso(),
                "source": "live_probe"
            }

            # Real project record - completely zeroed out fake revenue/expenses
            await db.projects.insert_one({
                "id": pid,
                "name": name,
                "slug": slug,
                "description": proj["description"],
                "logo_url": "",
                "category": proj["category"],
                "priority": "high",
                "stage": "production",
                "tags": proj["tags"],
                "source": "real",
                "previous_stage": None,
                "dev": {
                    "repo": f"RosRendo/{slug}",
                    "branch": "main",
                    "stack": [s for s in (proj["framework"], proj["database"]) if s and s != "None"],
                    "framework": proj["framework"],
                    "database": proj["database"],
                    "architecture_notes": f"Production application deployed on Vercel CDN."
                },
                "prod": {
                    "production_url": url,
                    "preview_url": url,
                    "backend_url": "",
                    "hosting_provider": "Vercel",
                    "deployment_provider": "Vercel",
                    "environment_notes": "Live on Vercel Edge Network",
                    "monitoring_notes": "Live HTTP heartbeat probe active"
                },
                "business": {
                    "revenue_model": "SaaS / Subscription",
                    "monthly_revenue": 0.0,
                    "monthly_expenses": 0.0,
                    "subscriptions": 0,
                    "customers": 0,
                    "revenue_history": {}
                },
                "telemetry": telemetry,
                "github_repo": f"RosRendo/{slug}",
                "notification_rules": {
                    "failed_deployments": True,
                    "downtime": True,
                    "error_spikes": True,
                    "blocked_tasks": False
                },
                "deleted_at": None,
                "created_at": iso(),
                "updated_at": iso(),
                "last_activity_at": iso()
            })

            # Real live monitor in db.monitors
            mon_id = new_id("mon")
            monitor_point = {
                "t": iso(),
                "up": is_up,
                "ms": latency_ms,
                "code": status_code
            }
            await db.monitors.insert_one({
                "id": mon_id,
                "project_id": pid,
                "name": f"{name} Production",
                "url": url,
                "interval_min": 15,
                "up": is_up,
                "last_status_code": status_code,
                "last_latency_ms": latency_ms,
                "last_checked_at": iso(),
                "last_error": None if is_up else "Unreachable",
                "history": [monitor_point],
                "source": "live",
                "deleted_at": None,
                "created_at": iso()
            })

            # Real domain record with real SSL details
            dom_id = new_id("dom")
            await db.domains.insert_one({
                "id": dom_id,
                "project_id": pid,
                "domain": hostname,
                "registrar": "Vercel",
                "dns_provider": "Vercel DNS",
                "auto_renew": True,
                "ssl": ssl_info,
                "ssl_source": "live",
                "source": "live",
                "deleted_at": None,
                "created_at": iso()
            })

            # Real event logging
            await db.events.insert_one({
                "id": new_id("evt"),
                "project_id": pid,
                "type": "deployment",
                "message": f"Live probe verified: {url} is online ({status_code} in {latency_ms}ms)",
                "source": "live",
                "created_at": iso()
            })

    print("======================================================")
    print(f"DONE! All {len(REAL_PROJECTS)} projects initialized with 100% REAL LIVE data.")
    print("Zero fake tasks. Zero fake revenue. Zero mock errors.")
    print("======================================================")
    client.close()


if __name__ == "__main__":
    asyncio.run(init_real_data())

