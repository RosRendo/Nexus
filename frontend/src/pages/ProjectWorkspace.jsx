import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ExternalLink, Github, Archive, RotateCcw, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { actions, useAction, useActivity, useMilestones, useProject, useTasks } from "@/lib/queries";
import { TASK_STATUSES } from "@/lib/constants";
import { money, num, shortDate, timeAgo } from "@/lib/format";
import { ConfirmDialog, Dot, Empty, ErrorState, HealthDot, LoadingRows, PriorityIcon, ProjectLogo, Progress, QueryState, SourceTag, StageBadge } from "@/components/common";
import { TaskViews } from "@/components/tasks/TaskViews";
import { Roadmap } from "@/components/roadmap/Roadmap";
import { DocsPane } from "@/components/docs/DocsPane";
import { GitHubPanel, GitHubRuns } from "@/components/GitHubPanel";
import { EventRow } from "@/components/feed";
import { ProjectFields, projectToForm, formToPayload } from "@/components/projects/ProjectForm";
import { DeploymentsView, InfraView, DomainsView, JobsView } from "@/pages/Operations";
import { UptimeView, ApiPerformance, ErrorTracking, LogsExplorer } from "@/pages/Observability";
import { api, API } from "@/lib/api";

const LINKS = [["vercel_project_id", "Vercel project ID"], ["railway_service_id", "Railway service ID"], ["sentry_project", "Sentry project slug"], ["posthog_project_id", "PostHog project ID"]];

function ProviderLinks({ p }) {
  const [links, setLinks] = useState(p.links || {});
  const [confirm, setConfirm] = useState(false);
  const [key, setKey] = useState(null);
  const save = useAction(actions.updateProject, { success: "Provider links saved" });
  const rotate = useAction((c) => api.post(`/projects/${p.id}/ingest-key`, { confirm: c }).then((r) => r.data), { success: "Ingest key rotated", onDone: (d) => { setKey(d.key); setConfirm(false); } });
  return (
    <div className="panel p-5 space-y-4" data-testid="project-provider-links">
      <div className="section-label">Integrations</div>
      <div className="grid sm:grid-cols-2 gap-3">
        {LINKS.map(([k, l]) => (
          <label key={k} className="block"><span className="block text-[11.5px] text-mute mb-1.5">{l}</span>
            <input data-testid={`link-${k}`} className="fos-input" value={links[k] || ""} onChange={(e) => setLinks({ ...links, [k]: e.target.value })} /></label>
        ))}
      </div>
      <button data-testid="save-links-btn" className="btn btn-outline" onClick={() => save.mutate({ id: p.id, links: { vercel_project_id: "", railway_service_id: "", sentry_project: "", posthog_project_id: "", ...links } })}>Save links</button>
      <div className="pt-4 border-t border-line text-[12px] space-y-2">
        <div className="font-medium">Ingest API key {p.ingest_key_hint && <span className="mono text-mute">…{p.ingest_key_hint}</span>}</div>
        <p className="text-mute">Agents (Docker, PM2, CI, your app) push logs, errors, metrics, resources, deployments and jobs to <code className="mono">POST {API}/ingest/&lt;logs|errors|metrics|resource|deployment|job&gt;</code> with header <code className="mono">X-Ingest-Key</code>. Rotating invalidates the old key immediately.</p>
        {key && <div className="rounded-[7px] border border-warn/40 bg-warn/10 p-2"><div className="text-warn text-[11.5px] mb-1">Copy now. It will not be shown again.</div><code data-testid="ingest-key-value" className="mono text-[11.5px] break-all">{key}</code></div>}
        <button data-testid="rotate-ingest-key-btn" className="btn btn-outline" onClick={() => setConfirm(true)}>{p.ingest_key_hint ? "Rotate key" : "Generate key"}</button>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Rotate ingest key?" description="Any agent using the current key stops being accepted." typeToConfirm={p.name} actionLabel="Rotate" pending={rotate.isPending} onConfirm={(c) => rotate.mutate(c)} />
    </div>
  );
}

const TABS = ["overview", "tasks", "roadmap", "deployments", "infrastructure", "monitoring", "docs", "settings"];
const TAB_LABEL = { docs: "Documentation" };

const Metric = ({ label, value, tag }) => (
  <div className="bg-s1 px-4 py-3">
    <div className="text-[11px] text-mute flex items-center gap-1.5">{label}{tag && <SourceTag source={tag} />}</div>
    <div className="mono text-[18px] mt-1">{value}</div>
  </div>
);

