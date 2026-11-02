import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";
import { TASK_STATUSES, PRIORITIES } from "@/lib/constants";
import { useUI } from "@/context/UIContext";
import { actions, useAction, useMilestones, useProjects, useTasks } from "@/lib/queries";
import { ConfirmDialog, Field } from "@/components/common";
import { Inspector } from "@/components/Inspector";
import { useNavigate } from "react-router-dom";

const blank = (project_id = "", status = "backlog") => ({
  project_id, title: "", description: "", status, priority: "medium", due_date: "", start_date: "", labelsText: "", assignee: "", effort: "", dependencies: [], milestone_id: "",
});

const toForm = (t) => ({ ...blank(), ...t, due_date: t.due_date || "", start_date: t.start_date || "", labelsText: (t.labels || []).join(", "), effort: t.effort ?? "", milestone_id: t.milestone_id || "" });

const toPayload = (f) => ({
  project_id: f.project_id, title: f.title.trim(), description: f.description, status: f.status, priority: f.priority,
  due_date: f.due_date || null, start_date: f.start_date || null, labels: f.labelsText.split(",").map((x) => x.trim()).filter(Boolean),
  assignee: f.assignee, effort: f.effort === "" ? null : Number(f.effort), dependencies: f.dependencies, milestone_id: f.milestone_id || null,
});

export function TaskForm({ value, onChange, lockProject, taskId }) {
  const projects = useProjects();
  const siblings = useTasks({ project_id: value.project_id });
  const milestones = useMilestones({ project_id: value.project_id });
  const set = (k, v) => onChange({ ...value, [k]: v });
  const others = (siblings.data || []).filter((t) => t.id !== taskId && value.project_id);
  return (
    <div className="space-y-3">
      <Field label="Title *"><input data-testid="task-field-title" autoFocus className="fos-input" value={value.title} onChange={(e) => set("title", e.target.value)} /></Field>
      {!lockProject && (
        <Field label="Project *">
          <select data-testid="task-field-project" className="fos-input" value={value.project_id} onChange={(e) => onChange({ ...value, project_id: e.target.value, dependencies: [], milestone_id: "" })}>
            <option value="">Select a project…</option>
            {(projects.data?.items || []).filter((p) => p.stage !== "archived").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Description"><textarea data-testid="task-field-description" rows={3} className="fos-input" value={value.description} onChange={(e) => set("description", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status"><select data-testid="task-field-status" className="fos-input" value={value.status} onChange={(e) => set("status", e.target.value)}>{TASK_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
        <Field label="Priority"><select data-testid="task-field-priority" className="fos-input" value={value.priority} onChange={(e) => set("priority", e.target.value)}>{PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></Field>
        <Field label="Start date"><input data-testid="task-field-start" type="date" className="fos-input" value={value.start_date} onChange={(e) => set("start_date", e.target.value)} /></Field>
        <Field label="Due date"><input data-testid="task-field-due" type="date" className="fos-input" value={value.due_date} onChange={(e) => set("due_date", e.target.value)} /></Field>
        <Field label="Assignee"><input data-testid="task-field-assignee" className="fos-input" value={value.assignee} onChange={(e) => set("assignee", e.target.value)} placeholder="You" /></Field>
        <Field label="Effort (points)"><input data-testid="task-field-effort" type="number" min="0" className="fos-input" value={value.effort} onChange={(e) => set("effort", e.target.value)} /></Field>
      </div>
      <Field label="Labels" hint="Comma separated"><input data-testid="task-field-labels" className="fos-input" value={value.labelsText} onChange={(e) => set("labelsText", e.target.value)} /></Field>
      {value.project_id && (
        <Field label="Milestone">
          <select data-testid="task-field-milestone" className="fos-input" value={value.milestone_id} onChange={(e) => set("milestone_id", e.target.value)}>
            <option value="">None</option>
            {(milestones.data || []).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </Field>
      )}
      {others.length > 0 && (
        <Field label="Depends on">
          <div data-testid="task-field-dependencies" className="max-h-32 overflow-y-auto rounded-[7px] border border-line divide-y divide-line">
            {others.map((t) => (
              <label key={t.id} className="flex items-center gap-2 px-2.5 h-8 text-[12.5px] row-hover cursor-pointer">
                <Checkbox checked={value.dependencies.includes(t.id)} onCheckedChange={(c) => set("dependencies", c ? [...value.dependencies, t.id] : value.dependencies.filter((d) => d !== t.id))} />
                <span className="truncate">{t.title}</span>
              </label>
            ))}
          </div>
        </Field>
      )}
    </div>
  );
}

export function NewTaskDialog() {
  const { newTask, setNewTask } = useUI();
  const projects = useProjects();
  const [form, setForm] = useState(blank());
  useEffect(() => {
    if (!newTask) return;
    const p = (projects.data?.items || []).find((x) => x.slug === newTask.projectSlug || x.id === newTask.projectId);
    setForm(blank(p?.id || "", newTask.status || "backlog"));
  }, [newTask, projects.data]);
  const close = () => setNewTask(null);
  const create = useAction(actions.createTask, { success: "Task created", onDone: close });
  const valid = form.title.trim() && form.project_id;
  return (
    <Sheet open={!!newTask} onOpenChange={(v) => !v && close()}>
      <SheetContent data-testid="new-task-sheet" className="bg-s1 border-line w-full sm:max-w-[480px] overflow-y-auto">
        <SheetHeader><SheetTitle className="text-[16px]">New task</SheetTitle></SheetHeader>
        <form className="mt-5" onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate(toPayload(form)); }}>
          <TaskForm value={form} onChange={setForm} />
          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-line">
            <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
            <button data-testid="new-task-submit-btn" type="submit" disabled={!valid || create.isPending} className="btn btn-primary">{create.isPending ? "Creating…" : "Create task"}</button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function TaskInspector({ task, onClose, projectSlug }) {
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { setForm(task ? toForm(task) : null); }, [task]);
  const save = useAction(actions.updateTask, { success: "Task saved" });
  const del = useAction(actions.deleteTask, { success: "Task deleted", onDone: () => { setConfirm(false); onClose(); } });
  return (
    <Inspector open={!!task} onClose={onClose} title={task?.title} subtitle={task?.project_name} testid="task-inspector"
      onOpenFull={projectSlug ? () => navigate(`/projects/${projectSlug}/tasks`) : undefined}>
      {form && task && (
        <form onSubmit={(e) => { e.preventDefault(); const { project_id, ...rest } = toPayload(form); save.mutate({ id: task.id, ...rest }); }}>
          <TaskForm value={form} onChange={setForm} lockProject taskId={task.id} />
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-line">
            <button type="button" data-testid="task-delete-btn" className="btn btn-ghost text-bad" onClick={() => setConfirm(true)}><Trash2 size={13} /> Delete</button>
            <button type="submit" data-testid="task-save-btn" disabled={!form.title.trim() || save.isPending} className="btn btn-primary">{save.isPending ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      )}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete this task?" description="It moves to trash and is removed from other tasks' dependencies." actionLabel="Delete task" pending={del.isPending} onConfirm={() => del.mutate(task.id)} />
    </Inspector>
  );
}
