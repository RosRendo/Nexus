import { useMemo, useState } from "react";
import { Plus, Search, Columns3, List, CalendarDays, GanttChart, Link2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { TASK_STATUSES, PRIORITIES } from "@/lib/constants";
import { actions, useAction, useProjects, useTasks } from "@/lib/queries";
import { useUI } from "@/context/UIContext";
import { shortDate, todayStr } from "@/lib/format";
import { Dot, Empty, PriorityIcon, QueryState, SourceTag, StatusBadge } from "@/components/common";
import { TaskInspector } from "./TaskForm";
import { TaskCalendar, TaskTimeline } from "./TaskCalendar";

const VIEWS = [
  { key: "board", label: "Board", icon: Columns3 },
  { key: "list", label: "List", icon: List },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "timeline", label: "Timeline", icon: GanttChart },
];

export const DueLabel = ({ date, status }) => {
  if (!date) return <span className="text-mute">—</span>;
  const overdue = status !== "completed" && date < todayStr();
  const today = date === todayStr();
  return <span className={`mono text-[11.5px] ${overdue ? "text-bad" : today ? "text-warn" : "text-mute"}`}>{today ? "Today" : shortDate(date)}</span>;
};

function TaskCard({ task, onOpen, showProject }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/task", task.id)}
      onClick={() => onOpen(task)}
      data-testid={`task-card-${task.id}`}
      className="bg-s2 border border-line rounded-[8px] p-2.5 cursor-pointer hover:border-white/15 transition-colors"
    >
      <div className="text-[12.5px] leading-snug">{task.title}</div>
      <div className="flex items-center gap-2 mt-2 text-[11px] text-mute">
        <PriorityIcon priority={task.priority} />
        <DueLabel date={task.due_date} status={task.status} />
        {task.dependencies?.length > 0 && <span className="inline-flex items-center gap-0.5"><Link2 size={11} />{task.dependencies.length}</span>}
        {showProject && <span className="ml-auto truncate max-w-[110px]">{task.project_name}</span>}
      </div>
    </div>
  );
}

function InlineAdd({ projectId, status }) {
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState(false);
  const { setNewTask } = useUI();
  const create = useAction(actions.createTask, { onDone: () => setTitle("") });
  if (!projectId)
    return <button data-testid={`board-add-${status}`} className="btn btn-ghost w-full justify-start h-7" onClick={() => setNewTask({ status })}><Plus size={13} /> Add task</button>;
  if (!open) return <button data-testid={`board-add-${status}`} className="btn btn-ghost w-full justify-start h-7" onClick={() => setOpen(true)}><Plus size={13} /> Add task</button>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) create.mutate({ project_id: projectId, title: title.trim(), status }); }}>
      <input data-testid={`board-inline-input-${status}`} autoFocus className="fos-input" placeholder="Task title, Enter to add" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => !title && setOpen(false)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)} />
    </form>
  );
}

