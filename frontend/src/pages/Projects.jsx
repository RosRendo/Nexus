import { useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useProjects, actions, useAction } from "@/lib/queries";
import { useUI } from "@/context/UIContext";
import { timeAgo } from "@/lib/format";
import { Empty, PageHeader, ProjectLogo, QueryState, StageBadge } from "@/components/common";
import { Portfolio } from "@/components/projects/Portfolio";

function Trash() {
  const q = useProjects({ deleted: true });
  const restore = useAction(actions.restoreProject, { success: "Project restored" });
  return (
    <div className="panel overflow-hidden" data-testid="projects-trash">
      <QueryState query={q}>
        {q.data?.items?.length ? q.data.items.map((p) => (
          <div key={p.id} className="flex items-center gap-3 h-11 px-3 border-b border-line last:border-0">
            <ProjectLogo project={p} size={20} /><span className="text-[12.5px] flex-1 truncate">{p.name}</span>
            <StageBadge stage={p.stage} /><span className="mono text-[11px] text-mute hidden sm:inline">deleted {timeAgo(p.deleted_at)}</span>
            <button data-testid={`restore-project-${p.slug}`} className="btn btn-outline h-7" onClick={() => restore.mutate(p.id)}><RotateCcw size={12} /> Restore</button>
          </div>
        )) : <Empty icon={Trash2} title="Trash is empty" text="Deleted projects can be restored from here." />}
      </QueryState>
    </div>
  );
}

export default function Projects() {
  const [tab, setTab] = useState("all");
  const q = useProjects();
  const { setNewProject } = useUI();
  return (
    <div data-testid="projects-page">
      <PageHeader label="Workspace" title="All Projects" subtitle="The single registry every module references."
        actions={<button data-testid="new-project-btn" className="btn btn-primary" onClick={() => setNewProject(true)}><Plus size={13} /> New project</button>} />
      <div className="seg mb-4">
        <button data-testid="projects-tab-all" data-active={tab === "all"} onClick={() => setTab("all")}>Registry</button>
        <button data-testid="projects-tab-trash" data-active={tab === "trash"} onClick={() => setTab("trash")}>Trash</button>
      </div>
      {tab === "all" ? <QueryState query={q}><Portfolio projects={q.data?.items || []} /></QueryState> : <Trash />}
    </div>
  );
}
