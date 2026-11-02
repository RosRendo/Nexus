import asyncio
import ipaddress
import logging
import os
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx

from core import db, iso, now

logger = logging.getLogger("founder_os.email")

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
SEV_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
HOURLY_CAP = 30

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = (
    "reply with your password", "reply with the code", "send your password", "cvv",
    "send us your password", "enter your password below", "confirm your card number",
    "your full card number", "seed phrase", "recovery phrase", "verify your card",
    "social security number", "confirm your bank details",
)
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks for credentials: {p!r}")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://") and not low.startswith("http://localhost"):
            raise ValueError(f"Email links must be absolute https: {url!r}")
        host = urlparse(low).hostname or ""
        if host != "localhost" and (not _host_ok(host) or urlparse(low).username is not None):
            raise ValueError(f"Shortened or numeric host: {url!r}")


def _sync_send_smtp(
    host: str,
    port: int,
    user: str,
    password: str,
    from_addr: str,
    to_addr: str,
    subject: str,
    html: str,
    use_tls: bool = True,
) -> dict:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.attach(MIMEText(html, "html", "utf-8"))

    server = None
    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=20)
        else:
            server = smtplib.SMTP(host, port, timeout=20)
            if use_tls:
                server.starttls()

        if user and password:
            server.login(user, password)

        server.sendmail(from_addr, [to_addr], msg.as_string())
        return {"status": "sent", "mode": "smtp"}
    except Exception as e:
        logger.error("SMTP error sending to %s: %s", to_addr, e)
        return {"status": "failed", "error": f"SMTP error: {e}"}
    finally:
        if server:
            try:
                server.quit()
            except Exception:
                pass


async def send_email(*, to: str, subject: str, html: str) -> dict:
    """Dispatches email via SMTP, Resend API, Emergent Proxy, or Dev Simulation."""
    try:
        _assert_safe_email(subject, html)
    except ValueError as e:
        logger.warning("Email safety check failed: %s", e)
        return {"status": "failed", "error": str(e)}

    cfg = await email_settings()

    # 1. Try SMTP if configured (DB settings or environment)
    smtp_host = cfg.get("smtp_host") or os.environ.get("SMTP_HOST")
    smtp_user = cfg.get("smtp_user") or os.environ.get("SMTP_USER")
    smtp_pass = cfg.get("smtp_pass") or os.environ.get("SMTP_PASSWORD")
    if smtp_host:
        port = int(cfg.get("smtp_port") or os.environ.get("SMTP_PORT", 587))
        from_name = cfg.get("from_name") or os.environ.get("EMAIL_FROM_NAME", "Nexus Alerts")
        from_email = cfg.get("smtp_from") or os.environ.get("EMAIL_FROM", os.environ.get("ADMIN_EMAIL", "alerts@nexus.local"))
        from_addr = f'"{from_name}" <{from_email}>' if "@" in from_email else from_email
        use_tls = cfg.get("smtp_tls", True)

        res = await asyncio.to_thread(
            _sync_send_smtp,
            host=smtp_host,
            port=port,
            user=smtp_user or "",
            password=smtp_pass or "",
            from_addr=from_addr,
            to_addr=to,
            subject=subject,
            html=html,
            use_tls=use_tls,
        )
        if res["status"] == "sent":
            logger.info("Email delivered via SMTP to %s (subject: %s)", to, subject)
            return res
        return res

    # 2. Try Resend if API key is present
    resend_key = cfg.get("resend_api_key") or os.environ.get("RESEND_API_KEY")
    if resend_key:
        from_name = cfg.get("from_name") or os.environ.get("EMAIL_FROM_NAME", "Nexus Alerts")
        from_email = cfg.get("smtp_from") or os.environ.get("EMAIL_FROM", "onboarding@resend.dev")
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {resend_key}"},
                    json={"from": f"{from_name} <{from_email}>", "to": [to], "subject": subject, "html": html},
                )
                if r.status_code in (200, 201):
                    return {"status": "sent", "mode": "resend", "id": r.json().get("id")}
                return {"status": "failed", "error": f"Resend API error: {r.status_code} {r.text[:200]}"}
        except Exception as e:
            logger.error("Resend send error: %s", e)
            return {"status": "failed", "error": f"Resend error: {e}"}

    # 3. Try Emergent Managed Proxy if configured
    emergent_key = os.environ.get("EMERGENT_EMAIL_KEY")
    from_name = cfg.get("from_name") or os.environ.get("EMAIL_FROM_NAME", "Nexus Alerts")
    if emergent_key:
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                r = await client.post(
                    f"{EMAIL_BASE_URL}/api/v1/email/send",
                    headers={"X-Email-Key": emergent_key},
                    json={"to": [to], "subject": subject, "html": html, "from_name": from_name},
                )
                r.raise_for_status()
                return {"status": "sent", "mode": "emergent", "id": r.json().get("id")}
        except Exception as e:
            logger.error("Emergent proxy error: %s", e)
            return {"status": "failed", "error": str(e)}

    # 4. Simulation / Dev Mode
    logger.info("📧 [SIMULATED EMAIL ALERT] To: %s | Subject: %s", to, subject)
    return {
        "status": "sent",
        "mode": "simulated",
        "note": "Delivered via Dev Simulation. Configure SMTP or Resend in Notifications settings for real inbox delivery.",
    }