function Overview({ p }) {
  const tasks = useTasks({ project_id: p.id });
  const ms = useMilestones({ project_id: p.id });
  const act = useActivity({ project_id: p.id, limit: 8 });
  const list = tasks.data || [];
  const done = list.filter((t) => t.status === "completed").length;
  const next = (ms.data || []).find((m) => m.status !== "completed");
  const t = p.telemetry;
  const bizTag = p.source === "sample" ? "sample" : "manual";
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5" data-testid="workspace-overview">
      <div className="space-y-5 min-w-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line rounded-[10px] overflow-hidden border border-line">
          <Metric label="Monthly revenue" value={money(p.business?.monthly_revenue)} tag={bizTag} />
          <Metric label="Monthly expenses" value={money(p.business?.monthly_expenses)} tag={bizTag} />
          <Metric label="Active users" value={num(t?.active_users)} tag={t ? "demo" : null} />
          <Metric label="Errors 24h" value={num(t?.errors_24h)} tag={t ? "demo" : null} />
        </div>
        <div className="panel p-4">
          <div className="section-label mb-3">Development progress</div>
          <QueryState query={tasks} rows={2}>
            <div className="flex items-center justify-between text-[12.5px] mb-2"><span>{done} of {list.length} tasks completed</span><span className="mono text-mute">{list.length ? Math.round((100 * done) / list.length) : 0}%</span></div>
            <Progress value={list.length ? (100 * done) / list.length : 0} />
            <div className="flex flex-wrap gap-4 mt-4">
              {TASK_STATUSES.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5 text-[12px]"><Dot color={s.color} size={6} />{s.label}<span className="mono text-mute">{list.filter((x) => x.status === s.key).length}</span></span>)}
            </div>
            {next && (
              <div className="mt-4 pt-4 border-t border-line flex items-center gap-3 text-[12.5px]">
                <span className="text-mute">Next milestone</span><span className="font-medium">{next.title}</span>
                <span className="mono text-mute">{shortDate(next.due_date)}</span>
                <div className="flex-1 max-w-40"><Progress value={next.progress} /></div><span className="mono text-[11px] text-mute">{next.progress}%</span>
              </div>
            )}
          </QueryState>
        </div>
        <div className="panel overflow-hidden">
          <div className="h-10 px-3 flex items-center border-b border-line text-[12.5px] font-medium">Recent activity</div>
          <QueryState query={act} rows={4}>
            {act.data?.items?.length ? act.data.items.map((e) => <EventRow key={e.id} event={e} showProject={false} />) : <Empty title="No activity yet" />}
          </QueryState>
        </div>
      </div>
      <div className="space-y-5">
        <GitHubPanel projectId={p.id} />
        <div className="panel p-4 text-[12.5px] space-y-2">
          <div className="section-label mb-1">Stack</div>
          {p.dev?.stack?.length ? <div className="flex flex-wrap gap-1.5">{p.dev.stack.map((s) => <span key={s} className="chip">{s}</span>)}</div> : <div className="text-mute">No stack recorded.</div>}
          {p.dev?.architecture_notes && <p className="text-mute pt-2 whitespace-pre-wrap">{p.dev.architecture_notes}</p>}
          {p.tags?.length > 0 && <div className="pt-2 flex flex-wrap gap-1.5">{p.tags.map((t) => <span key={t} className="text-[11px] text-mute">#{t}</span>)}</div>}
        </div>
      </div>
    </div>
  );
}


function Settings({ p }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(projectToForm(p));
  const [rules, setRules] = useState(p.notification_rules || {});
  const [confirm, setConfirm] = useState(null);
  useEffect(() => { setForm(projectToForm(p)); setRules(p.notification_rules || {}); }, [p]);
  const save = useAction(actions.updateProject, { success: "Project saved", onDone: (np) => np.slug !== p.slug && navigate(`/projects/${np.slug}/settings`, { replace: true }) });
  const saveRules = useAction(actions.updateProject, { success: "Notification rules saved" });
  const archive = useAction(actions.updateProject, { success: "Project archived", onDone: () => setConfirm(null) });
  const restore = useAction(actions.restoreProject, { success: "Project restored" });
  const del = useAction(actions.deleteProject, { success: "Project moved to trash", onDone: () => navigate("/projects") });
  const RULES = [["failed_deployments", "Failed deployments"], ["downtime", "API downtime"], ["error_spikes", "Error spikes"], ["blocked_tasks", "Blocked tasks"]];
  return (
    <div className="max-w-3xl space-y-6" data-testid="workspace-settings">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate({ id: p.id, ...formToPayload(form), slug: form.slug }); }} className="space-y-6">
        {[["identity", "Project information"], ["development", "Development"], ["production", "Production & environment"], ["business", "Business"]].map(([k, l]) => (
          <div key={k} className="panel p-5"><div className="section-label mb-4">{l}</div><ProjectFields value={form} onChange={setForm} section={k} /></div>
        ))}
        <div className="flex justify-end"><button data-testid="project-settings-save-btn" type="submit" disabled={!form.name.trim() || save.isPending} className="btn btn-primary">{save.isPending ? "Saving…" : "Save changes"}</button></div>
      </form>
      <ProviderLinks p={p} />
      <div className="panel p-5">
        <div className="section-label mb-1">Notification rules</div>
        <p className="text-[12px] text-mute mb-3">Matching live alerts go to the in-app Notifications inbox and, for critical alerts, by email.</p>
        {RULES.map(([k, l]) => (
          <div key={k} className="flex items-center justify-between h-9 border-b border-line last:border-0 text-[12.5px]">
            {l}<Switch data-testid={`notify-rule-${k}`} checked={!!rules[k]} onCheckedChange={(v) => { const n = { ...rules, [k]: v }; setRules(n); saveRules.mutate({ id: p.id, notification_rules: n }); }} />
          </div>
        ))}
      </div>
      <div className="panel p-5 border-bad/30">
        <div className="section-label mb-3 text-bad">Danger zone</div>
        <div className="flex flex-wrap gap-2">
          {p.stage === "archived"
            ? <button data-testid="project-restore-btn" className="btn btn-outline" onClick={() => restore.mutate(p.id)}><RotateCcw size={13} /> Restore from archive</button>
            : <button data-testid="project-archive-btn" className="btn btn-outline" onClick={() => setConfirm("archive")}><Archive size={13} /> Archive project</button>}
          <button data-testid="project-delete-btn" className="btn btn-danger" onClick={() => setConfirm("delete")}><Trash2 size={13} /> Delete project</button>
        </div>
      </div>
      <ConfirmDialog open={confirm === "archive"} onOpenChange={() => setConfirm(null)} title={`Archive ${p.name}?`} description="It leaves the active portfolio and alerts. You can restore it any time." danger={false} actionLabel="Archive" pending={archive.isPending} onConfirm={() => archive.mutate({ id: p.id, stage: "archived" })} />
      <ConfirmDialog open={confirm === "delete"} onOpenChange={() => setConfirm(null)} title={`Delete ${p.name}?`} description="The project and its records move to trash. This action is logged and can be restored from All Projects → Trash." typeToConfirm={p.name} actionLabel="Delete project" pending={del.isPending} onConfirm={(name) => del.mutate({ id: p.id, confirm_name: name })} />
    </div>
  );
}

export default function ProjectWorkspace() {
  const { id, tab = "overview" } = useParams();
  const q = useProject(id);
  if (q.isLoading) return <LoadingRows rows={8} />;
  if (q.isError) return q.error?.response?.status === 404 ? <Empty title="Project not found" text="It may have been deleted." action={<Link to="/projects" className="btn btn-outline">All projects</Link>} /> : <ErrorState error={q.error} onRetry={q.refetch} />;
  const p = q.data;
  const urls = [["Production", p.prod?.production_url], ["Preview", p.prod?.preview_url]].filter(([, u]) => u);
  return (
    <div data-testid="project-workspace">
      <div className="flex flex-wrap items-start gap-4 mb-5">
        <ProjectLogo project={p} size={40} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 data-testid="workspace-title" className="text-[22px] font-semibold tracking-tight">{p.name}</h1>
            {p.source === "sample" && <SourceTag source="sample" />}
            {p.deleted_at && <span className="text-[11px] text-bad">In trash</span>}
          </div>
          <div className="flex items-center gap-4 mt-1 flex-wrap text-[12px] text-mute">
            <StageBadge stage={p.stage} /><HealthDot telemetry={p.telemetry} /><PriorityIcon priority={p.priority} showLabel />
            {p.dev?.repo && <span className="inline-flex items-center gap-1 mono text-[11.5px]"><Github size={11} />{p.dev.repo}</span>}
            {urls.map(([k, u]) => <a key={k} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-acc hover:underline">{k}<ExternalLink size={10} /></a>)}
            <span className="mono">updated {timeAgo(p.updated_at)}</span>
          </div>
        </div>
      </div>
      <div className="scroll-x flex gap-1 border-b border-line mb-5" data-testid="workspace-tabs">
        {TABS.map((t) => (
          <Link key={t} to={`/projects/${p.slug}/${t === "overview" ? "" : t}`} data-testid={`workspace-tab-${t}`}
            className={`shrink-0 h-9 px-3 flex items-center text-[12.5px] capitalize border-b-2 -mb-px transition-colors ${tab === t ? "border-ink text-ink" : "border-transparent text-mute hover:text-ink"}`}>
            {TAB_LABEL[t] || t}
          </Link>
        ))}
      </div>
      {tab === "overview" && <Overview p={p} />}
      {tab === "tasks" && <TaskViews projectId={p.id} projectSlug={p.slug} />}
      {tab === "roadmap" && <Roadmap projectId={p.id} />}
      {tab === "deployments" && <div className="space-y-6"><DeploymentsView projectId={p.id} /><GitHubRuns projectId={p.id} /></div>}
      {tab === "infrastructure" && <div className="space-y-6"><InfraView projectId={p.id} /><div><div className="section-label mb-2">Domains & SSL</div><DomainsView projectId={p.id} /></div><div><div className="section-label mb-2">Background jobs</div><JobsView projectId={p.id} /></div></div>}
      {tab === "monitoring" && <div className="space-y-6"><UptimeView projectId={p.id} /><ApiPerformance projectId={p.id} /><div><div className="section-label mb-2">Errors</div><ErrorTracking projectId={p.id} /></div><div><div className="section-label mb-2">Logs</div><LogsExplorer projectId={p.id} /></div></div>}
      {tab === "docs" && <DocsPane projectId={p.id} />}
      {tab === "settings" && <Settings p={p} />}
    </div>
  );
}
