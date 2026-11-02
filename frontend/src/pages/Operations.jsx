import { useMemo, useState } from "react";
import { Plus, RefreshCw, ExternalLink, ShieldCheck, Undo2 } from "lucide-react";
import { useOps, useAction, opsActions } from "@/lib/queries";
import { api } from "@/lib/api";
import { timeAgo, shortDate } from "@/lib/format";
import { Dot, Empty, PageHeader, QueryState, SourceTag } from "@/components/common";
import { Inspector } from "@/components/Inspector";
import { DataTable, MetricBar, ProjectFilter, RecordSheet, Select, Toolbar } from "@/components/DataTable";

const DEP_COLOR = { success: "#30D158", failed: "#FF453A", building: "#0A84FF", queued: "#929299", canceled: "#636366" };
const RES_COLOR = { running: "#30D158", degraded: "#FF9F0A", down: "#FF453A", unknown: "#636366" };
const ENVS = ["production", "staging", "preview", "development"];
const StatusCell = ({ s, map }) => <span className="inline-flex items-center gap-1.5"><Dot color={map[s] || "#929299"} pulse={s === "building" || s === "down"} size={6} />{s}</span>;
const dur = (s) => (s == null ? "—" : `${Math.floor(s / 60)}m ${s % 60}s`);
const filterBy = (rows, f) => rows.filter((r) => Object.entries(f).every(([k, v]) => !v || r[k] === v));

const DEP_FIELDS = [
  { key: "project_id", label: "Project", type: "project", required: true },
  { key: "environment", label: "Environment", type: "select", options: ENVS },
  { key: "status", label: "Status", type: "select", options: ["success", "failed", "building", "queued", "canceled"] },
  { key: "provider", label: "Provider", placeholder: "manual" }, { key: "commit_sha", label: "Commit SHA" }, { key: "branch", label: "Branch" },
  { key: "author", label: "Author" }, { key: "message", label: "Message" }, { key: "duration_s", label: "Build duration (s)", type: "number" },
  { key: "url", label: "Deployment URL" }, { key: "rollback_url", label: "Rollback / previous build URL" }, { key: "logs", label: "Logs", type: "textarea", rows: 5 },
];

