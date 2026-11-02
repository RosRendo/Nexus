import { useState } from "react";
import { ListChecks, AlertCircle, CalendarClock, Ban, ArrowRight } from "lucide-react";
import { useToday, useProjects } from "@/lib/queries";
import { PageHeader, QueryState, Empty, PriorityIcon } from "@/components/common";
import { TaskRow, TaskViews, DueLabel } from "@/components/tasks/TaskViews";
import { TaskInspector } from "@/components/tasks/TaskForm";

const GROUPS = [
  { key: "overdue", label: "Overdue", icon: AlertCircle, color: "text-bad" },
  { key: "due_today", label: "Due today", icon: CalendarClock, color: "text-warn" },
  { key: "blocked", label: "Blocked", icon: Ban, color: "text-bad" },
  { key: "up_next", label: "Up next", icon: ArrowRight, color: "text-mute" },
];

function Today() {
  const q = useToday();
  const projects = useProjects();
  const [sel, setSel] = useState(null);
  const slugOf = (pid) => (projects.data?.items || []).find((p) => p.id === pid)?.slug;
  const all = q.data ? GROUPS.flatMap((g) => q.data[g.key]) : [];
  const selected = all.find((t) => t.id === sel);
  return (
    <QueryState query={q}>
      {q.data && (
        <div data-testid="today-view">
          {q.data.next_action ? (
            <button data-testid="today-next-action" onClick={() => setSel(q.data.next_action.id)} className="w-full text-left panel p-4 mb-5 hover:border-white/15 transition-colors">
              <div className="section-label mb-2">Most important next action</div>
              <div className="flex items-center gap-3">
                <PriorityIcon priority={q.data.next_action.priority} />
                <span className="text-[15px] font-medium flex-1 truncate">{q.data.next_action.title}</span>
                <DueLabel date={q.data.next_action.due_date} status={q.data.next_action.status} />
              </div>
              <div className="text-[12px] text-mute mt-1">
                {q.data.next_action.project_name}
                {q.data.next_action.blocks_count > 0 && ` · unblocks ${q.data.next_action.blocks_count} task(s)`}
                {" · ranked by priority, due date and what it unblocks"}
              </div>
            </button>
          ) : null}
          {all.length === 0 && <div className="panel"><Empty icon={ListChecks} title="Nothing open" text="Every task across your projects is complete." /></div>}
          <div className="space-y-5">
            {GROUPS.map((g) => q.data[g.key].length > 0 && (
              <div key={g.key} data-testid={`today-group-${g.key}`}>
                <div className={`flex items-center gap-2 mb-2 text-[12px] font-medium ${g.color}`}><g.icon size={13} />{g.label}<span className="mono text-mute">{q.data[g.key].length}</span></div>
                <div className="panel overflow-hidden">{q.data[g.key].map((t) => <TaskRow key={t.id} task={t} onOpen={(x) => setSel(x.id)} />)}</div>
              </div>
            ))}
          </div>
          <TaskInspector task={selected} onClose={() => setSel(null)} projectSlug={selected && slugOf(selected.project_id)} />
        </div>
      )}
    </QueryState>
  );
}

export default function Tasks() {
  const [tab, setTab] = useState("today");
  return (
    <div data-testid="tasks-page">
      <PageHeader label="Workspace" title="Tasks & Issues" subtitle={tab === "today" ? "What should I do next? Aggregated across every project." : "Every task across the portfolio."} />
      <div className="seg mb-4">
        <button data-testid="tasks-tab-today" data-active={tab === "today"} onClick={() => setTab("today")}>Today</button>
        <button data-testid="tasks-tab-all" data-active={tab === "all"} onClick={() => setTab("all")}>All tasks</button>
      </div>
      {tab === "today" ? <Today /> : <TaskViews />}
    </div>
  );
}