function TaskBoard({ tasks, onOpen, projectId }) {
  const move = useAction(actions.updateTask);
  const [over, setOver] = useState(null);
  return (
    <div className="grid grid-flow-col auto-cols-[minmax(240px,1fr)] gap-3 overflow-x-auto pb-2" data-testid="task-board">
      {TASK_STATUSES.map((s) => {
        const items = tasks.filter((t) => t.status === s.key);
        return (
          <div key={s.key} data-testid={`board-column-${s.key}`}
            onDragOver={(e) => { e.preventDefault(); setOver(s.key); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { setOver(null); const id = e.dataTransfer.getData("text/task"); const t = tasks.find((x) => x.id === id); if (t && t.status !== s.key) move.mutate({ id, status: s.key }); }}
            className={`rounded-[10px] p-2 transition-colors ${over === s.key ? "bg-acc/10" : "bg-white/[0.02]"}`}>
            <div className="flex items-center gap-2 px-1 h-7 mb-1">
              <Dot color={s.color} size={6} /><span className="text-[12px] font-medium">{s.label}</span>
              <span className="mono text-[11px] text-mute">{items.length}</span>
            </div>
            <div className="space-y-1.5 min-h-[40px]">
              {items.map((t) => <TaskCard key={t.id} task={t} onOpen={onOpen} showProject={!projectId} />)}
            </div>
            <div className="mt-1.5"><InlineAdd projectId={projectId} status={s.key} /></div>
          </div>
        );
      })}
    </div>
  );
}

export function TaskRow({ task, onOpen, showProject = true }) {
  const toggle = useAction(actions.updateTask);
  return (
    <div data-testid={`task-row-${task.id}`} onClick={() => onOpen(task)} className="flex items-center gap-3 h-9 px-3 row-hover cursor-pointer border-b border-line last:border-0">
      <span onClick={(e) => e.stopPropagation()}>
        <Checkbox data-testid={`task-complete-${task.id}`} checked={task.status === "completed"} onCheckedChange={(c) => toggle.mutate({ id: task.id, status: c ? "completed" : "in_progress" })} />
      </span>
      <PriorityIcon priority={task.priority} />
      <span className={`flex-1 truncate text-[12.5px] ${task.status === "completed" ? "line-through text-mute" : ""}`}>{task.title}</span>
      {task.blocks_count > 0 && <span className="hidden sm:inline text-[11px] text-warn">blocks {task.blocks_count}</span>}
      {showProject && <span className="hidden sm:inline text-[11.5px] text-mute truncate max-w-[140px]">{task.project_name}</span>}
      <span className="hidden md:inline w-24"><StatusBadge status={task.status} /></span>
      <span className="w-14 text-right"><DueLabel date={task.due_date} status={task.status} /></span>
    </div>
  );
}

function TaskList({ tasks, onOpen, projectId }) {
  if (!tasks.length) return null;
  return (
    <div className="panel overflow-hidden" data-testid="task-list">
      {TASK_STATUSES.map((s) => {
        const items = tasks.filter((t) => t.status === s.key);
        if (!items.length) return null;
        return (
          <div key={s.key}>
            <div className="flex items-center gap-2 h-8 px-3 bg-white/[0.025] border-b border-line text-[11.5px]"><Dot color={s.color} size={6} />{s.label}<span className="mono text-mute">{items.length}</span></div>
            {items.map((t) => <TaskRow key={t.id} task={t} onOpen={onOpen} showProject={!projectId} />)}
          </div>
        );
      })}
    </div>
  );
}

export function TaskViews({ projectId, projectSlug }) {
  const [view, setView] = useState(() => localStorage.getItem("fos.taskview") || "board");
  const [q, setQ] = useState("");
  const [prio, setPrio] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const { setNewTask } = useUI();
  const tasksQ = useTasks(projectId ? { project_id: projectId } : {});
  const projects = useProjects();
  const pmap = useMemo(() => Object.fromEntries((projects.data?.items || []).map((p) => [p.id, p])), [projects.data]);
  const tasks = useMemo(() => (tasksQ.data || [])
    .map((t) => ({ ...t, project_name: pmap[t.project_id]?.name }))
    .filter((t) => (!q || t.title.toLowerCase().includes(q.toLowerCase())) && (!prio || t.priority === prio)), [tasksQ.data, pmap, q, prio]);
  const selected = tasks.find((t) => t.id === selectedId);
  const pick = (v) => { setView(v); localStorage.setItem("fos.taskview", v); };
  const hasSample = tasks.some((t) => t.source === "sample");
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="seg" data-testid="task-engine-view-switch">
          {VIEWS.map((v) => <button key={v.key} data-testid={`task-view-${v.key}`} data-active={view === v.key} onClick={() => pick(v.key)}><v.icon size={12} />{v.label}</button>)}
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mute" />
          <input data-testid="task-search-input" className="fos-input h-7 pl-7 w-44" placeholder="Filter tasks" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select data-testid="task-priority-filter" className="fos-input h-7 w-32" value={prio} onChange={(e) => setPrio(e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        {hasSample && <SourceTag source="sample" />}
        <button data-testid="new-task-btn" className="btn btn-primary ml-auto" onClick={() => setNewTask(projectId ? { projectId } : {})}><Plus size={13} /> New task <span className="kbd border-white/30 text-white/80">C</span></button>
      </div>
      <QueryState query={tasksQ}>
        {tasks.length === 0 && view !== "board" ? (
          <div className="panel"><Empty title="No tasks yet" text="Create the first task to start tracking work." action={<button className="btn btn-primary" onClick={() => setNewTask(projectId ? { projectId } : {})}><Plus size={13} /> New task</button>} /></div>
        ) : view === "board" ? <TaskBoard tasks={tasks} onOpen={(t) => setSelectedId(t.id)} projectId={projectId} />
          : view === "list" ? <TaskList tasks={tasks} onOpen={(t) => setSelectedId(t.id)} projectId={projectId} />
          : view === "calendar" ? <TaskCalendar tasks={tasks} onOpen={(t) => setSelectedId(t.id)} />
          : <TaskTimeline tasks={tasks} onOpen={(t) => setSelectedId(t.id)} />}
      </QueryState>
      <TaskInspector task={selected} onClose={() => setSelectedId(null)} projectSlug={projectSlug || pmap[selected?.project_id]?.slug} />
    </div>
  );
}
