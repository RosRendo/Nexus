import { useState } from "react";
import { Siren, Activity as ActivityIcon } from "lucide-react";
import { useActivity, useAttention, useProjects } from "@/lib/queries";
import { SEVERITY } from "@/lib/constants";
import { Empty, PageHeader, QueryState } from "@/components/common";
import { AlertRow, EventRow } from "@/components/feed";

function ProjectSelect({ value, onChange, testid }) {
  const projects = useProjects();
  return (
    <select data-testid={testid} className="fos-input h-7 w-44" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All projects</option>
      {(projects.data?.items || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

export function AttentionPage() {
  const [showAck, setShowAck] = useState(false);
  const [sev, setSev] = useState("");
  const [project, setProject] = useState("");
  const q = useAttention({ include_acknowledged: showAck });
  const items = (q.data || []).filter((a) => (!sev || a.severity === sev) && (!project || a.project_id === project));
  const counts = Object.keys(SEVERITY).map((k) => [k, (q.data || []).filter((a) => a.severity === k && !a.acknowledged).length]);
  return (
    <div data-testid="attention-page">
      <PageHeader label="Overview" title="Attention Center" subtitle="What is broken, sorted by severity." />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button className="chip" data-active={!sev} onClick={() => setSev("")} data-testid="severity-filter-all">All</button>
        {counts.map(([k, n]) => (
          <button key={k} className="chip" data-active={sev === k} onClick={() => setSev(k)} data-testid={`severity-filter-${k}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: SEVERITY[k].color }} />{SEVERITY[k].label}<span className="mono">{n}</span>
          </button>
        ))}
        <ProjectSelect value={project} onChange={setProject} testid="attention-project-filter" />
        <label className="chip cursor-pointer" data-active={showAck}><input data-testid="attention-show-ack" type="checkbox" className="hidden" checked={showAck} onChange={(e) => setShowAck(e.target.checked)} />Show acknowledged</label>
      </div>
      <div className="panel overflow-hidden">
        <QueryState query={q}>
          {items.length ? items.map((a) => <AlertRow key={a.id} alert={a} />) : <Empty icon={Siren} title="All clear" text="No alerts match these filters." />}
        </QueryState>
      </div>
      <p className="text-[11.5px] text-mute mt-3">Blocked-task alerts are LIVE from your task data and clear when the task is unblocked. Other alerts come from DEMO adapters until monitoring providers are connected.</p>
    </div>
  );
}

const TYPES = ["project", "task", "milestone", "doc", "deployment", "github"];

export function ActivityPage() {
  const [project, setProject] = useState("");
  const [type, setType] = useState("");
  const [limit, setLimit] = useState(50);
  const q = useActivity({ project_id: project || undefined, type: type || undefined, limit });
  return (
    <div data-testid="activity-page">
      <PageHeader label="Overview" title="Activity Feed" subtitle="Everything that happened across the portfolio." />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <ProjectSelect value={project} onChange={setProject} testid="activity-project-filter" />
        <button className="chip" data-active={!type} onClick={() => setType("")}>All types</button>
        {TYPES.map((t) => <button key={t} data-testid={`activity-type-${t}`} className="chip capitalize" data-active={type === t} onClick={() => setType(t)}>{t}</button>)}
      </div>
      <div className="panel overflow-hidden">
        <QueryState query={q}>
          {q.data?.items?.length ? q.data.items.map((e) => <EventRow key={e.id} event={e} />) : <Empty icon={ActivityIcon} title="No activity" text="Events appear as you work on projects." />}
        </QueryState>
      </div>
      {q.data && q.data.total > q.data.items.length && (
        <button data-testid="activity-load-more" className="btn btn-outline mt-3" onClick={() => setLimit(limit + 50)}>Load more ({q.data.total - q.data.items.length} remaining)</button>
      )}
    </div>
  );
}
