import { ExternalLink, Github } from "lucide-react";
import { Inspector } from "@/components/Inspector";
import { useMilestones, useTasks } from "@/lib/queries";
import { money, num, shortDate, timeAgo } from "@/lib/format";
import { HealthDot, PriorityIcon, ProjectLogo, Progress, SourceTag, StageBadge } from "@/components/common";

const Row = ({ k, v }) => (v === null || v === undefined || v === "" ? null : (
  <div className="flex items-center justify-between h-7 text-[12.5px]"><span className="text-mute">{k}</span><span className="text-right truncate max-w-[220px]">{v}</span></div>
));

const Section = ({ title, tag, children }) => (
  <div className="mb-5">
    <div className="flex items-center gap-2 mb-1.5"><span className="section-label">{title}</span>{tag && <SourceTag source={tag} />}</div>
    {children}
  </div>
);

export function ProjectInspector({ project: p, onClose, onOpenFull }) {
  const tasks = useTasks(p ? { project_id: p.id } : { project_id: "__none" });
  const milestones = useMilestones(p ? { project_id: p.id } : { project_id: "__none" });
  if (!p) return <Inspector open={false} onClose={onClose} />;
  const list = tasks.data || [];
  const done = list.filter((t) => t.status === "completed").length;
  const blocked = list.filter((t) => t.status === "blocked").length;
  const next = (milestones.data || []).find((m) => m.status !== "completed");
  const t = p.telemetry;
  return (
    <Inspector open onClose={onClose} onOpenFull={onOpenFull} title={<span className="flex items-center gap-2"><ProjectLogo project={p} size={18} />{p.name}</span>} subtitle={p.description} testid="portfolio-inspector-drawer">
      <div className="flex items-center gap-3 mb-5">
        <StageBadge stage={p.stage} /><PriorityIcon priority={p.priority} showLabel /><HealthDot telemetry={p.telemetry} />
        {p.source === "sample" && <SourceTag source="sample" />}
      </div>
      <Section title="Progress">
        <div className="flex items-center justify-between text-[12px] mb-1.5"><span className="text-mute">{done}/{list.length} tasks completed</span>{blocked > 0 && <span className="text-bad">{blocked} blocked</span>}</div>
        <Progress value={list.length ? (100 * done) / list.length : 0} />
        {next && <div className="mt-3 text-[12px]"><span className="text-mute">Next milestone · </span>{next.title} <span className="mono text-mute">· {shortDate(next.due_date)} · {next.progress}%</span></div>}
      </Section>
      {t && (
        <Section title="Telemetry" tag={t.source}>
          <Row k="Deployment" v={t.deployment_status} /><Row k="Active users" v={<span className="mono">{num(t.active_users)}</span>} />
          <Row k="Errors (24h)" v={<span className="mono">{num(t.errors_24h)}</span>} /><Row k="Last deployment" v={timeAgo(t.last_deployment_at)} />
        </Section>
      )}
      <Section title="Business" tag={p.source === "sample" ? "sample" : "manual"}>
        <Row k="Monthly revenue" v={<span className="mono">{money(p.business?.monthly_revenue)}</span>} />
        <Row k="Monthly expenses" v={<span className="mono">{money(p.business?.monthly_expenses)}</span>} />
        <Row k="Customers" v={<span className="mono">{num(p.business?.customers)}</span>} />
        <Row k="Revenue model" v={p.business?.revenue_model} />
      </Section>
      <Section title="Development">
        <Row k="Repository" v={p.dev?.repo && <span className="inline-flex items-center gap-1 mono text-[11.5px]"><Github size={11} />{p.dev.repo}</span>} />
        <Row k="Branch" v={p.dev?.branch && <span className="mono text-[11.5px]">{p.dev.branch}</span>} />
        <Row k="Framework" v={p.dev?.framework} /><Row k="Database" v={p.dev?.database} />
      </Section>
      <Section title="Production">
        <Row k="Hosting" v={p.prod?.hosting_provider} /><Row k="Deploys via" v={p.prod?.deployment_provider} />
        {[["Production", p.prod?.production_url], ["Preview", p.prod?.preview_url], ["Backend", p.prod?.backend_url]].filter(([, u]) => u).map(([k, u]) => (
          <Row key={k} k={k} v={<a href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-acc hover:underline">{u.replace(/^https?:\/\//, "")}<ExternalLink size={10} /></a>} />
        ))}
      </Section>
      <button data-testid="inspector-open-workspace-btn" className="btn btn-primary w-full justify-center" onClick={onOpenFull}>Open workspace</button>
    </Inspector>
  );
}
