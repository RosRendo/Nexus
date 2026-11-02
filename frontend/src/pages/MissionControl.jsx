import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Plus, Siren, ListChecks, Github, X } from "lucide-react";
import { useActivity, useAttention, useDashboard, useProjects, useWelcome, actions, useAction } from "@/lib/queries";
import { useUI } from "@/context/UIContext";
import { money } from "@/lib/format";
import { Kbd, PageHeader, PriorityIcon, QueryState, SeverityDot, SourceTag, Sparkline, Empty } from "@/components/common";
import { Portfolio } from "@/components/projects/Portfolio";
import { AlertRow, EventRow } from "@/components/feed";
import { DueLabel } from "@/components/tasks/TaskViews";

function WelcomeCard() {
  const w = useWelcome();
  const act = useAction(actions.welcome);
  if (!w.data?.show) return null;
  return (
    <div data-testid="welcome-card" className="panel p-4 mb-5 flex flex-col md:flex-row md:items-center gap-4">
      <div className="flex-1">
        <div className="text-[14px] font-medium">Welcome to Founder OS</div>
        <div className="text-[12.5px] text-mute mt-0.5">
          {w.data.sample_projects > 0 ? `We loaded a ${w.data.sample_projects}-project sample portfolio tagged SAMPLE so you can explore. Keep it or start clean.` : "Start by creating your first project."} GitHub can be connected now or later.
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/integrations" data-testid="welcome-connect-github-btn" className="btn btn-outline"><Github size={13} /> Connect GitHub</Link>
        {w.data.sample_projects > 0 && <button data-testid="welcome-clear-sample-btn" className="btn btn-outline" disabled={act.isPending} onClick={() => act.mutate("clear")}>Clear sample data</button>}
        <button data-testid="welcome-keep-btn" className="btn btn-primary" disabled={act.isPending} onClick={() => act.mutate("keep")}>{w.data.sample_projects > 0 ? "Keep sample" : <><X size={13} /> Dismiss</>}</button>
      </div>
    </div>
  );
}

function NextAction({ data }) {
  const navigate = useNavigate();
  const projects = useProjects();
  const na = data?.next_action;
  if (!na) return null;
  const isAlert = na.kind === "alert";
  const item = na.item;
  const slug = isAlert ? item.project_slug : (projects.data?.items || []).find((p) => p.id === item.project_id)?.slug;
  const go = () => navigate(isAlert ? (item.task_id ? `/projects/${slug}/tasks` : `/attention`) : `/projects/${slug}/tasks`);
  return (
    <div data-testid="next-action-bar" className="flex items-center gap-3 px-4 h-12 mb-5 rounded-[10px] border border-line bg-s1">
      <span className="section-label shrink-0 hidden sm:inline">Next action</span>
      {isAlert ? <SeverityDot severity={item.severity} /> : <PriorityIcon priority={item.priority} />}
      <span className="text-[13px] font-medium truncate">{item.title}</span>
      <span className="text-[12px] text-mute truncate hidden md:inline">· {item.project_name}</span>
      {!isAlert && <DueLabel date={item.due_date} status={item.status} />}
      {isAlert && <SourceTag source={item.source} />}
      <button data-testid="next-action-open-btn" onClick={go} className="btn btn-primary ml-auto h-7 shrink-0">Open <ArrowRight size={12} /></button>
    </div>
  );
}

const KPI_DEFS = [
  { key: "total", label: "Total projects", color: "#F5F5F7" },
  { key: "production", label: "In production", color: "#30D158" },
  { key: "development", label: "In development", color: "#0A84FF" },
  { key: "attention", label: "Need attention", color: "#FF453A", href: "/attention" },
  { key: "mrr", label: "MRR", color: "#30D158", money: true },
];

function KpiStrip({ data }) {
  return (
    <div data-testid="kpi-metrics-strip" className="scroll-x flex md:grid md:grid-cols-5 gap-px rounded-[10px] border border-line bg-line mb-6">
      {KPI_DEFS.map((k) => {
        const v = data.kpis[k.key];
        const body = (
          <div className="bg-s1 px-4 py-3.5 min-w-[160px] h-full hover:bg-s2 transition-colors">
            <div className="text-[11.5px] text-mute flex items-center gap-1.5">{k.label}{k.money && <SourceTag source="manual" />}</div>
            <div className="flex items-end justify-between mt-1.5">
              <span data-testid={`kpi-${k.key}-value`} className="mono text-[24px] font-medium tracking-tight" style={{ color: k.key === "attention" && v.value > 0 ? k.color : undefined }}>{k.money ? money(v.value) : v.value}</span>
              <Sparkline data={v.trend} color={k.color} />
            </div>
          </div>
        );
        return k.href ? <Link key={k.key} to={k.href} className="flex-1">{body}</Link> : <div key={k.key} className="flex-1">{body}</div>;
      })}
    </div>
  );
}

function AttentionRail() {
  const q = useAttention();
  return (
    <div className="panel overflow-hidden" data-testid="attention-rail">
      <div className="flex items-center h-10 px-3 border-b border-line">
        <Siren size={13} className="text-mute mr-2" /><span className="text-[12.5px] font-medium">Attention</span>
        <span className="mono text-[11px] text-mute ml-2">{q.data?.length ?? ""}</span>
        <Link to="/attention" data-testid="attention-view-all" className="ml-auto text-[11.5px] text-mute hover:text-ink">View all</Link>
      </div>
      <QueryState query={q} rows={5}>
        {q.data?.length ? q.data.slice(0, 5).map((a) => <AlertRow key={a.id} alert={a} compact />) : <Empty title="All clear" text="Nothing needs your attention." />}
      </QueryState>
    </div>
  );
}

function ActivityStrip() {
  const q = useActivity({ limit: 10 });
  return (
    <div className="panel overflow-hidden mt-6" data-testid="activity-strip">
      <div className="flex items-center h-10 px-3 border-b border-line">
        <span className="text-[12.5px] font-medium">Recent activity</span>
        <Link to="/activity" className="ml-auto text-[11.5px] text-mute hover:text-ink">Activity feed</Link>
      </div>
      <QueryState query={q} rows={5}>
        {q.data?.items?.length ? q.data.items.map((e) => <EventRow key={e.id} event={e} />) : <Empty title="No activity yet" />}
      </QueryState>
    </div>
  );
}

export default function MissionControl() {
  const dash = useDashboard();
  const projects = useProjects();
  const { setNewProject } = useUI();
  return (
    <div data-testid="mission-control-cockpit">
      <PageHeader label="Overview" title="Mission Control" subtitle="How is everything?"
        actions={<>
          <Link to="/tasks" className="btn btn-ghost hidden sm:inline-flex"><ListChecks size={13} /> Today <Kbd>G T</Kbd></Link>
          <button data-testid="new-project-btn" className="btn btn-primary" onClick={() => setNewProject(true)}><Plus size={13} /> New project</button>
        </>} />
      <WelcomeCard />
      <QueryState query={dash} rows={3}>
        {dash.data && <><NextAction data={dash.data} /><KpiStrip data={dash.data} /></>}
      </QueryState>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5">
        <div className="min-w-0 order-2 xl:order-1">
          <div className="section-label mb-2">Portfolio</div>
          <QueryState query={projects}><Portfolio projects={projects.data?.items || []} /></QueryState>
        </div>
        <div className="order-1 xl:order-2"><div className="section-label mb-2">Needs attention</div><AttentionRail /></div>
      </div>
      <ActivityStrip />
    </div>
  );
}
