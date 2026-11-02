import { useState } from "react";
import { Github, Eye, Copy, RefreshCw, Unplug, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { api, API } from "@/lib/api";
import { useAction, useIntegrations, useGet } from "@/lib/queries";
import { timeAgo } from "@/lib/format";
import { ConfirmDialog, Dot, Field, PageHeader, QueryState, SourceTag } from "@/components/common";

const STATUS = { connected: ["#30D158", "Connected"], error: ["#FF453A", "Error"], disconnected: ["#636366", "Not connected"], demo: ["#FF9F0A", "Demo adapter"] };

function GitHubCard({ gh }) {
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const connect = useAction((t) => api.post("/integrations/github/connect", { token: t }).then((r) => r.data), { success: "GitHub connected", onDone: () => setToken("") });
  const test = useAction(() => api.post("/integrations/github/test").then((r) => r.data), { success: "Connection checked" });
  const disconnect = useAction((c) => api.post("/integrations/github/disconnect", { confirm: c }).then((r) => r.data), { success: "GitHub disconnected", onDone: () => { setConfirm(false); setSecret(null); } });
  const reveal = async () => { const { data } = await api.get("/integrations/github/webhook-secret"); setSecret(data.secret); };
  const copy = (v) => navigator.clipboard.writeText(v).then(() => toast.success("Copied"));
  const connected = gh.status !== "disconnected";
  const hook = `${API}/integrations/github/webhook`;
  return (
    <div className="px-4 pb-4 pt-1 space-y-4" data-testid="github-integration-detail">
      {!connected ? (
        <form className="flex flex-col sm:flex-row gap-2 sm:items-end" onSubmit={(e) => { e.preventDefault(); connect.mutate(token.trim()); }}>
          <div className="flex-1"><Field label="Fine-grained personal access token" hint="Read-only: Metadata, Contents, Pull requests, Actions. Encrypted at rest and never sent back to the browser.">
            <input data-testid="github-token-input" type="password" autoComplete="off" className="fos-input" placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
          </Field></div>
          <button data-testid="github-connect-btn" disabled={token.trim().length < 20 || connect.isPending} className="btn btn-primary sm:mb-5"><KeyRound size={13} /> {connect.isPending ? "Verifying…" : "Connect"}</button>
        </form>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            {[["Account", gh.config?.account], ["Token", gh.config?.token_hint], ["Scopes", gh.config?.scopes], ["Connected", timeAgo(gh.connected_at)]].map(([k, v]) => (
              <div key={k}><div className="text-mute text-[11px]">{k}</div><div className="mono mt-0.5 truncate">{v || "—"}</div></div>
            ))}
          </div>
          <div className="rounded-[8px] border border-line p-3 space-y-2 text-[12px]">
            <div className="section-label">Webhook (optional)</div>
            <div className="text-mute">In each repo: Settings → Webhooks → Add. Content type application/json. Events: push, pull_request, workflow_run.</div>
            <div className="flex items-center gap-2"><span className="text-mute w-16">URL</span><code className="mono text-[11.5px] truncate flex-1">{hook}</code><button className="btn btn-ghost h-6 px-1.5" onClick={() => copy(hook)}><Copy size={12} /></button></div>
            <div className="flex items-center gap-2"><span className="text-mute w-16">Secret</span>
              {secret ? <><code data-testid="github-webhook-secret" className="mono text-[11.5px] truncate flex-1">{secret}</code><button className="btn btn-ghost h-6 px-1.5" onClick={() => copy(secret)}><Copy size={12} /></button></>
                : <button data-testid="github-reveal-secret-btn" className="btn btn-ghost h-6" onClick={reveal}><Eye size={12} /> Reveal (logged)</button>}
            </div>
          </div>
          <div className="flex gap-2">
            <button data-testid="github-test-btn" className="btn btn-outline" disabled={test.isPending} onClick={() => test.mutate()}><RefreshCw size={13} /> Test connection</button>
            <button data-testid="github-disconnect-btn" className="btn btn-danger" onClick={() => setConfirm(true)}><Unplug size={13} /> Disconnect</button>
          </div>
        </>
      )}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Disconnect GitHub?" description="The encrypted token and webhook secret are erased. Projects fall back to DEMO repository data." typeToConfirm="disconnect github" actionLabel="Disconnect" pending={disconnect.isPending} onConfirm={(c) => disconnect.mutate(c)} />
    </div>
  );
}

function ProviderCard({ p, fields }) {
  const [cr, setCr] = useState({});
  const [confirm, setConfirm] = useState(false);
  const connect = useAction((body) => api.post(`/integrations/${p.key}/connect`, { credentials: body }).then((r) => r.data), { success: `${p.name} connected`, onDone: () => setCr({}) });
  const sync = useAction(() => api.post(`/integrations/${p.key}/sync`).then((r) => r.data), { success: "Sync complete" });
  const disconnect = useAction((c) => api.post(`/integrations/${p.key}/disconnect`, { confirm: c }).then((r) => r.data), { success: `${p.name} disconnected`, onDone: () => setConfirm(false) });
  const connected = p.status !== "disconnected";
  const ok = (fields || []).filter((f) => f.required).every((f) => (cr[f.key] || "").trim());
  return (
    <div className="px-4 pb-4 pt-1 space-y-3" data-testid={`${p.key}-integration-detail`}>
      {!connected ? (
        <form className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end" onSubmit={(e) => { e.preventDefault(); connect.mutate(cr); }}>
          {(fields || []).map((f) => (
            <Field key={f.key} label={f.label}><input data-testid={`${p.key}-field-${f.key}`} type={/token|key|secret|bearer/.test(f.key) ? "password" : "text"} autoComplete="off" className="fos-input" value={cr[f.key] || ""} onChange={(e) => setCr({ ...cr, [f.key]: e.target.value })} /></Field>
          ))}
          <button data-testid={`${p.key}-connect-btn`} disabled={!ok || connect.isPending} className="btn btn-primary"><KeyRound size={13} /> {connect.isPending ? "Verifying…" : "Connect"}</button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-4 text-[12px]">
          {Object.entries(p.config || {}).filter(([, v]) => v != null && typeof v !== "object").map(([k, v]) => <span key={k}><span className="text-mute">{k.replace(/_/g, " ")}: </span><span className="mono">{String(v)}</span></span>)}
          <div className="flex gap-2 ml-auto">
            <button data-testid={`${p.key}-sync-btn`} className="btn btn-outline" disabled={sync.isPending} onClick={() => sync.mutate()}><RefreshCw size={13} className={sync.isPending ? "animate-spin" : ""} /> Sync now</button>
            <button data-testid={`${p.key}-disconnect-btn`} className="btn btn-danger" onClick={() => setConfirm(true)}><Unplug size={13} /> Disconnect</button>
          </div>
        </div>
      )}
      {p.link && <p className="text-[11px] text-mute">Link projects in Workspace → Settings → Integrations ({p.link.replace(/_/g, " ")}).</p>}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`Disconnect ${p.name}?`} description="Encrypted credentials are erased. Already synced records stay, tagged LIVE with their sync time." typeToConfirm={`disconnect ${p.key}`} actionLabel="Disconnect" pending={disconnect.isPending} onConfirm={(c) => disconnect.mutate(c)} />
    </div>
  );
}

