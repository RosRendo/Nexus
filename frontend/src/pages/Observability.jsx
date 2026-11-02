import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Plus, RefreshCw, Check } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";
import { useObs, useOps, useAction } from "@/lib/queries";
import { api } from "@/lib/api";
import { timeAgo, num } from "@/lib/format";
import { Dot, Empty, PageHeader, QueryState, SourceTag, StageBadge } from "@/components/common";
import { DataTable, ProjectFilter, RecordSheet, Select, Toolbar } from "@/components/DataTable";

const ENVS = ["production", "staging", "preview", "development"];
const LEVEL_COLOR = { debug: "#636366", info: "#929299", warn: "#FF9F0A", error: "#FF453A", fatal: "#FF453A", warning: "#FF9F0A" };
const STATE_COLOR = { healthy: "#30D158", success: "#30D158", up: "#30D158", running: "#30D158", degraded: "#FF9F0A", failed: "#FF453A", down: "#FF453A", building: "#0A84FF" };
const TT = { contentStyle: { background: "#18181B", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#929299" } };
const AX = { stroke: "#929299", fontSize: 11, tickLine: false, axisLine: false };
const Cell = ({ v }) => (v == null ? <span className="text-mute">—</span> : <span className="inline-flex items-center gap-1.5"><Dot color={STATE_COLOR[v] || "#929299"} pulse={v === "down"} size={7} />{v}</span>);
const HOURS = [{ value: 1, label: "Last hour" }, { value: 24, label: "Last 24h" }, { value: 168, label: "Last 7 days" }, { value: 720, label: "Last 30 days" }];

export function SystemHealth() {
  const q = useObs("health");
  const cols = [
    { key: "name", label: "Project", render: (r) => <Link to={`/projects/${r.slug}`} className="font-medium hover:underline">{r.name}</Link> },
    { key: "stage", label: "Stage", cls: "hidden md:table-cell", render: (r) => <StageBadge stage={r.stage} /> },
    { key: "app", label: "App", render: (r) => <Cell v={r.app} /> },
    { key: "deploy", label: "Last deploy", render: (r) => <Cell v={r.deploy} /> },
    { key: "uptime", label: "Uptime", render: (r) => <Cell v={r.uptime} /> },
    { key: "resources", label: "Resources", cls: "hidden sm:table-cell", render: (r) => <Cell v={r.resources} /> },
    { key: "errors", label: "Open errors", right: true, render: (r) => <span className={`mono ${r.errors > 20 ? "text-bad" : ""}`}>{num(r.errors)}</span> },
    { key: "ssl", label: "SSL", right: true, cls: "hidden md:table-cell", render: (r) => <span className={`mono ${r.ssl_days != null && r.ssl_days <= 14 ? "text-warn" : ""}`}>{r.ssl_days == null ? "—" : `${r.ssl_days}d`}</span> },
    { key: "src", label: "", render: (r) => <span className="flex gap-1">{r.sources.map((s) => <SourceTag key={s} source={s} />)}</span> },
  ];
  return <QueryState query={q}><DataTable testid="health-matrix" columns={cols} rows={(q.data || []).map((r) => ({ ...r, id: r.project_id }))} /></QueryState>;
}

export function LogsExplorer({ projectId }) {
  const [f, setF] = useState({ project_id: "", environment: "", level: "", service: "", hours: 24, q: "" });
  const params = Object.fromEntries(Object.entries({ ...f, project_id: projectId || f.project_id }).filter(([, v]) => v !== ""));
  const q = useObs("logs", params);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  return (
    <div>
      <Toolbar>
        {!projectId && <ProjectFilter value={f.project_id} onChange={set("project_id")} testid="logs-project-filter" />}
        <Select testid="logs-env-filter" value={f.environment} onChange={set("environment")} options={ENVS} all="All envs" />
        <Select testid="logs-level-filter" value={f.level} onChange={set("level")} options={["debug", "info", "warn", "error", "fatal"]} all="All levels" w="w-28" />
        <Select testid="logs-service-filter" value={f.service} onChange={set("service")} options={q.data?.services || []} all="All services" w="w-32" />
        <Select testid="logs-time-filter" value={f.hours} onChange={(v) => setF({ ...f, hours: Number(v) })} options={HOURS} />
        <input data-testid="logs-search-input" className="fos-input h-7 w-48" placeholder="Search messages" value={f.q} onChange={(e) => set("q")(e.target.value)} />
      </Toolbar>
      <div className="panel overflow-hidden" data-testid="logs-list">
        <QueryState query={q}>
          {q.data?.items?.length ? q.data.items.map((l) => (
            <div key={l.id} className="flex items-center gap-3 h-8 px-3 border-b border-line last:border-0 mono text-[11.5px] row-hover">
              <span className="text-mute w-16 shrink-0">{new Date(l.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="w-12 uppercase shrink-0" style={{ color: LEVEL_COLOR[l.level] }}>{l.level}</span>
              <span className="w-16 text-mute shrink-0 hidden sm:inline">{l.service}</span>
              {!projectId && <span className="w-28 text-mute truncate shrink-0 hidden md:inline">{l.project_name}</span>}
              <span className="flex-1 truncate text-ink/90">{l.message}</span>
              <span className="hidden sm:inline text-mute">{l.environment}</span>
              <SourceTag source={l.source} />
            </div>
          )) : <Empty title="No logs in this window" text="Send logs with POST /api/ingest/logs using the project's ingest key." />}
        </QueryState>
      </div>
    </div>
  );
}

export function ErrorTracking({ projectId }) {
  const [f, setF] = useState({ project_id: "", environment: "", status: "open" });
  const [open, setOpen] = useState(null);
  const q = useObs("errors", Object.fromEntries(Object.entries({ ...f, project_id: projectId || f.project_id }).filter(([, v]) => v)));
  const upd = useAction(({ id, status }) => api.patch(`/obs/errors/${id}`, { status }).then((r) => r.data), { success: "Error updated" });
  return (
    <div>
      <Toolbar>
        {!projectId && <ProjectFilter value={f.project_id} onChange={(v) => setF({ ...f, project_id: v })} testid="errors-project-filter" />}
        <Select testid="errors-env-filter" value={f.environment} onChange={(v) => setF({ ...f, environment: v })} options={ENVS} all="All envs" />
        <Select testid="errors-status-filter" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={["open", "resolved", "ignored"]} all="Any status" />
      </Toolbar>
      <div className="panel overflow-hidden" data-testid="errors-list">
        <QueryState query={q}>
          {q.data?.length ? q.data.map((e) => (
            <div key={e.id} className="border-b border-line last:border-0">
              <button data-testid={`error-row-${e.id}`} onClick={() => setOpen(open === e.id ? null : e.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left row-hover">
                <ChevronRight size={13} className={`text-mute transition-transform ${open === e.id ? "rotate-90" : ""}`} />
                <Dot color={LEVEL_COLOR[e.level]} size={7} />
                <div className="flex-1 min-w-0"><div className="text-[12.5px] font-medium truncate mono">{e.title}</div>
                  <div className="text-[11px] text-mute">{e.project_name} · {e.service} · {e.environment} · first seen {timeAgo(e.first_seen)}</div></div>
                <span className="mono text-[12px]">{num(e.count)}×</span>
                <span className="mono text-[11px] text-mute w-16 text-right hidden sm:inline">{timeAgo(e.last_seen)}</span>
                <SourceTag source={e.source} />
              </button>
              {open === e.id && (
                <div className="px-9 pb-3">
                  <pre data-testid={`error-stack-${e.id}`} className="mono text-[11.5px] bg-bg0 border border-line rounded-[8px] p-3 overflow-auto max-h-72 whitespace-pre-wrap text-ink/85">{e.stack || "No stack trace captured."}</pre>
                  <div className="flex gap-2 mt-2">
                    {e.status !== "resolved" && <button data-testid={`error-resolve-${e.id}`} className="btn btn-outline h-7" onClick={() => upd.mutate({ id: e.id, status: "resolved" })}><Check size={12} /> Resolve</button>}
                    {e.status !== "ignored" && <button className="btn btn-ghost h-7" onClick={() => upd.mutate({ id: e.id, status: "ignored" })}>Ignore</button>}
                    {e.status !== "open" && <button className="btn btn-ghost h-7" onClick={() => upd.mutate({ id: e.id, status: "open" })}>Reopen</button>}
                    {e.link && <a href={e.link} target="_blank" rel="noreferrer" className="btn btn-ghost h-7">Open in Sentry</a>}
                  </div>
                </div>
              )}
            </div>
          )) : <Empty title="No errors" text="Errors arrive from Sentry or POST /api/ingest/errors." />}
        </QueryState>
      </div>
    </div>
  );
}

export function ApiPerformance({ projectId }) {
  const [env, setEnv] = useState("production");
  const [pf, setPf] = useState("");
  const q = useObs("metrics", { environment: env, ...(projectId || pf ? { project_id: projectId || pf } : {}) });
  const cols = [
    { key: "endpoint", label: "Endpoint", render: (r) => <span className="mono text-[11.5px]">{r.endpoint}</span> },
    ...(projectId ? [] : [{ key: "project_name", label: "Project", cls: "hidden md:table-cell" }]),
    ...["p50", "p95", "p99"].map((k) => ({ key: k, label: k, right: true, render: (r) => <span className={`mono ${k === "p95" && r.p95 > 500 ? "text-warn" : ""}`}>{r[k]}ms</span> })),
    { key: "rpm", label: "Req/min", right: true, render: (r) => <span className="mono">{num(r.rpm)}</span> },
    { key: "error_rate", label: "Errors", right: true, render: (r) => <span className={`mono ${r.error_rate >= 5 ? "text-bad" : ""}`}>{r.error_rate}%</span> },
    { key: "src", label: "", render: (r) => <SourceTag source={r.source} /> },
  ];
  return (
    <div>
      <Toolbar>
        {!projectId && <ProjectFilter value={pf} onChange={setPf} testid="perf-project-filter" />}
        <Select testid="perf-env-filter" value={env} onChange={setEnv} options={ENVS} />
      </Toolbar>
      <QueryState query={q}>
        {q.data && (
          <>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              {[["p95 latency (ms)", "p95", "#0A84FF"], ["Request volume (req/min)", "rpm", "#30D158"]].map(([t, k, c]) => (
                <div key={k} className="panel p-4" data-testid={`perf-chart-${k}`}><div className="section-label mb-3">{t}</div>
                  <div className="h-44"><ResponsiveContainer><LineChart data={q.data.series}><CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} /><XAxis dataKey="t" {...AX} /><YAxis {...AX} width={40} /><Tooltip {...TT} /><Line dataKey={k} stroke={c} dot={false} strokeWidth={1.6} /></LineChart></ResponsiveContainer></div>
                </div>
              ))}
            </div>
            <DataTable testid="perf-table" columns={cols} rows={q.data.endpoints} empty={<Empty title="No request metrics" text="Send them with POST /api/ingest/metrics." />} />
          </>
        )}
      </QueryState>
    </div>
  );
}

export function UptimeView({ projectId }) {
  const q = useOps("monitors", projectId ? { project_id: projectId } : {});
  const [edit, setEdit] = useState(null);
  const run = useAction(() => api.post("/monitors/run", null, { params: projectId ? { project_id: projectId } : {} }).then((r) => r.data), { success: "Checks completed" });
  return (
    <div>
      <Toolbar>
        <span className="text-[12px] text-mute">Real HTTP checks run every 15 minutes and on demand.</span>
        <button data-testid="uptime-run-btn" className="btn btn-outline ml-auto" disabled={run.isPending} onClick={() => run.mutate()}><RefreshCw size={13} className={run.isPending ? "animate-spin" : ""} /> Check now</button>
        <button data-testid="new-monitor-btn" className="btn btn-primary" onClick={() => setEdit({ project_id: projectId || "", interval_min: 15 })}><Plus size={13} /> Add monitor</button>
      </Toolbar>
      <div className="panel overflow-hidden" data-testid="monitors-list">
        <QueryState query={q}>
          {q.data?.length ? q.data.map((m) => {
            const h = m.history || [];
            const pct = h.length ? (100 * h.filter((x) => x.up).length) / h.length : null;
            return (
              <div key={m.id} data-testid={`monitor-row-${m.id}`} onClick={() => setEdit(m)} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 border-b border-line last:border-0 row-hover cursor-pointer">
                <span className="w-14 shrink-0"><Cell v={m.up == null ? null : m.up ? "up" : "down"} /></span>
                <div className="min-w-0 w-56"><div className="text-[12.5px] truncate">{m.name}</div><div className="mono text-[11px] text-mute truncate">{m.url}</div></div>
                <div className="flex items-end gap-[2px] h-5 flex-1 min-w-[120px]">{h.slice(-40).map((x, i) => <span key={i} className="w-[4px] rounded-[1px]" style={{ height: "100%", background: x.up ? "#30D15899" : "#FF453A" }} title={`${x.ms}ms · ${x.t}`} />)}</div>
                <span className="mono text-[11.5px] w-16 text-right">{pct == null ? "—" : `${pct.toFixed(1)}%`}</span>
                <span className="mono text-[11.5px] w-14 text-right">{m.last_latency_ms != null ? `${m.last_latency_ms}ms` : "—"}</span>
                <span className="mono text-[11px] text-mute w-16 text-right">{timeAgo(m.last_checked_at)}</span>
                <SourceTag source={m.source === "sample" ? "sample" : "live"} />
              </div>
            );
          }) : <Empty title="No monitors" text="Add a URL and Founder OS checks it for real." />}
        </QueryState>
      </div>
      <RecordSheet kind="monitors" title="monitor" record={edit} onClose={() => setEdit(null)} fields={[
        { key: "project_id", label: "Project", type: "project", required: true }, { key: "name", label: "Name", required: true },
        { key: "url", label: "URL", required: true, placeholder: "https://…" }, { key: "interval_min", label: "Interval (minutes, min 15)", type: "number" }]} />
    </div>
  );
}

export function Analytics() {
  const q = useObs("analytics");
  const rows = (q.data || []).filter((p) => p.series?.length);
  return (
    <QueryState query={q}>
      {!rows.length ? <div className="panel"><Empty title="No analytics yet" text="Connect PostHog and link a PostHog project ID in each project's Settings." /></div> : (
        <div className="grid md:grid-cols-2 gap-4" data-testid="analytics-grid">
          {rows.map((p) => (
            <div key={p.project_id} className="panel p-4">
              <div className="flex items-center gap-2 mb-1"><span className="text-[13px] font-medium">{p.name}</span><SourceTag source={p.source} /></div>
              <div className="text-[11.5px] text-mute mb-3">Daily active users · last {p.series.length} days · latest <span className="mono text-ink">{num(p.series[p.series.length - 1].users)}</span></div>
              <div className="h-32"><ResponsiveContainer><BarChart data={p.series}><XAxis dataKey="date" {...AX} tickFormatter={(d) => d.slice(5)} /><YAxis {...AX} width={36} /><Tooltip {...TT} cursor={{ fill: "rgba(255,255,255,0.04)" }} /><Bar dataKey="users" fill="#0A84FF" radius={[2, 2, 0, 0]} /></BarChart></ResponsiveContainer></div>
            </div>
          ))}
        </div>
      )}
    </QueryState>
  );
}

const PAGES = {
  health: ["System Health", "Every project's health signals in one matrix.", SystemHealth],
  logs: ["Logs Explorer", "Filter by project, environment, severity, service and time.", LogsExplorer],
  errors: ["Error Tracking", "Grouped errors with expandable stack traces.", ErrorTracking],
  performance: ["API Performance", "Latency percentiles and request volume.", ApiPerformance],
  uptime: ["Uptime Monitoring", "Real HTTP checks with history.", UptimeView],
  analytics: ["Analytics", "Active users per product.", Analytics],
};

export default function ObsPage({ page }) {
  const [title, subtitle, View] = PAGES[page];
  return <div data-testid={`${page}-page`}><PageHeader label="Observability" title={title} subtitle={subtitle} /><View /></div>;
}
