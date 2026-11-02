import json
import os
from pathlib import Path

base_dir = Path("D:/FOR RENDO (ONLY )/Personal Project")
projects = [p for p in base_dir.iterdir() if p.is_dir()]

print(f"Total projects found in D:\\FOR RENDO (ONLY )\\Personal Project: {len(projects)}\n")

results = []

for p in sorted(projects, key=lambda x: x.name.lower()):
    name = p.name
    subdirs = [s.name for s in p.iterdir() if s.is_dir() and not s.name.startswith(".")]

    has_root_pkg = (p / "package.json").exists()
    has_backend_pkg = (p / "backend" / "package.json").exists()
    has_frontend_pkg = (p / "frontend" / "package.json").exists()
    has_server_pkg = (p / "server" / "package.json").exists()
    has_api_pkg = (p / "api" / "package.json").exists()

    has_root_py = (p / "requirements.txt").exists() or (p / "pyproject.toml").exists()
    has_backend_py = (p / "backend" / "requirements.txt").exists()
    py_files = list(p.glob("*.py"))[:3]

    has_prisma = (
        (p / "prisma" / "schema.prisma").exists()
        or (p / "backend" / "prisma" / "schema.prisma").exists()
        or (p / "src" / "prisma" / "schema.prisma").exists()
    )

    # Determine project architecture
    arch = "Unknown"
    stack = []
    ports = []
    db_type = []

    # Read package.json files
    target_pkgs = []
    if has_root_pkg:
        target_pkgs.append(("root", p / "package.json"))
    if has_backend_pkg:
        target_pkgs.append(("backend", p / "backend" / "package.json"))
    if has_frontend_pkg:
        target_pkgs.append(("frontend", p / "frontend" / "package.json"))

    pkg_details = {}
    for scope, pkg_path in target_pkgs:
        try:
            with open(pkg_path, "r", encoding="utf-8", errors="ignore") as f:
                data = json.load(f)
                deps = set(list(data.get("dependencies", {}).keys()) + list(data.get("devDependencies", {}).keys()))
                scripts = data.get("scripts", {})

                # Identify framework
                if "next" in deps:
                    stack.append(f"{scope}:Next.js")
                if "@nestjs/core" in deps:
                    stack.append(f"{scope}:NestJS")
                if "express" in deps:
                    stack.append(f"{scope}:Express")
                if "fastify" in deps:
                    stack.append(f"{scope}:Fastify")
                if "react" in deps and "next" not in deps:
                    stack.append(f"{scope}:React")
                if "vite" in deps:
                    stack.append(f"{scope}:Vite")

                # Identify DB
                if "@prisma/client" in deps or "prisma" in deps:
                    db_type.append("Prisma")
                if "mongoose" in deps or "mongodb" in deps:
                    db_type.append("MongoDB")
                if "pg" in deps or "postgres" in deps:
                    db_type.append("PostgreSQL")
                if "sqlite3" in deps or "better-sqlite3" in deps:
                    db_type.append("SQLite")

                pkg_details[scope] = {
                    "scripts": list(scripts.keys())[:6],
                    "deps": list(deps)[:8]
                }
        except Exception:
            pass

    if has_root_py or has_backend_py or py_files:
        stack.append("Python")
        # Check requirements
        req_paths = [p / "requirements.txt", p / "backend" / "requirements.txt"]
        for rp in req_paths:
            if rp.exists():
                try:
                    with open(rp, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read().lower()
                        if "fastapi" in content:
                            stack.append("FastAPI")
                        if "flask" in content:
                            stack.append("Flask")
                        if "django" in content:
                            stack.append("Django")
                        if "motor" in content or "pymongo" in content:
                            db_type.append("MongoDB")
                        if "psycopg" in content or "asyncpg" in content or "sqlalchemy" in content:
                            db_type.append("PostgreSQL")
                except Exception:
                    pass

    # Read .env for port and db
    env_candidates = [
        p / ".env", p / ".env.example", p / ".env.local",
        p / "backend" / ".env", p / "backend" / ".env.example",
        p / "frontend" / ".env"
    ]
    detected_envs = {}
    for ep in env_candidates:
        if ep.exists():
            try:
                with open(ep, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k, v = k.strip(), v.strip().strip('"').strip("'")
                            if any(x in k.lower() for x in ["port", "database_url", "mongo_url", "db_url"]):
                                detected_envs[k] = v
            except Exception:
                pass

    results.append({
        "name": name,
        "subdirs": subdirs,
        "stack": list(set(stack)),
        "db": list(set(db_type)),
        "prisma": has_prisma,
        "has_backend_folder": (p / "backend").exists(),
        "has_frontend_folder": (p / "frontend").exists(),
        "pkg_details": pkg_details,
        "env_vars": detected_envs
    })

print(f"{'PROJECT':<20} | {'STACK':<25} | {'DATABASE':<15} | {'HAS BACKEND':<12} | {'DETECTED PORTS / ENV'}")
print("-" * 105)

for r in results:
    stack_str = ", ".join(r["stack"]) if r["stack"] else "Static/Asset"
    db_str = ", ".join(r["db"]) if r["db"] else ("Prisma" if r["prisma"] else "None")
    backend_str = "Yes (folder)" if r["has_backend_folder"] else ("Next.js API" if "root:Next.js" in r["stack"] else "Check")
    
    ports_info = []
    for k, v in r["env_vars"].items():
        if "port" in k.lower():
            ports_info.append(f"{k}={v}")
        elif "url" in k.lower():
            db_scheme = v.split("://")[0] if "://" in v else ""
            if db_scheme:
                ports_info.append(f"db:{db_scheme}")

    env_str = ", ".join(ports_info) if ports_info else "No .env port"
    print(f"{r['name']:<20} | {stack_str:<25} | {db_str:<15} | {backend_str:<12} | {env_str}")

# Save detailed JSON report
with open("backend/projects_scan_report.json", "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)

print("\nFull detailed report saved to backend/projects_scan_report.json")

