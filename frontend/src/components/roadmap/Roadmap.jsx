import { useMemo, useState } from "react";
import { Plus, Trash2, Flag, ArrowRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { actions, useAction, useMilestones, useProjects } from "@/lib/queries";
import { shortDate, todayStr } from "@/lib/format";
import { ConfirmDialog, Dot, Empty, Field, Progress, QueryState } from "@/components/common";

const MS_COLOR = { planned: "#929299", active: "#0A84FF", completed: "#30D158" };
const blank = (project_id = "") => ({ project_id, title: "", description: "", start_date: "", due_date: "", status: "planned", release: "", depends_on: [] });

function MilestoneSheet({ open, onClose, initial, milestones, lockProject }) {
  const [form, setForm] = useState(initial);
  const projects = useProjects();
  const set = (k, v) => setForm({ ...form, [k]: v });
  const done = { onDone: onClose };
  const create = useAction(actions.createMilestone, { success: "Milestone created", ...done });
  const update = useAction(actions.updateMilestone, { success: "Milestone saved", ...done });
  const [confirm, setConfirm] = useState(false);
  const del = useAction(actions.deleteMilestone, { success: "Milestone deleted", onDone: () => { setConfirm(false); onClose(); } });
  const others = milestones.filter((m) => m.id !== form.id && m.project_id === form.project_id);
  const submit = (e) => {
    e.preventDefault();
    const body = { title: form.title.trim(), description: form.description, start_date: form.start_date || null, due_date: form.due_date || null, status: form.status, release: form.release, depends_on: form.depends_on };
    form.id ? update.mutate({ id: form.id, ...body }) : create.mutate({ project_id: form.project_id, ...body });
  };
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent data-testid="milestone-sheet" className="bg-s1 border-line w-full sm:max-w-[460px] overflow-y-auto">
        <SheetHeader><SheetTitle className="text-[16px]">{form.id ? "Edit milestone" : "New milestone"}</SheetTitle></SheetHeader>
        <form className="mt-5 space-y-3" onSubmit={submit}>
          <Field label="Title *"><input data-testid="milestone-field-title" autoFocus className="fos-input" value={form.title} onChange={(e) => set("title", e.target.value)} /></Field>
          {!lockProject && !form.id && (
            <Field label="Project *"><select data-testid="milestone-field-project" className="fos-input" value={form.project_id} onChange={(e) => set("project_id", e.target.value)}>
              <option value="">Select…</option>{(projects.data?.items || []).filter((p) => p.stage !== "archived").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></Field>
          )}
          <Field label="Description"><textarea rows={2} className="fos-input" value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start"><input data-testid="milestone-field-start" type="date" className="fos-input" value={form.start_date || ""} onChange={(e) => set("start_date", e.target.value)} /></Field>
            <Field label="Due"><input data-testid="milestone-field-due" type="date" className="fos-input" value={form.due_date || ""} onChange={(e) => set("due_date", e.target.value)} /></Field>
            <Field label="Status"><select data-testid="milestone-field-status" className="fos-input" value={form.status} onChange={(e) => set("status", e.target.value)}>{["planned", "active", "completed"].map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
            <Field label="Release tag"><input className="fos-input" value={form.release} onChange={(e) => set("release", e.target.value)} placeholder="v1.0" /></Field>
          </div>
          {others.length > 0 && (
            <Field label="Depends on">
              <div className="rounded-[7px] border border-line divide-y divide-line">
                {others.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 px-2.5 h-8 text-[12.5px] cursor-pointer row-hover">
                    <Checkbox checked={form.depends_on.includes(m.id)} onCheckedChange={(c) => set("depends_on", c ? [...form.depends_on, m.id] : form.depends_on.filter((x) => x !== m.id))} />{m.title}
                  </label>
                ))}
              </div>
            </Field>
          )}
          <div className="flex justify-between pt-4 border-t border-line">
            {form.id ? <button type="button" data-testid="milestone-delete-btn" className="btn btn-ghost text-bad" onClick={() => setConfirm(true)}><Trash2 size={13} /> Delete</button> : <span />}
            <button data-testid="milestone-submit-btn" type="submit" disabled={!form.title.trim() || !form.project_id || create.isPending || update.isPending} className="btn btn-primary">{form.id ? "Save" : "Create milestone"}</button>
          </div>
        </form>
        <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete milestone?" description="Tasks linked to it are kept but unlinked." actionLabel="Delete" pending={del.isPending} onConfirm={() => del.mutate(form.id)} />
      </SheetContent>
    </Sheet>
  );
}