function DeploymentInspector({ d, onClose }) {
  return (
    <Inspector open={!!d} onClose={onClose} title={d?.message || "Deployment"} subtitle={d && `${d.project_name} · ${d.provider}`} testid="deployment-inspector">
      {d && (
        <div className="space-y-5 text-[12.5px]">
          <div className="flex items-center gap-3"><StatusCell s={d.status} map={DEP_COLOR} /><SourceTag source={d.source} /><span className="mono text-mute">{timeAgo(d.deployed_at)}</span></div>
          <div className="grid grid-cols-2 gap-3">
            {[["Environment", d.environment], ["Branch", d.branch], ["Commit", d.commit_sha?.slice(0, 10)], ["Author", d.author], ["Build duration", dur(d.duration_s)], ["Provider", d.provider]].map(([k, v]) => (
              <div key={k}><div className="text-[11px] text-mute">{k}</div><div className="mono mt-0.5">{v || "—"}</div></div>
            ))}
          </div>
          {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-acc hover:underline">{d.url.replace(/^https?:\/\//, "")}<ExternalLink size={11} /></a>}
          <div><div className="section-label mb-2">Deployment logs</div>
            <pre data-testid="deployment-logs" className="mono text-[11.5px] bg-bg0 border border-line rounded-[8px] p-3 max-h-72 overflow-auto whitespace-pre-wrap">{d.logs || "No logs were provided by the source."}</pre>
          </div>
          <div className="rounded-[8px] border border-line p-3">
            <div className="section-label mb-1.5 flex items-center gap-1.5"><Undo2 size={11} /> Rollback</div>
            {d.rollback_url ? (
              <>
                <p className="text-mute text-[12px] mb-2">Rollback runs in {d.provider}'s console so its own checks and confirmation apply. Founder OS never triggers it blindly.</p>
                <a data-testid="deployment-rollback-link" href={d.rollback_url} target="_blank" rel="noreferrer" className="btn btn-outline">Open rollback in {d.provider} <ExternalLink size={12} /></a>
              </>
            ) : <p className="text-mute text-[12px]">Unavailable: no provider rollback endpoint exists for this {d.source} record. Connect Vercel to get rollback links.</p>}
          </div>
        </div>
      )}
    </Inspector>
  );
}

export function DeploymentsView({ projectId }) {
  const q = useOps("deployments", projectId ? { project_id: projectId } : {});
  const [f, setF] = useState({ project_id: "", environment: "", status: "" });
  const [sel, setSel] = useState(null);
  const [edit, setEdit] = useState(null);
  const rows = filterBy(q.data || [], projectId ? { ...f, project_id: "" } : f);
  const failed = (q.data || []).filter((d) => d.status === "failed").length;
  const cols = [
    { key: "status", label: "Status", render: (d) => <StatusCell s={d.status} map={DEP_COLOR} /> },
    { key: "message", label: "Commit", render: (d) => <span className="flex items-center gap-2 max-w-[320px]"><span className="mono text-[11px] text-acc">{d.commit_sha?.slice(0, 7) || "—"}</span><span className="truncate">{d.message}</span></span> },
    ...(projectId ? [] : [{ key: "project_name", label: "Project", cls: "hidden md:table-cell" }]),
    { key: "environment", label: "Env", cls: "hidden sm:table-cell" },
    { key: "branch", label: "Branch", cls: "hidden lg:table-cell", render: (d) => <span className="mono text-[11.5px] text-mute">{d.branch}</span> },
    { key: "author", label: "Author", cls: "hidden xl:table-cell" },
    { key: "provider", label: "Provider", cls: "hidden lg:table-cell" },
    { key: "duration_s", label: "Build", right: true, cls: "hidden md:table-cell", render: (d) => <span className="mono text-[11.5px]">{dur(d.duration_s)}</span> },
    { key: "deployed_at", label: "When", right: true, render: (d) => <span className="mono text-[11.5px] text-mute">{timeAgo(d.deployed_at)}</span> },
    { key: "source", label: "", render: (d) => <SourceTag source={d.source} /> },
  ];
  return (
    <div>
      <Toolbar>
        {!projectId && <ProjectFilter value={f.project_id} onChange={(v) => setF({ ...f, project_id: v })} testid="deployments-project-filter" />}
        <Select testid="deployments-env-filter" value={f.environment} onChange={(v) => setF({ ...f, environment: v })} options={ENVS} all="All environments" />
        <Select testid="deployments-status-filter" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={Object.keys(DEP_COLOR)} all="All statuses" />
        {failed > 0 && <span className="text-[12px] text-bad">{failed} failed build{failed > 1 ? "s" : ""}</span>}
        <button data-testid="new-deployment-btn" className="btn btn-outline ml-auto" onClick={() => setEdit({ project_id: projectId || "", environment: "production", status: "success", branch: "main", provider: "manual" })}><Plus size={13} /> Record deployment</button>
      </Toolbar>
      <QueryState query={q}><DataTable testid="deployments-table" columns={cols} rows={rows} onRowClick={setSel} empty={<Empty title="No deployments" text="Connect Vercel or Railway, push via the ingest API, or record one manually." />} /></QueryState>
      <DeploymentInspector d={sel} onClose={() => setSel(null)} />
      <RecordSheet kind="deployments" title="deployment" fields={DEP_FIELDS} record={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

const RES_TYPES = ["vps", "cloud", "container", "pm2", "postgres", "mysql", "redis", "volume"];
const RES_FIELDS = [
  { key: "project_id", label: "Project", type: "project", required: true }, { key: "name", label: "Name", required: true },
  { key: "type", label: "Type", type: "select", options: RES_TYPES, required: true }, { key: "provider", label: "Provider", placeholder: "Hetzner, AWS…" },
  { key: "region", label: "Region" }, { key: "host", label: "Host" }, { key: "status", label: "Status", type: "select", options: Object.keys(RES_COLOR) },
  { key: "notes", label: "Notes", type: "textarea" },
];

export function InfraView({ projectId, types }) {
  const q = useOps("resources", projectId ? { project_id: projectId } : {});
  const [f, setF] = useState({ project_id: "", type: "", status: "" });
  const [edit, setEdit] = useState(null);
  const rows = filterBy((q.data || []).filter((r) => !types || types.includes(r.type)), projectId ? { ...f, project_id: "" } : f);
  const db = types && types.includes("postgres");
  const cols = [
    { key: "name", label: "Resource", render: (r) => <span className="flex items-center gap-2"><StatusCell s={r.status} map={RES_COLOR} /><span className="font-medium">{r.name}</span></span> },
    { key: "type", label: "Type", render: (r) => <span className="mono text-[11px] uppercase text-mute">{r.type}</span> },
    ...(projectId ? [] : [{ key: "project_name", label: "Project", cls: "hidden md:table-cell" }]),
    { key: "provider", label: "Provider", cls: "hidden lg:table-cell", render: (r) => `${r.provider || "—"}${r.region ? ` · ${r.region}` : ""}` },
    { key: "cpu", label: "CPU", render: (r) => <MetricBar value={r.metrics?.cpu} threshold={r.thresholds?.cpu} /> },
    { key: "ram", label: "RAM", cls: "hidden sm:table-cell", render: (r) => <MetricBar value={r.metrics?.ram} threshold={r.thresholds?.ram} /> },
    { key: "disk", label: "Disk", cls: "hidden md:table-cell", render: (r) => <MetricBar value={r.metrics?.disk} threshold={r.thresholds?.disk} /> },
    { key: db ? "connections" : "net", label: db ? "Connections" : "Network", right: true, cls: "hidden lg:table-cell", render: (r) => <span className="mono text-[11.5px]">{db ? r.metrics?.connections ?? "—" : r.metrics?.net_mbps != null ? `${r.metrics.net_mbps} Mb/s` : "—"}</span> },
    { key: "uptime", label: "Uptime", right: true, cls: "hidden xl:table-cell", render: (r) => <span className="mono text-[11.5px]">{r.metrics?.uptime_pct ? `${r.metrics.uptime_pct.toFixed(2)}%` : "—"}</span> },
    { key: "seen", label: "Seen", right: true, cls: "hidden md:table-cell", render: (r) => <span className="mono text-[11px] text-mute">{timeAgo(r.last_seen_at)}</span> },
    { key: "src", label: "", render: (r) => <SourceTag source={r.metrics_source || r.source} /> },
  ];
  return (
    <div>
      <Toolbar>
        {!projectId && <ProjectFilter value={f.project_id} onChange={(v) => setF({ ...f, project_id: v })} testid="infra-project-filter" />}
        <Select testid="infra-type-filter" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={types || RES_TYPES} all="All types" />
        <Select testid="infra-status-filter" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={Object.keys(RES_COLOR)} all="All statuses" />
        <button data-testid="new-resource-btn" className="btn btn-outline ml-auto" onClick={() => setEdit({ project_id: projectId || "", type: types ? types[0] : "vps", status: "unknown" })}><Plus size={13} /> Add resource</button>
      </Toolbar>
      <QueryState query={q}><DataTable testid="resources-table" columns={cols} rows={rows} onRowClick={setEdit} empty={<Empty title="No resources" text="Add servers, databases and containers, connect AWS, or push metrics from an agent via the ingest API." />} /></QueryState>
      <p className="text-[11px] text-mute mt-2">Metrics come only from agents (ingest API) or providers. Manually added resources show “—” until something reports.</p>
      <RecordSheet kind="resources" title="resource" fields={RES_FIELDS} record={edit} onClose={() => setEdit(null)} deleteConfirmField="name" />
    </div>
  );
}

export function DomainsView({ projectId }) {
  const q = useOps("domains", projectId ? { project_id: projectId } : {});
  const [edit, setEdit] = useState(null);
  const [pf, setPf] = useState("");
  const check = useAction((id) => api.post(`/ops/domains/${id}/check`).then((r) => r.data), { success: "SSL checked" });
  const rows = (q.data || []).filter((d) => !pf || d.project_id === pf);
  const days = (d) => (d.ssl?.expires_at ? Math.round((new Date(d.ssl.expires_at) - Date.now()) / 86400000) : null);
  const cols = [
    { key: "domain", label: "Domain", render: (d) => <span className="mono">{d.domain}</span> },
    ...(projectId ? [] : [{ key: "project_name", label: "Project", cls: "hidden md:table-cell" }]),
    { key: "ssl", label: "SSL", render: (d) => d.ssl ? (d.ssl.valid ? <span className="inline-flex items-center gap-1.5"><ShieldCheck size={12} className="text-ok" />{d.ssl.issuer || "valid"}</span> : <span className="text-bad">{d.ssl.error?.slice(0, 40)}</span>) : <span className="text-mute">Not checked</span> },
    { key: "exp", label: "Expires", right: true, render: (d) => { const n = days(d); return <span className={`mono text-[11.5px] ${n != null && n <= 14 ? "text-warn" : ""}`}>{n == null ? "—" : `${n}d · ${shortDate(d.ssl.expires_at)}`}</span>; } },
    { key: "dns", label: "DNS / Registrar", cls: "hidden lg:table-cell", render: (d) => `${d.dns_provider || "—"} / ${d.registrar || "—"}` },
    { key: "checked", label: "Checked", right: true, cls: "hidden sm:table-cell", render: (d) => <span className="mono text-[11px] text-mute">{timeAgo(d.ssl?.checked_at)}</span> },
    { key: "src", label: "", render: (d) => <SourceTag source={d.ssl_source || d.source} /> },
    { key: "act", label: "", render: (d) => d.source !== "sample" && <button data-testid={`domain-check-${d.id}`} className="btn btn-ghost h-6" onClick={(e) => { e.stopPropagation(); check.mutate(d.id); }}><RefreshCw size={11} /> Check</button> },
  ];
  return (
    <div>
      <Toolbar>
        {!projectId && <ProjectFilter value={pf} onChange={setPf} testid="domains-project-filter" />}
        <button data-testid="new-domain-btn" className="btn btn-outline ml-auto" onClick={() => setEdit({ project_id: projectId || "", auto_renew: true })}><Plus size={13} /> Add domain</button>
      </Toolbar>
      <QueryState query={q}><DataTable testid="domains-table" columns={cols} rows={rows} onRowClick={setEdit} empty={<Empty title="No domains" text="Add a domain and Founder OS checks its real SSL certificate." />} /></QueryState>
      <RecordSheet kind="domains" title="domain" record={edit} onClose={() => setEdit(null)} fields={[
        { key: "project_id", label: "Project", type: "project", required: true }, { key: "domain", label: "Domain", required: true, placeholder: "example.com" },
        { key: "registrar", label: "Registrar" }, { key: "dns_provider", label: "DNS provider" }, { key: "auto_renew", label: "Auto-renew", type: "checkbox" }]} />
    </div>
  );
}

export function JobsView({ projectId }) {
  const q = useOps("jobs", projectId ? { project_id: projectId } : {});
  const [edit, setEdit] = useState(null);
  const cols = [
    { key: "name", label: "Job", render: (j) => <span className="flex items-center gap-2"><Dot color={j.status === "failing" ? "#FF453A" : j.status === "paused" ? "#636366" : "#30D158"} size={6} /><span className="mono">{j.name}</span></span> },
    ...(projectId ? [] : [{ key: "project_name", label: "Project", cls: "hidden md:table-cell" }]),
    { key: "schedule", label: "Schedule", cls: "hidden sm:table-cell", render: (j) => <span className="mono text-[11.5px] text-mute">{j.schedule || "—"}</span> },
    { key: "runs", label: "Runs 24h", right: true, render: (j) => <span className="mono">{j.runs_24h ?? "—"}</span> },
    { key: "fail", label: "Failures", right: true, render: (j) => <span className={`mono ${j.failures_24h ? "text-bad" : ""}`}>{j.failures_24h ?? "—"}</span> },
    { key: "dur", label: "Last duration", right: true, cls: "hidden md:table-cell", render: (j) => <span className="mono text-[11.5px]">{j.last_duration_s != null ? `${j.last_duration_s}s` : "—"}</span> },
    { key: "last", label: "Last run", right: true, render: (j) => <span className="mono text-[11px] text-mute">{timeAgo(j.last_run_at)}</span> },
    { key: "src", label: "", render: (j) => <SourceTag source={j.metrics_source || j.source} /> },
  ];
  return (
    <div>
      <Toolbar><button data-testid="new-job-btn" className="btn btn-outline ml-auto" onClick={() => setEdit({ project_id: projectId || "", status: "active" })}><Plus size={13} /> Add job</button></Toolbar>
      <QueryState query={q}><DataTable testid="jobs-table" columns={cols} rows={q.data || []} onRowClick={setEdit} empty={<Empty title="No background jobs" text="Jobs report runs via the ingest API (type job)." />} /></QueryState>
      <RecordSheet kind="jobs" title="job" record={edit} onClose={() => setEdit(null)} fields={[
        { key: "project_id", label: "Project", type: "project", required: true }, { key: "name", label: "Name", required: true }, { key: "queue", label: "Queue" },
        { key: "schedule", label: "Schedule (cron)" }, { key: "status", label: "Status", type: "select", options: ["active", "paused", "failing"] }, { key: "notes", label: "Notes", type: "textarea" }]} />
    </div>
  );
}

const PAGES = {
  deployments: ["Deployments", "History, build status and logs across every provider.", DeploymentsView],
  infrastructure: ["Infrastructure", "Servers, containers, processes and storage, each tied to a project.", InfraView],
  databases: ["Databases", "PostgreSQL, MySQL and Redis health.", (p) => <InfraView {...p} types={["postgres", "mysql", "redis"]} />],
  domains: ["Domains & SSL", "Real certificate checks with expiry alerts.", DomainsView],
  jobs: ["Background Jobs", "Queues and scheduled work.", JobsView],
};

export default function OpsPage({ page }) {
  const [title, subtitle, View] = PAGES[page];
  const memo = useMemo(() => <View />, [View]);
  return <div data-testid={`${page}-page`}><PageHeader label="Operations" title={title} subtitle={subtitle} />{memo}</div>;
}
export { opsActions };