def alert_template(title: str, project: str, detail: str, severity: str, source: str):
    brand = os.environ.get("EMAIL_FROM_NAME", "Nexus Alerts")
    frontend_url = os.environ.get("FRONTEND_URL") or os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")[0]
    badge_bg = "#FF453A" if severity == "critical" else "#FF9F0A"
    badge_color = "#FFFFFF"

    subject = f"🚨 [{severity.upper()}] {project}: {title}"[:180]

    attention_link = f"{frontend_url}/attention"
    action_button = (
        f'<a href="{escape(attention_link)}" style="display:inline-block;padding:10px 18px;background:#0A84FF;'
        f'color:#FFFFFF;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;margin-top:12px;">'
        f'Investigate in Attention Center &rarr;</a>'
    )

    html = (
        f'<!DOCTYPE html>'
        f'<html><body style="margin:0;padding:24px;background:#0A0A0C;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;color:#F5F5F7;">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;background:#111114;border:1px solid rgba(255,255,255,0.1);border-radius:10px;overflow:hidden;">'
        f'  <tr><td style="padding:24px;">'
        f'    <div style="margin-bottom:14px;">'
        f'      <span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;background:{badge_bg};color:{badge_color};">{escape(severity)} ALERT</span>'
        f'      <span style="margin-left:8px;font-size:12px;color:#929299;">Source: {escape(source)}</span>'
        f'    </div>'
        f'    <h1 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#F5F5F7;line-height:1.3;">{escape(title)}</h1>'
        f'    <p style="margin:0 0 16px;font-size:14px;color:#0A84FF;font-weight:500;">Project: {escape(project)}</p>'
        f'    <div style="background:#18181B;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:14px;margin-bottom:20px;">'
        f'      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#929299;margin-bottom:6px;">Incident Detail</div>'
        f'      <div style="font-family:\'SF Mono\',ui-monospace,Menlo,monospace;font-size:13px;line-height:1.5;color:#E5E5EA;white-space:pre-wrap;word-break:break-all;">{escape(detail or "No extra details recorded.")}</div>'
        f'    </div>'
        f'    <div>{action_button}</div>'
        f'    <div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:#636366;line-height:1.5;">'
        f'      Dispatched by <strong>{escape(brand)}</strong>. To manage alert preferences or recipients, visit Settings &rarr; Notifications.'
        f'    </div>'
        f'  </td></tr>'
        f'</table>'
        f'</body></html>'
    )
    return subject, html


async def email_settings():
    s = await db.settings.find_one({"key": "email_alerts"}, {"_id": 0}) or {}
    default_recipients = [e.strip() for e in os.environ.get("OWNER_EMAILS", os.environ.get("ADMIN_EMAIL", "")).split(",") if e.strip()]
    recipients_list = s.get("recipients") if (s.get("recipients") and len(s.get("recipients")) > 0) else default_recipients

    has_smtp = bool(s.get("smtp_host") or os.environ.get("SMTP_HOST"))
    has_resend = bool(s.get("resend_api_key") or os.environ.get("RESEND_API_KEY"))
    has_emergent = bool(os.environ.get("EMERGENT_EMAIL_KEY"))

    active_provider = "smtp" if has_smtp else ("resend" if has_resend else ("emergent" if has_emergent else "simulation"))

    return {
        "enabled": s.get("enabled", True),
        "min_severity": s.get("min_severity", "critical"),
        "recipients": recipients_list,
        "provider": s.get("provider") or active_provider,
        "smtp_host": s.get("smtp_host") or os.environ.get("SMTP_HOST", ""),
        "smtp_port": s.get("smtp_port") or int(os.environ.get("SMTP_PORT", 587)),
        "smtp_user": s.get("smtp_user") or os.environ.get("SMTP_USER", ""),
        "smtp_has_pass": bool(s.get("smtp_pass") or os.environ.get("SMTP_PASSWORD")),
        "smtp_pass": s.get("smtp_pass") or os.environ.get("SMTP_PASSWORD", ""),
        "smtp_tls": s.get("smtp_tls", True),
        "smtp_from": s.get("smtp_from") or os.environ.get("EMAIL_FROM", os.environ.get("ADMIN_EMAIL", "alerts@nexus.local")),
        "resend_api_key": s.get("resend_api_key") or os.environ.get("RESEND_API_KEY", ""),
        "active_mode": active_provider,
    }


def recipients():
    """Sync fallback for existing imports."""
    return [e.strip() for e in os.environ.get("OWNER_EMAILS", os.environ.get("ADMIN_EMAIL", "")).split(",") if e.strip()]


async def deliver_alert_email(notification_id: str, title: str, project: str, detail: str, severity: str, source: str):
    hour_ago = iso(now().replace(minute=0, second=0, microsecond=0))
    if await db.notifications.count_documents({"email.status": "sent", "email.at": {"$gte": hour_ago}}) >= HOURLY_CAP:
        await db.notifications.update_one(
            {"id": notification_id},
            {"$set": {"email": {"status": "skipped", "error": "Hourly email cap reached", "at": iso()}}},
        )
        return

    subject, html = alert_template(title, project, detail, severity, source)
    cfg = await email_settings()
    target_recipients = cfg.get("recipients") or recipients()

    results = []
    for r in target_recipients:
        res = await send_email(to=r, subject=subject, html=html)
        results.append(res)

    worst = next((r for r in results if r["status"] != "sent"), results[0] if results else {"status": "failed", "error": "No recipients configured"})
    email_record = {
        "status": worst["status"],
        "mode": worst.get("mode", "smtp"),
        "error": worst.get("error"),
        "to": target_recipients,
        "at": iso(),
    }
    await db.notifications.update_one({"id": notification_id}, {"$set": {"email": email_record}})


async def maybe_email(notification: dict, project_name: str, detail: str):
    s = await email_settings()
    if not s.get("enabled", True):
        return
    if SEV_RANK.get(notification["severity"], 9) > SEV_RANK.get(s.get("min_severity", "critical"), 0):
        return
    asyncio.create_task(
        deliver_alert_email(
            notification["id"],
            notification["title"],
            project_name,
            detail,
            notification["severity"],
            notification.get("source", "system"),
        )
    )
