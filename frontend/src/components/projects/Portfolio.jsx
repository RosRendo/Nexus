import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Table2, LayoutGrid, Columns3, SlidersHorizontal, ArrowUp, ArrowDown, Layers, X, Archive, Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { STAGES, PRIORITIES } from "@/lib/constants";
import { actions, useAction } from "@/lib/queries";
import { useUI } from "@/context/UIContext";
import { money, num, timeAgo } from "@/lib/format";
import { Dot, Empty, HealthDot, PriorityIcon, ProjectLogo, SourceTag, StageBadge } from "@/components/common";
import { ProjectInspector } from "./ProjectInspector";

const HEALTH_RANK = { down: 0, degraded: 1, healthy: 2 };
const DEPLOY_COLOR = { success: "#30D158", failed: "#FF453A", building: "#0A84FF" };
const STAGE_IDX = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));

const COLS = [
  { key: "stage", label: "Stage", sort: (p) => STAGE_IDX[p.stage], cell: (p) => <StageBadge stage={p.stage} /> },
  { key: "deployment", label: "Deployment", cls: "hidden lg:table-cell", sort: (p) => p.telemetry?.deployment_status || "~", cell: (p) => p.telemetry ? <span className="inline-flex items-center gap-1.5 text-[12px]"><Dot color={DEPLOY_COLOR[p.telemetry.deployment_status] || "#929299"} size={6} />{p.telemetry.deployment_status}</span> : <span className="text-mute">—</span> },
  { key: "health", label: "Health", sort: (p) => HEALTH_RANK[p.telemetry?.health] ?? 9, cell: (p) => <HealthDot telemetry={p.telemetry} /> },
  { key: "users", label: "Active users", right: true, cls: "hidden sm:table-cell", sort: (p) => p.telemetry?.active_users ?? -1, cell: (p) => <span className="mono text-[12px]">{num(p.telemetry?.active_users)}</span> },
  { key: "errors", label: "Errors 24h", right: true, cls: "hidden md:table-cell", sort: (p) => p.telemetry?.errors_24h ?? -1, cell: (p) => <span className={`mono text-[12px] ${p.telemetry?.errors_24h > 10 ? "text-bad" : ""}`}>{num(p.telemetry?.errors_24h)}</span> },
  { key: "last_deploy", label: "Last deployment", right: true, cls: "hidden xl:table-cell", sort: (p) => p.telemetry?.last_deployment_at || "", cell: (p) => <span className="mono text-[11.5px] text-mute">{timeAgo(p.telemetry?.last_deployment_at)}</span> },
  { key: "last_activity", label: "Last activity", right: true, cls: "hidden md:table-cell", sort: (p) => p.last_activity_at || "", cell: (p) => <span className="mono text-[11.5px] text-mute">{timeAgo(p.last_activity_at)}</span> },
];

