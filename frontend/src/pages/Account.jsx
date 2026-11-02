import { useState } from "react";
import { LogOut, Download, DatabaseBackup } from "lucide-react";
import { api, API } from "@/lib/api";
import { useAction, useAuditLogs, useGet } from "@/lib/queries";
import { useAuth } from "@/context/AuthContext";
import { timeAgo } from "@/lib/format";
import { Field, PageHeader, QueryState, Empty } from "@/components/common";

function ChangePassword() {
  const [f, setF] = useState({ current_password: "", new_password: "" });
  const save = useAction((b) => api.post("/auth/change-password", b).then((r) => r.data), { success: "Password updated", onDone: () => setF({ current_password: "", new_password: "" }) });
  return (
    <form className="panel p-5 space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(f); }}>
      <div className="section-label">Change password</div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Current password"><input data-testid="current-password-input" type="password" className="fos-input" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} /></Field>
        <Field label="New password" hint="At least 10 characters"><input data-testid="new-password-input" type="password" className="fos-input" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} /></Field>
      </div>
      <button data-testid="change-password-btn" disabled={f.new_password.length < 10 || !f.current_password || save.isPending} className="btn btn-primary">Update password</button>
    </form>
  );
}

function Backups() {
  const q = useGet("backups", "/backups");
  const runs = useGet("cron-runs", "/cron/runs");
  const make = useAction(() => api.post("/backups").then((r) => r.data), { success: "Backup created" });
  return (
    <div className="panel overflow-hidden mb-5" data-testid="backups-panel">
      <div className="h-10 px-4 flex items-center border-b border-line text-[12.5px] font-medium">Backups <span className="text-mute font-normal ml-2 text-[11.5px]">daily at 03:00 UTC · last 14 kept · secrets excluded</span>
        <button data-testid="backup-now-btn" className="btn btn-outline h-7 ml-auto" disabled={make.isPending} onClick={() => make.mutate()}><DatabaseBackup size={12} /> Back up now</button></div>
      <QueryState query={q}>
        {q.data?.length ? q.data.map((b) => (
          <div key={b.id} className="flex items-center gap-3 h-9 px-4 border-b border-line last:border-0 text-[12px]">
            <span className="mono">{new Date(b.created_at).toLocaleString()}</span><span className="text-mute">{b.trigger}</span>
            <span className="mono text-mute">{(b.size_bytes / 1024).toFixed(1)} KB</span>
            <a data-testid={`backup-download-${b.id}`} href={`${API}/backups/${b.id}/download`} className="btn btn-ghost h-6 ml-auto"><Download size={12} /> Download</a>
          </div>
        )) : <Empty title="No backups yet" />}
      </QueryState>
      {runs.data?.length > 0 && <div className="px-4 py-2 border-t border-line text-[11px] text-mute">Last scheduled run: {runs.data[0].job} · {runs.data[0].status} · {timeAgo(runs.data[0].created_at)}</div>}
    </div>
  );
}

export default function Account() {
  const { user, logout } = useAuth();
  const logs = useAuditLogs();
  return (
    <div data-testid="account-page" className="max-w-4xl">
      <PageHeader label="Settings" title="Account & Security" actions={<button data-testid="account-logout-btn" className="btn btn-outline" onClick={logout}><LogOut size={13} /> Sign out</button>} />
      <div className="panel p-5 mb-5 grid sm:grid-cols-4 gap-4 text-[12.5px]">
        {[["Name", user.name], ["Email", user.email], ["Role", user.role], ["Sign-in methods", (user.auth_methods || []).join(", ")]].map(([k, v]) => (
          <div key={k}><div className="text-[11px] text-mute">{k}</div><div className="mt-0.5 truncate" data-testid={`account-${k.toLowerCase().replace(/ /g, "-")}`}>{v}</div></div>
        ))}
      </div>
      <div className="panel p-5 mb-5 text-[12.5px] space-y-1.5">
        <div className="section-label mb-2">Security model</div>
        <div className="text-mute">· Access is limited to allow-listed owner emails; there is no public sign-up.</div>
        <div className="text-mute">· Sessions use httpOnly secure cookies; logins are rate limited with lockout after 5 failures.</div>
        <div className="text-mute">· Provider tokens are encrypted at rest and never returned to the browser.</div>
        <div className="text-mute">· Destructive actions require typed confirmation and are recorded below. No shell access is exposed.</div>
      </div>
      {(user.auth_methods || []).includes("password") && <div className="mb-5"><ChangePassword /></div>}
      <Backups />
      <div className="panel overflow-hidden">
        <div className="h-10 px-4 flex items-center border-b border-line text-[12.5px] font-medium">Audit log</div>
        <QueryState query={logs}>
          {logs.data?.length ? (
            <div className="overflow-x-auto">
              <table className="tbl" data-testid="audit-log-table">
                <thead><tr><th>Action</th><th>Target</th><th className="hidden md:table-cell">Detail</th><th className="hidden sm:table-cell">IP</th><th className="text-right">When</th></tr></thead>
                <tbody>
                  {logs.data.map((l) => (
                    <tr key={l.id}><td className="mono text-[11.5px]">{l.action}</td><td className="text-[12px] text-mute truncate max-w-[180px]">{l.target}</td><td className="hidden md:table-cell text-[12px] text-mute truncate max-w-[220px]">{l.detail}</td><td className="hidden sm:table-cell mono text-[11px] text-mute">{l.ip}</td><td className="mono text-[11px] text-mute text-right">{timeAgo(l.created_at)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="No audit entries yet" />}
        </QueryState>
      </div>
    </div>
  );
}