const AgentCard = ({ p }) => (
  <div className="px-4 pb-3 -mt-1 text-[11.5px] text-mute">
    Runs through a small agent script on your server that reads {p.key === "docker" ? "docker stats" : "pm2 jlist"} and posts JSON to <code className="mono">{API}/ingest/resource</code> with header X-Ingest-Key. Payload: <code className="mono">{`{"name":"api","type":"${p.key === "docker" ? "container" : "pm2"}","status":"running","cpu":12.5,"ram":40,"disk":55,"restarts":0}`}</code>. Founder OS never opens a shell on your servers.
  </div>
);

export default function Integrations() {
  const q = useIntegrations();
  const fields = useGet("integration-fields", "/integrations/fields");
  return (
    <div data-testid="integrations-page">
      <PageHeader label="Settings" title="Integrations" subtitle="Independent provider adapters. Nothing is reported as connected unless the provider confirmed it. Sample projects keep DEMO data until linked." />
      <QueryState query={q}>
        <div className="panel overflow-hidden">
          {(q.data || []).map((p) => {
            const [color, label] = STATUS[p.status] || STATUS.disconnected;
            return (
              <div key={p.key} data-testid={`integration-row-${p.key}`} className="border-b border-line last:border-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <div className="flex items-center gap-2.5 w-56">
                    {p.key === "github" ? <Github size={15} /> : <span className="w-[15px] h-[15px] rounded-[4px] bg-white/10" />}
                    <div><div className="text-[13px] font-medium">{p.name}</div><div className="text-[11px] text-mute">{p.category}</div></div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[12px] w-32" data-testid={`integration-status-${p.key}`}><Dot color={color} />{label}</span>
                  <span className="text-[11.5px] text-mute w-36">Auth: {p.auth_status.replace("_", " ")}</span>
                  <span className="text-[11.5px] text-mute w-32 mono">Sync: {timeAgo(p.last_sync_at)}</span>
                  <span className="hidden lg:block text-[11.5px] text-mute flex-1 truncate">{p.capabilities.join(" · ")}</span>
                  <span className="ml-auto">{p.status === "connected" && <SourceTag source="live" />}</span>
                </div>
                {p.last_error && <div className="px-4 pb-2 text-[11.5px] text-bad" data-testid={`integration-error-${p.key}`}>Last error: {p.last_error}</div>}
                {p.key === "github" ? <GitHubCard gh={p} /> : p.adapter === "agent" ? <AgentCard p={p} /> : <ProviderCard p={p} fields={fields.data?.[p.key]} />}
              </div>
            );
          })}
        </div>
      </QueryState>
    </div>
  );
}