function Toolbar({ s, set, count }) {
  const toggleStage = (k) => set.stages((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <div className="seg" data-testid="portfolio-view-selector">
        {[["table", "Table", Table2], ["grid", "Grid", LayoutGrid], ["board", "Board", Columns3]].map(([k, l, I]) => (
          <button key={k} data-testid={`portfolio-view-${k}`} data-active={s.view === k} onClick={() => set.view(k)}><I size={12} />{l}</button>
        ))}
      </div>
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mute" />
        <input data-testid="portfolio-search-input" className="fos-input h-7 pl-7 w-48" placeholder={`Search ${count} projects`} value={s.q} onChange={(e) => set.q(e.target.value)} />
      </div>
      {s.view === "table" && (
        <>
          <button data-testid="portfolio-group-toggle" className="chip" data-active={s.group} onClick={() => set.group(!s.group)}><Layers size={11} /> Group by stage</button>
          <DropdownMenu>
            <DropdownMenuTrigger data-testid="portfolio-columns-btn" className="chip"><SlidersHorizontal size={11} /> Columns</DropdownMenuTrigger>
            <DropdownMenuContent className="bg-s2 border-line w-48">
              <DropdownMenuLabel className="text-[11px] text-mute">Visible columns</DropdownMenuLabel>
              {COLS.map((c) => (
                <DropdownMenuCheckboxItem key={c.key} data-testid={`portfolio-col-toggle-${c.key}`} checked={!s.hidden.has(c.key)} onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => set.hidden((prev) => { const n = new Set(prev); n.has(c.key) ? n.delete(c.key) : n.add(c.key); return n; })}>
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      <div className="w-full scroll-x flex items-center gap-1.5" data-testid="portfolio-stage-filters">
        {STAGES.map((st) => (
          <button key={st.key} data-testid={`stage-filter-${st.key}`} className="chip shrink-0" data-active={s.stages.has(st.key)} onClick={() => toggleStage(st.key)}>
            <Dot color={st.color} size={5} />{st.label}
          </button>
        ))}
        {s.stages.size > 0 && <button data-testid="stage-filter-clear" className="chip shrink-0" onClick={() => set.stages(new Set())}><X size={11} /> Clear</button>}
      </div>
    </div>
  );
}

function BulkBar({ ids, clear }) {
  const bulk = useAction(actions.bulkProjects, { success: "Projects updated", onDone: clear });
  return (
    <div data-testid="portfolio-bulk-bar" className="flex flex-wrap items-center gap-2 mb-2 px-3 h-auto min-h-10 py-1.5 rounded-[8px] bg-acc/10 border border-acc/30 text-[12px]">
      <span className="mono">{ids.length} selected</span>
      <select data-testid="bulk-stage-select" className="fos-input h-7 w-36" value="" onChange={(e) => e.target.value && bulk.mutate({ ids, action: "stage", value: e.target.value })}>
        <option value="">Move to stage…</option>{STAGES.filter((s) => s.key !== "archived").map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <select data-testid="bulk-priority-select" className="fos-input h-7 w-32" value="" onChange={(e) => e.target.value && bulk.mutate({ ids, action: "priority", value: e.target.value })}>
        <option value="">Set priority…</option>{PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      <button data-testid="bulk-archive-btn" className="btn btn-outline h-7" onClick={() => bulk.mutate({ ids, action: "archive" })}><Archive size={12} /> Archive</button>
      <button data-testid="bulk-clear-btn" className="btn btn-ghost h-7 ml-auto" onClick={clear}><X size={12} /> Clear</button>
    </div>
  );
}

function ProjectTable({ rows, s, set, onOpen }) {
  const cols = COLS.filter((c) => !s.hidden.has(c.key));
  const sortBy = (key) => set.sort((p) => ({ key, dir: p.key === key && p.dir === "asc" ? "desc" : "asc" }));
  const allSel = rows.length > 0 && rows.every((r) => s.selected.has(r.id));
  const toggle = (id) => set.selected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const groups = s.group ? STAGES.map((st) => [st, rows.filter((r) => r.stage === st.key)]).filter(([, r]) => r.length) : [[null, rows]];
  const SortIcon = ({ k }) => (s.sort.key === k ? (s.sort.dir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />) : null);
  return (
    <div className="panel overflow-x-auto">
      <table className="tbl" data-testid="portfolio-table">
        <thead>
          <tr>
            <th className="w-8"><Checkbox data-testid="portfolio-select-all" checked={allSel} onCheckedChange={(c) => set.selected(c ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
            <th><button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => sortBy("name")}>Project <SortIcon k="name" /></button></th>
            {cols.map((c) => (
              <th key={c.key} className={`${c.cls || ""} ${c.right ? "text-right" : ""}`}>
                <button data-testid={`portfolio-sort-${c.key}`} className="inline-flex items-center gap-1 hover:text-ink" onClick={() => sortBy(c.key)}>{c.label} <SortIcon k={c.key} /></button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map(([st, items]) => [
            st && (
              <tr key={`g-${st.key}`}><td colSpan={cols.length + 2} className="!h-8 bg-white/[0.025]"><span className="inline-flex items-center gap-2 text-[11.5px]"><Dot color={st.color} size={6} />{st.label}<span className="mono text-mute">{items.length}</span></span></td></tr>
            ),
            ...items.map((p) => (
              <tr key={p.id} data-testid={`portfolio-row-${p.slug}`} className={`row-hover cursor-pointer ${s.selected.has(p.id) ? "bg-acc/[0.06]" : ""}`} onClick={() => onOpen(p)}>
                <td onClick={(e) => e.stopPropagation()}><Checkbox data-testid={`portfolio-select-${p.slug}`} checked={s.selected.has(p.id)} onCheckedChange={() => toggle(p.id)} /></td>
                <td>
                  <span className="flex items-center gap-2.5 min-w-[180px]">
                    <ProjectLogo project={p} size={20} />
                    <span className="text-[12.5px] font-medium truncate max-w-[200px]">{p.name}</span>
                    <PriorityIcon priority={p.priority} />
                    {p.open_alerts > 0 && <span className="mono text-[10.5px] text-bad">{p.open_alerts}</span>}
                  </span>
                </td>
                {cols.map((c) => <td key={c.key} className={`${c.cls || ""} ${c.right ? "text-right" : ""}`}>{c.cell(p)}</td>)}
              </tr>
            )),
          ])}
        </tbody>
      </table>
      {rows.some((r) => r.telemetry) && (
        <div className="flex items-center gap-2 px-3 h-8 border-t border-line text-[11px] text-mute"><SourceTag source="demo" /> Deployment, health, users and errors come from demo adapters until providers are connected.</div>
      )}
    </div>
  );
}

function ProjectGrid({ rows, onOpen }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="portfolio-grid">
      {rows.map((p) => (
        <button key={p.id} data-testid={`portfolio-card-${p.slug}`} onClick={() => onOpen(p)} className="panel text-left p-4 hover:border-white/15 transition-colors">
          <div className="flex items-center gap-2.5">
            <ProjectLogo project={p} size={26} />
            <div className="min-w-0 flex-1"><div className="text-[13px] font-medium truncate">{p.name}</div><div className="text-[11.5px] text-mute truncate">{p.category || "Uncategorized"}</div></div>
            <HealthDot telemetry={p.telemetry} withLabel={false} />
          </div>
          <p className="text-[12px] text-mute mt-3 line-clamp-2 min-h-[34px]">{p.description || "No description yet."}</p>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-line">
            <StageBadge stage={p.stage} />
            <span className="mono text-[12px]">{money(p.business?.monthly_revenue)}<span className="text-mute">/mo</span></span>
          </div>
        </button>
      ))}
    </div>
  );
}

function ProjectBoard({ rows, onOpen, stages }) {
  const move = useAction(actions.updateProject, { success: "Stage updated" });
  return (
    <div className="grid grid-flow-col auto-cols-[minmax(210px,1fr)] gap-3 overflow-x-auto pb-2" data-testid="portfolio-board">
      {stages.map((st) => {
        const items = rows.filter((r) => r.stage === st.key);
        return (
          <div key={st.key} data-testid={`portfolio-board-col-${st.key}`} className="rounded-[10px] p-2 bg-white/[0.02]" onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { const id = e.dataTransfer.getData("text/project"); const p = rows.find((r) => r.id === id); if (p && p.stage !== st.key) move.mutate({ id, stage: st.key }); }}>
            <div className="flex items-center gap-2 px-1 h-7 mb-1"><Dot color={st.color} size={6} /><span className="text-[12px] font-medium">{st.label}</span><span className="mono text-[11px] text-mute">{items.length}</span></div>
            <div className="space-y-1.5 min-h-[60px]">
              {items.map((p) => (
                <div key={p.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/project", p.id)} onClick={() => onOpen(p)} data-testid={`portfolio-board-card-${p.slug}`} className="bg-s2 border border-line rounded-[8px] p-2.5 cursor-pointer hover:border-white/15 transition-colors">
                  <div className="flex items-center gap-2"><ProjectLogo project={p} size={18} /><span className="text-[12.5px] truncate flex-1">{p.name}</span><HealthDot telemetry={p.telemetry} withLabel={false} /></div>
                  <div className="flex items-center justify-between mt-2 text-[11px] text-mute"><PriorityIcon priority={p.priority} /><span className="mono">{money(p.business?.monthly_revenue)}</span></div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Portfolio({ projects }) {
  const navigate = useNavigate();
  const { setNewProject } = useUI();
  const [view, setView] = useState(() => localStorage.getItem("fos.pview") || "table");
  const [q, setQ] = useState("");
  const [stages, setStages] = useState(new Set());
  const [sort, setSort] = useState({ key: "health", dir: "asc" });
  const [hidden, setHidden] = useState(new Set());
  const [group, setGroup] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [openId, setOpenId] = useState(null);
  const s = { view, q, stages, sort, hidden, group, selected };
  const set = { view: (v) => { setView(v); localStorage.setItem("fos.pview", v); }, q: setQ, stages: setStages, sort: setSort, hidden: setHidden, group: setGroup, selected: setSelected };

  const rows = useMemo(() => {
    const term = q.toLowerCase();
    const list = projects.filter((p) => (stages.size ? stages.has(p.stage) : p.stage !== "archived") &&
      (!term || [p.name, p.slug, p.category, ...(p.tags || [])].join(" ").toLowerCase().includes(term)));
    const getter = sort.key === "name" ? (p) => p.name.toLowerCase() : COLS.find((c) => c.key === sort.key)?.sort;
    return [...list].sort((a, b) => { const x = getter(a), y = getter(b); return (x > y ? 1 : x < y ? -1 : 0) * (sort.dir === "asc" ? 1 : -1); });
  }, [projects, q, stages, sort]);

  const open = projects.find((p) => p.id === openId);
  const boardStages = STAGES.filter((st) => (stages.size ? stages.has(st.key) : st.key !== "archived"));
  return (
    <div>
      <Toolbar s={s} set={set} count={projects.filter((p) => p.stage !== "archived").length} />
      {selected.size > 0 && <BulkBar ids={[...selected]} clear={() => setSelected(new Set())} />}
      {rows.length === 0 ? (
        <div className="panel">
          <Empty title={projects.length ? "No projects match these filters" : "Your portfolio is empty"} text={projects.length ? "Try clearing the search or stage filters." : "Create a project once and it becomes available everywhere in Founder OS."}
            action={projects.length ? <button className="btn btn-outline" onClick={() => { setQ(""); setStages(new Set()); }}>Clear filters</button> : <button data-testid="empty-new-project-btn" className="btn btn-primary" onClick={() => setNewProject(true)}><Plus size={13} /> New project</button>} />
        </div>
      ) : view === "table" ? <ProjectTable rows={rows} s={s} set={set} onOpen={(p) => setOpenId(p.id)} />
        : view === "grid" ? <ProjectGrid rows={rows} onOpen={(p) => setOpenId(p.id)} />
        : <ProjectBoard rows={rows} stages={boardStages} onOpen={(p) => setOpenId(p.id)} />}
      <ProjectInspector project={open} onClose={() => setOpenId(null)} onOpenFull={() => open && navigate(`/projects/${open.slug}`)} />
    </div>
  );
}
