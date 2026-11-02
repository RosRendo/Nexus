import { useState, useEffect } from "react";
import { CheckCheck, Bell, Mail, Send, ChevronDown, ChevronUp, Server, Key, Shield, Info, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { useAction, useGet } from "@/lib/queries";
import { timeAgo } from "@/lib/format";
import { Empty, PageHeader, QueryState, SeverityDot, SourceTag } from "@/components/common";
import { toast } from "sonner";

const EMAIL_STATE = { sent: "text-ok", failed: "text-bad", paused: "text-warn", skipped: "text-mute" };

function EmailSettings() {
  const q = useGet("email-settings", "/notifications/email-settings");
  const s = q.data;

  const [expanded, setExpanded] = useState(false);
  const [recipientsInput, setRecipientsInput] = useState("");
  const [minSeverity, setMinSeverity] = useState("critical");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpTls, setSmtpTls] = useState(true);
  const [resendApiKey, setResendApiKey] = useState("");
  const [provider, setProvider] = useState("smtp");

  useEffect(() => {
    if (s) {
      setRecipientsInput((s.recipients || []).join(", "));
      setMinSeverity(s.min_severity || "critical");
      setSmtpHost(s.smtp_host || "");
      setSmtpPort(s.smtp_port || 587);
      setSmtpUser(s.smtp_user || "");
      setSmtpPass(s.smtp_has_pass ? "••••••••" : "");
      setSmtpFrom(s.smtp_from || "");
      setSmtpTls(s.smtp_tls !== false);
      setResendApiKey(s.resend_api_key || "");
      setProvider(s.provider || (s.smtp_host ? "smtp" : (s.resend_api_key ? "resend" : "smtp")));
    }
  }, [s]);

  const save = useAction(
    (b) => api.put("/notifications/email-settings", b).then((r) => r.data),
    {
      success: "Email alert settings saved",
      onDone: () => q.refetch(),
    }
  );

  const test = useAction(
    () => api.post("/notifications/email-test").then((r) => r.data),
    {
      success: "Test email dispatched successfully!",
      onDone: (data) => {
        if (data.mode === "simulated") {
          toast.info("Delivered via simulation (check server console). Configure SMTP for live inbox delivery.");
        }
        q.refetch();
      },
    }
  );

  const handleSaveAll = (e) => {
    if (e) e.preventDefault();
    const recipientList = recipientsInput
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);

    save.mutate({
      enabled: s?.enabled ?? true,
      min_severity: minSeverity,
      recipients: recipientList,
      provider,
      smtp_host: smtpHost.trim(),
      smtp_port: Number(smtpPort) || 587,
      smtp_user: smtpUser.trim(),
      smtp_pass: smtpPass === "••••••••" ? undefined : smtpPass,
      smtp_from: smtpFrom.trim(),
      smtp_tls: smtpTls,
      resend_api_key: resendApiKey === "••••••••" ? undefined : resendApiKey.trim(),
    });
  };

  const applyPreset = (type) => {
    if (type === "gmail") {
      setProvider("smtp");
      setSmtpHost("smtp.gmail.com");
      setSmtpPort(587);
      setSmtpTls(true);
      if (!smtpFrom && smtpUser) setSmtpFrom(smtpUser);
      toast.info("Gmail preset applied. Use a Google App Password for authentication.");
    } else if (type === "outlook") {
      setProvider("smtp");
      setSmtpHost("smtp.office365.com");
      setSmtpPort(587);
      setSmtpTls(true);
      toast.info("Outlook preset applied.");
    } else if (type === "resend") {
      setProvider("resend");
      toast.info("Resend API mode selected.");
    }
  };

  return (
    <div className="panel p-5 mb-5 space-y-4" data-testid="email-alerts-panel">
      <QueryState query={q} rows={3}>
        {s && (
          <div className="space-y-4">
            {/* Header: Title and Toggle */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[14px] font-semibold tracking-tight">
                  <Mail size={16} className="text-acc" /> Email Alerts for Critical Incidents
                </div>
                <p className="text-[12.5px] text-mute mt-1">
                  Deliver critical alerts like failed deployments, downtime, and error spikes straight to your inbox, not just the in-app feed.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-mute">{s.enabled ? "Enabled" : "Disabled"}</span>
                <Switch
                  data-testid="email-alerts-toggle"
                  checked={s.enabled}
                  onCheckedChange={(v) => save.mutate({ enabled: v, min_severity: s.min_severity })}
                />
              </div>
            </div>

            {/* Quick Controls: Recipients & Threshold */}
            <div className="grid md:grid-cols-[1.5fr_1fr] gap-4 pt-2 border-t border-line text-[12.5px]">
              <div>
                <label className="block text-[11.5px] text-mute mb-1 font-medium">
                  Recipient Inbox (comma-separated for multiple)
                </label>
                <div className="flex gap-2">
                  <input
                    data-testid="email-alerts-recipients-input"
                    className="fos-input h-8 text-[12.5px]"
                    placeholder="e.g. founder@company.com, devops@company.com"
                    value={recipientsInput}
                    disabled={!s.enabled}
                    onChange={(e) => setRecipientsInput(e.target.value)}
                    onBlur={() => handleSaveAll()}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] text-mute mb-1 font-medium">Trigger Level</label>
                <div className="flex items-center gap-2">
                  <select
                    data-testid="email-alerts-severity"
                    className="fos-input h-8 text-[12.5px]"
                    value={minSeverity}
                    disabled={!s.enabled}
                    onChange={(e) => {
                      setMinSeverity(e.target.value);
                      save.mutate({ enabled: s.enabled, min_severity: e.target.value });
                    }}
                  >
                    <option value="critical">Critical only (Failed deploys & Downtime)</option>
                    <option value="high">Critical & High (Includes Error spikes & SSL)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Status Pill & Configuration Toggle */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-line text-[12px]">
              <div className="flex items-center gap-2">
                <span className="text-mute">Delivery mode:</span>
                {s.smtp_host ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-ok/10 text-ok border border-ok/30 text-[11px] font-medium">
                    <CheckCircle2 size={11} /> SMTP Active ({s.smtp_host}:{s.smtp_port})
                  </span>
                ) : s.resend_api_key ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-acc/10 text-acc border border-acc/30 text-[11px] font-medium">
                    <CheckCircle2 size={11} /> Resend API Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-elevated text-mute border border-line text-[11px]">
                    <Info size={11} /> Dev Simulation Mode (Server Log)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  className="btn btn-ghost text-[11.5px] h-7 gap-1"
                  onClick={() => setExpanded(!expanded)}
                >
                  <Server size={12} />
                  {expanded ? "Hide SMTP / Delivery Settings" : "Configure Custom SMTP / Gmail"}
                  {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                <button
                  data-testid="email-test-btn"
                  className="btn btn-outline h-7 text-[12px]"
                  disabled={test.isPending || !s.enabled}
                  onClick={() => test.mutate()}
                >
                  <Send size={12} /> {test.isPending ? "Sending…" : "Send test email"}
                </button>
              </div>
            </div>

            {/* Expandable SMTP / Provider Settings */}
            {expanded && (
              <form onSubmit={handleSaveAll} className="p-4 rounded-lg bg-elevated border border-line space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-[12.5px] font-medium flex items-center gap-2">
                    <Key size={13} className="text-acc" /> Outgoing Mail Server Configuration
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-mute">Quick presets:</span>
                    <button type="button" onClick={() => applyPreset("gmail")} className="chip h-5 px-2 text-[10.5px]">Gmail</button>
                    <button type="button" onClick={() => applyPreset("outlook")} className="chip h-5 px-2 text-[10.5px]">Outlook</button>
                    <button type="button" onClick={() => applyPreset("resend")} className="chip h-5 px-2 text-[10.5px]">Resend</button>
                  </div>
                </div>

                {provider === "smtp" ? (
                  <div className="space-y-3">
                    <div className="grid sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-mute mb-1">SMTP Host</label>
                        <input
                          className="fos-input h-8 text-[12.5px]"
                          placeholder="e.g. smtp.gmail.com or smtp.mailgun.org"
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-mute mb-1">Port</label>
                        <input
                          type="number"
                          className="fos-input h-8 text-[12.5px]"
                          placeholder="587"
                          value={smtpPort}
                          onChange={(e) => setSmtpPort(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-mute mb-1">SMTP Username / Email</label>
                        <input
                          className="fos-input h-8 text-[12.5px]"
                          placeholder="your-email@gmail.com"
                          value={smtpUser}
                          onChange={(e) => setSmtpUser(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-mute mb-1">
                          SMTP Password / App Password {s.smtp_has_pass && <span className="text-ok">(Saved)</span>}
                        </label>
                        <input
                          type="password"
                          className="fos-input h-8 text-[12.5px]"
                          placeholder={s.smtp_has_pass ? "•••••••• (Leave blank to keep current)" : "App Password or SMTP Key"}
                          value={smtpPass}
                          onChange={(e) => setSmtpPass(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-mute mb-1">From Email Address</label>
                        <input
                          className="fos-input h-8 text-[12.5px]"
                          placeholder="alerts@yourdomain.com"
                          value={smtpFrom}
                          onChange={(e) => setSmtpFrom(e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-5">
                        <label className="flex items-center gap-2 cursor-pointer text-[12px]">
                          <input
                            type="checkbox"
                            checked={smtpTls}
                            onChange={(e) => setSmtpTls(e.target.checked)}
                            className="rounded border-line"
                          />
                          <span>Enable TLS encryption (STARTTLS)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] text-mute mb-1">Resend API Key</label>
                    <input
                      type="password"
                      className="fos-input h-8 text-[12.5px]"
                      placeholder="re_123456789..."
                      value={resendApiKey}
                      onChange={(e) => setResendApiKey(e.target.value)}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-line text-[11px] text-mute">
                  <span>💡 Tip: For Gmail, use <code className="mono">smtp.gmail.com:587</code> and generate a Google App Password (2FA &rarr; App Passwords).</span>
                  <button type="submit" disabled={save.isPending} className="btn btn-primary h-7 text-[12px]">
                    {save.isPending ? "Saving…" : "Save Delivery Settings"}
                  </button>
                </div>
              </form>
            )}

            {/* Last Delivery Status */}
            {s.last_delivery && (
              <div className="text-[11.5px] text-mute pt-1">
                Last delivery: <span className={`font-medium ${EMAIL_STATE[s.last_delivery.email?.status]}`}>{s.last_delivery.email?.status}</span>
                {s.last_delivery.email?.mode && ` (${s.last_delivery.email.mode})`}
                {` · ${s.last_delivery.title}`}
                {` · ${timeAgo(s.last_delivery.email?.at)}`}
                {s.last_delivery.email?.error && <span className="text-bad"> · {s.last_delivery.email.error}</span>}
              </div>
            )}
          </div>
        )}
      </QueryState>
    </div>
  );
}

export default function Notifications() {
  const q = useGet("notifications", "/notifications");
  const read = useAction((ids) => api.post("/notifications/read", { ids }).then((r) => r.data));

  return (
    <div data-testid="notifications-page">
      <PageHeader
        label="Settings"
        title="Notifications & Email Alerts"
        subtitle="Manage in-app incident alerts and automated email notifications for failed deploys, downtime, and outages."
        actions={
          <button data-testid="notifications-read-all" className="btn btn-outline" onClick={() => read.mutate(null)}>
            <CheckCheck size={13} /> Mark all read
          </button>
        }
      />
      <EmailSettings />
      <p className="text-[12px] text-mute mb-3">
        Per-project alert rules can also be customized in <Link to="/projects" className="text-acc hover:underline">Projects &rarr; Project Workspace &rarr; Settings</Link>.
      </p>
      <div className="panel overflow-hidden">
        <QueryState query={q}>
          {q.data?.items?.length ? (
            q.data.items.map((n) => (
              <div
                key={n.id}
                data-testid={`notification-${n.id}`}
                onClick={() => !n.read && read.mutate([n.id])}
                className={`flex items-start gap-3 px-3 py-2.5 border-b border-line last:border-0 row-hover cursor-pointer ${
                  n.read ? "opacity-55" : ""
                }`}
              >
                <span className="mt-1.5"><SeverityDot severity={n.severity} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium">{n.title}</div>
                  <div className="text-[11.5px] text-mute truncate">{n.body}</div>
                </div>
                {n.email && (
                  <span
                    data-testid={`notification-email-${n.id}`}
                    className={`inline-flex items-center gap-1 text-[11px] font-medium ${EMAIL_STATE[n.email.status]}`}
                    title={n.email.error || `Sent via ${n.email.mode || "smtp"}`}
                  >
                    <Mail size={11} /> {n.email.status}
                  </span>
                )}
                <SourceTag source={n.source} />
                <span className="mono text-[11px] text-mute">{timeAgo(n.created_at)}</span>
                {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-acc mt-2" />}
              </div>
            ))
          ) : (
            <Empty
              icon={Bell}
              title="No notifications"
              text="Live alerts (failed deploys, downtime, SSL, error spikes) appear here and are dispatched to your email."
            />
          )}
        </QueryState>
      </div>
    </div>
  );
}
