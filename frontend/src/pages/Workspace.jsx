import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { useDocs } from "@/lib/queries";
import { timeAgo } from "@/lib/format";
import { NAV_ITEMS } from "@/lib/constants";
import { Empty, PageHeader, QueryState, SourceTag } from "@/components/common";
import { Roadmap } from "@/components/roadmap/Roadmap";

export function RoadmapsPage({ mode }) {
  return (
    <div data-testid={`${mode}-page`}>
      <PageHeader label="Workspace" title={mode === "timeline" ? "Roadmaps" : "Milestones"} subtitle={mode === "timeline" ? "Release timeline across every project." : "Milestone progress, dependencies and due dates."} />
      <Roadmap mode={mode === "timeline" ? "both" : "list"} />
    </div>
  );
}

export function DocumentationPage() {
  const q = useDocs();
  const groups = (q.data || []).reduce((acc, d) => { (acc[d.project_name] = acc[d.project_name] || []).push(d); return acc; }, {});
  return (
    <div data-testid="documentation-page">
      <PageHeader label="Workspace" title="Documentation" subtitle="Portfolio-wide index. Each project's docs live in its workspace." />
      <QueryState query={q}>
        {!q.data?.length ? <div className="panel"><Empty icon={BookOpen} title="No documents yet" text="Open a project workspace and add docs in the Documentation tab." /></div> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Object.entries(groups).map(([name, docs]) => (
              <div key={name} className="panel overflow-hidden">
                <div className="h-9 px-3 flex items-center border-b border-line text-[12.5px] font-medium">{name}<span className="mono text-[11px] text-mute ml-2">{docs.length}</span></div>
                {docs.map((d) => (
                  <Link key={d.id} to={`/projects/${d.project_id}/docs?doc=${d.id}`} data-testid={`doc-index-${d.id}`} className="flex items-center gap-3 h-9 px-3 row-hover border-b border-line last:border-0">
                    <span className="text-[12.5px] flex-1 truncate">{d.title}</span>
                    <span className="text-[10.5px] text-mute uppercase tracking-wide">{d.category}</span>
                    {d.source === "sample" && <SourceTag source="sample" />}
                    <span className="mono text-[11px] text-mute">{timeAgo(d.updated_at)}</span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}

export function PhasePreview({ path }) {
  const item = NAV_ITEMS.find((n) => n.path === path);
  return (
    <div data-testid="phase-preview-page">
      <PageHeader label={`Phase ${item.phase} · not yet available`} title={item.label} subtitle="This module is planned. Here is what it will hold." />
      <div className="panel p-5 max-w-2xl">
        <div className="flex items-center gap-3 mb-4">
          <item.icon size={18} className="text-mute" strokeWidth={1.5} />
          <span className="mono text-[10px] border border-line rounded px-1.5 py-0.5 text-mute">PHASE {item.phase}</span>
        </div>
        <ul className="space-y-2.5">
          {item.preview.map((p) => <li key={p} className="flex gap-2.5 text-[13px] text-ink/85"><span className="w-1 h-1 rounded-full bg-mute mt-2 shrink-0" />{p}</li>)}
        </ul>
        <p className="text-[12px] text-mute mt-5 pt-4 border-t border-line">No controls are shown until real provider adapters exist. Data will be linked to projects in the shared registry.</p>
      </div>
    </div>
  );
}