function Timeline({ items, onOpen }) {
  const dated = items.filter((m) => m.due_date);
  const { start, end } = useMemo(() => {
    const ds = dated.flatMap((m) => [m.start_date || m.due_date, m.due_date]).map((d) => new Date(`${d}T00:00:00`).getTime());
    const now = Date.now();
    const lo = Math.min(now, ...ds), hi = Math.max(now + 30 * 86400000, ...ds);
    const s = new Date(lo); s.setDate(1);
    const e = new Date(hi); e.setMonth(e.getMonth() + 1, 1);
    return { start: s.getTime(), end: e.getTime() };
  }, [dated]);
  if (!dated.length) return null;
  const pct = (d) => ((new Date(`${d}T00:00:00`).getTime() - start) / (end - start)) * 100;
  const months = [];
  for (let d = new Date(start); d.getTime() < end; d.setMonth(d.getMonth() + 1)) months.push(new Date(d));
  const todayPct = pct(todayStr());
  return (
    <div className="panel overflow-x-auto mb-4" data-testid="roadmap-timeline">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[240px_1fr] border-b border-line">
          <div className="px-3 py-2 section-label">Milestone</div>
          <div className="relative h-8">{months.map((m) => <span key={m.getTime()} className="absolute top-2 text-[10.5px] text-mute mono border-l border-line pl-1.5 h-full" style={{ left: `${((m.getTime() - start) / (end - start)) * 100}%` }}>{m.toLocaleDateString(undefined, { month: "short", year: "2-digit" })}</span>)}</div>
        </div>
        {dated.map((m) => {
          const s = pct(m.start_date && m.start_date < m.due_date ? m.start_date : m.due_date);
          const w = Math.max(1.2, pct(m.due_date) - s);
          return (
            <div key={m.id} className="grid grid-cols-[240px_1fr] border-b border-line last:border-0 row-hover cursor-pointer" onClick={() => onOpen(m)} data-testid={`roadmap-row-${m.id}`}>
              <div className="px-3 h-10 flex flex-col justify-center min-w-0">
                <span className="text-[12.5px] truncate">{m.title}</span>
                <span className="text-[10.5px] text-mute truncate">{m.project_name}{m.release && ` · ${m.release}`}</span>
              </div>
              <div className="relative h-10">
                {todayPct >= 0 && todayPct <= 100 && <div className="absolute inset-y-0 w-px bg-acc/60" style={{ left: `${todayPct}%` }} />}
                <div className="absolute top-3 h-4 rounded-[4px] overflow-hidden" style={{ left: `${s}%`, width: `${w}%`, background: `${MS_COLOR[m.status]}2A`, border: `1px solid ${MS_COLOR[m.status]}80` }}>
                  <div className="h-full" style={{ width: `${m.progress}%`, background: `${MS_COLOR[m.status]}88` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Roadmap({ projectId, mode = "both" }) {
  const q = useMilestones(projectId ? { project_id: projectId } : {});
  const [editing, setEditing] = useState(null);
  const update = useAction(actions.updateMilestone);
  const items = q.data || [];
  const byId = Object.fromEntries(items.map((m) => [m.id, m]));
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[12px] text-mute">{items.filter((m) => m.status !== "completed").length} open · {items.filter((m) => m.status === "completed").length} completed</span>
        <button data-testid="new-milestone-btn" className="btn btn-primary ml-auto" onClick={() => setEditing(blank(projectId || ""))}><Plus size={13} /> New milestone</button>
      </div>
      <QueryState query={q}>
        {!items.length ? (
          <div className="panel"><Empty icon={Flag} title="No milestones yet" text="Milestones group tasks into releases and show progress over time." action={<button className="btn btn-primary" onClick={() => setEditing(blank(projectId || ""))}><Plus size={13} /> New milestone</button>} /></div>
        ) : (
          <>
            {mode !== "list" && <Timeline items={items} onOpen={setEditing} />}
            {mode !== "timeline" && (
              <div className="panel overflow-x-auto">
                <table className="tbl" data-testid="milestones-table">
                  <thead><tr><th>Milestone</th>{!projectId && <th className="hidden md:table-cell">Project</th>}<th>Status</th><th className="w-40">Progress</th><th className="hidden lg:table-cell">Depends on</th><th className="text-right">Due</th></tr></thead>
                  <tbody>
                    {items.map((m) => (
                      <tr key={m.id} className="row-hover cursor-pointer" onClick={() => setEditing(m)} data-testid={`milestone-row-${m.id}`}>
                        <td className="text-[12.5px]">{m.title}{m.release && <span className="mono text-[10.5px] text-mute ml-2">{m.release}</span>}</td>
                        {!projectId && <td className="hidden md:table-cell text-[12px] text-mute">{m.project_name}</td>}
                        <td onClick={(e) => e.stopPropagation()}>
                          <select data-testid={`milestone-status-${m.id}`} className="bg-transparent text-[12px] outline-none cursor-pointer" value={m.status} onChange={(e) => update.mutate({ id: m.id, status: e.target.value })}>
                            {["planned", "active", "completed"].map((s) => <option key={s} value={s} className="bg-s2">{s}</option>)}
                          </select>
                          <Dot color={MS_COLOR[m.status]} size={6} />
                        </td>
                        <td><div className="flex items-center gap-2"><div className="flex-1"><Progress value={m.progress} color={MS_COLOR[m.status]} /></div><span className="mono text-[11px] text-mute w-16 text-right">{m.task_done}/{m.task_total}</span></div></td>
                        <td className="hidden lg:table-cell text-[11.5px] text-mute">{(m.depends_on || []).map((d) => byId[d]?.title).filter(Boolean).map((t) => <span key={t} className="inline-flex items-center gap-1 mr-2"><ArrowRight size={10} />{t}</span>)}</td>
                        <td className={`mono text-[11.5px] text-right ${m.status !== "completed" && m.due_date && m.due_date < todayStr() ? "text-bad" : "text-mute"}`}>{shortDate(m.due_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </QueryState>
      {editing && <MilestoneSheet key={editing.id || "new"} open onClose={() => setEditing(null)} initial={{ ...blank(), ...editing, depends_on: editing.depends_on || [] }} milestones={items} lockProject={!!projectId} />}
    </div>
  );
}
