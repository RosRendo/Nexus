import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useProjects, useAction, opsActions } from "@/lib/queries";
import { ConfirmDialog, Empty, Field, QueryState } from "@/components/common";

export function DataTable({ columns, rows, onRowClick, testid, empty }) {
  if (!rows.length) return <div className="panel">{empty || <Empty title="Nothing here yet" />}</div>;
  return (
    <div className="panel overflow-x-auto">
      <table className="tbl" data-testid={testid}>
        <thead><tr>{columns.map((c) => <th key={c.key} className={`${c.cls || ""} ${c.right ? "text-right" : ""}`}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-testid={`${testid}-row-${r.id}`} className={`row-hover ${onRowClick ? "cursor-pointer" : ""}`} onClick={() => onRowClick && onRowClick(r)}>
              {columns.map((c) => <td key={c.key} className={`${c.cls || ""} ${c.right ? "text-right" : ""} text-[12.5px]`}>{c.render ? c.render(r) : r[c.key] ?? "—"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProjectFilter({ value, onChange, testid = "project-filter" }) {
  const projects = useProjects();
  return (
    <select data-testid={testid} className="fos-input h-7 w-44" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All projects</option>
      {(projects.data?.items || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

export const Select = ({ value, onChange, options, all, testid, w = "w-36" }) => (
  <select data-testid={testid} className={`fos-input h-7 ${w}`} value={value} onChange={(e) => onChange(e.target.value)}>
    {all && <option value="">{all}</option>}
    {options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
  </select>
);

export const MetricBar = ({ value, threshold = 85 }) => {
  if (value == null) return <span className="text-mute">—</span>;
  const color = value >= threshold ? "#FF453A" : value >= threshold - 15 ? "#FF9F0A" : "#30D158";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-14 h-[4px] rounded-full bg-white/[0.08] overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: color }} /></span>
      <span className="mono text-[11.5px] w-8 text-right">{Math.round(value)}%</span>
    </span>
  );
};

function FieldInput({ f, value, onChange, projects }) {
  const common = { "data-testid": `record-field-${f.key}`, className: "fos-input", value: value ?? "", onChange: (e) => onChange(f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : f.type === "checkbox" ? e.target.checked : e.target.value) };
  if (f.type === "project") return <select {...common}><option value="">Select a project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>;
  if (f.type === "select") return <select {...common}>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  if (f.type === "textarea") return <textarea rows={f.rows || 3} {...common} />;
  if (f.type === "checkbox") return <input type="checkbox" data-testid={common["data-testid"]} checked={!!value} onChange={common.onChange} />;
  return <input type={f.type || "text"} placeholder={f.placeholder} {...common} />;
}

export function RecordSheet({ kind, title, fields, record, onClose, deleteConfirmField }) {
  const projects = useProjects();
  const [form, setForm] = useState({});
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setForm(record || {}); }, [record]);
  const done = { onDone: onClose };
  const create = useAction(opsActions.create(kind), { success: "Saved", ...done });
  const update = useAction(opsActions.update(kind), { success: "Saved", ...done });
  const del = useAction(opsActions.remove(kind), { success: "Deleted", onDone: () => { setConfirm(false); onClose(); } });
  const editing = !!record?.id;
  const visible = fields.filter((f) => !(editing && f.type === "project"));
  const valid = fields.filter((f) => f.required).every((f) => form[f.key] !== undefined && form[f.key] !== "");
  const submit = (e) => {
    e.preventDefault();
    const body = Object.fromEntries(visible.map((f) => [f.key, form[f.key] === "" ? null : form[f.key]]).filter(([, v]) => v !== undefined && v !== null));
    editing ? update.mutate({ id: record.id, ...body }) : create.mutate(body);
  };
  return (
    <Sheet open={!!record} onOpenChange={(v) => !v && onClose()}>
      <SheetContent data-testid={`${kind}-sheet`} className="bg-s1 border-line w-full sm:max-w-[460px] overflow-y-auto">
        <SheetHeader><SheetTitle className="text-[16px]">{editing ? `Edit ${title}` : `New ${title}`}</SheetTitle></SheetHeader>
        <form className="mt-5 space-y-3" onSubmit={submit}>
          {visible.map((f) => (
            <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`} hint={f.hint}>
              <FieldInput f={f} value={form[f.key]} projects={(projects.data?.items || []).filter((p) => p.stage !== "archived")} onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))} />
            </Field>
          ))}
          <div className="flex justify-between pt-4 border-t border-line">
            {editing ? <button type="button" data-testid={`${kind}-delete-btn`} className="btn btn-ghost text-bad" onClick={() => setConfirm(true)}><Trash2 size={13} /> Delete</button> : <span />}
            <button data-testid={`${kind}-submit-btn`} type="submit" disabled={!valid || create.isPending || update.isPending} className="btn btn-primary">{editing ? "Save" : "Create"}</button>
          </div>
        </form>
        <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`Delete this ${title}?`} description="The record is moved to trash and the action is logged."
          typeToConfirm={deleteConfirmField ? record?.[deleteConfirmField] : undefined} actionLabel="Delete" pending={del.isPending}
          onConfirm={(c) => del.mutate({ id: record.id, confirm: c })} />
      </SheetContent>
    </Sheet>
  );
}

export const Toolbar = ({ children }) => <div className="flex flex-wrap items-center gap-2 mb-3">{children}</div>;
export const Loaded = QueryState;
