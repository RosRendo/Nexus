import { useState } from "react";
import { Plus, Info } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { useGet, useOps } from "@/lib/queries";
import { money, shortDate } from "@/lib/format";
import { Dot, Empty, PageHeader, QueryState, SourceTag } from "@/components/common";
import { DataTable, ProjectFilter, RecordSheet, Toolbar } from "@/components/DataTable";

const COLORS = ["#0A84FF", "#30D158", "#FF9F0A", "#BF5AF2", "#64D2FF", "#FF453A", "#A1A1A6"];
const TT = { contentStyle: { background: "#18181B", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#929299" }, formatter: (v) => money(v) };
const AX = { stroke: "#929299", fontSize: 11, tickLine: false, axisLine: false };
const thisMonth = () => new Date().toISOString().slice(0, 7);

function SourceNote({ sources }) {
  return (
    <div data-testid="business-source-note" className="flex flex-wrap items-center gap-2 text-[11.5px] text-mute mb-4 px-3 py-2 rounded-[8px] border border-line">
      <Info size={12} /> Figures shown: {sources.length ? sources.map((s) => <SourceTag key={s} source={s} />) : "none"}
      <span>· Verified payment-provider data: <span className="text-ink">none connected</span>. Manual entries are never presented as verified.</span>
    </div>
  );
}

const Chart = ({ title, children, testid }) => (
  <div className="panel p-4" data-testid={testid}><div className="section-label mb-3">{title}</div><div className="h-56"><ResponsiveContainer>{children}</ResponsiveContainer></div></div>
);

function Kpis({ s }) {
  const last = s.history[s.history.length - 1] || {};
  const items = [["MRR", last.mrr], ["One-time", last.one_time], ["Expenses", last.expenses], ["Profit estimate", last.profit]];
  return (
    <div className="scroll-x flex md:grid md:grid-cols-4 gap-px rounded-[10px] border border-line bg-line mb-5" data-testid="business-kpis">
      {items.map(([k, v]) => <div key={k} className="bg-s1 px-4 py-3 min-w-[150px]"><div className="text-[11.5px] text-mute">{k} · {s.month || "—"}</div><div className={`mono text-[22px] mt-1 ${k.startsWith("Profit") && v < 0 ? "text-bad" : ""}`}>{money(v || 0)}</div></div>)}
    </div>
  );
}

function RecordsTable({ kind, fields, cols, title }) {
  const q = useOps(kind);
  const [pf, setPf] = useState("");
  const [edit, setEdit] = useState(null);
  const rows = (q.data || []).filter((r) => !pf || r.project_id === pf);
  return (
    <div className="mt-6">
      <Toolbar>
        <span className="section-label">{title}</span>
        <ProjectFilter value={pf} onChange={setPf} testid={`${kind}-project-filter`} />
        <button data-testid={`new-${kind}-btn`} className="btn btn-primary ml-auto" onClick={() => setEdit({ month: thisMonth(), ...Object.fromEntries(fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default])) })}><Plus size={13} /> Add entry</button>
      </Toolbar>
      <QueryState query={q}><DataTable testid={`${kind}-table`} columns={[...cols, { key: "src", label: "", render: (r) => <SourceTag source={r.source} /> }]} rows={rows} onRowClick={setEdit} /></QueryState>
      <RecordSheet kind={kind} title="entry" fields={fields} record={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

const monthField = { key: "month", label: "Month (YYYY-MM)", required: true, placeholder: "2026-11" };
const projectField = { key: "project_id", label: "Project", type: "project", required: true };

export function Revenue() {
  const q = useGet("business", "/business/summary", { months: 6 });
  return (
    <QueryState query={q}>
      {q.data && (
        <>
          <SourceNote sources={q.data.sources} />
          <Kpis s={q.data} />
          <div className="grid lg:grid-cols-2 gap-4">
            <Chart title="Portfolio revenue history" testid="revenue-history-chart">
              <AreaChart data={q.data.history}><CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} /><XAxis dataKey="month" {...AX} /><YAxis {...AX} width={50} /><Tooltip {...TT} /><Legend wrapperStyle={{ fontSize: 11 }} />
                {q.data.projects.map((p, i) => <Area key={p} dataKey={p} stackId="1" stroke={COLORS[i % 7]} fill={`${COLORS[i % 7]}40`} />)}</AreaChart>
            </Chart>
            <Chart title={`Project profitability · ${q.data.month || ""}`} testid="profitability-chart">
              <BarChart data={q.data.by_project} layout="vertical"><CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} /><XAxis type="number" {...AX} /><YAxis type="category" dataKey="name" {...AX} width={110} /><Tooltip {...TT} cursor={{ fill: "rgba(255,255,255,0.04)" }} /><Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue" fill="#30D158" radius={2} /><Bar dataKey="expenses" fill="#FF453A" radius={2} /><Bar dataKey="profit" fill="#0A84FF" radius={2} /></BarChart>
            </Chart>
          </div>
          <RecordsTable kind="revenue" title="Revenue entries" fields={[projectField, monthField, { key: "amount", label: "Amount (USD)", type: "number", required: true }, { key: "type", label: "Type", type: "select", options: ["mrr", "one_time"], default: "mrr" }, { key: "note", label: "Note" }]}
            cols={[{ key: "month", label: "Month", render: (r) => <span className="mono">{r.month}</span> }, { key: "project_name", label: "Project" }, { key: "type", label: "Type" }, { key: "amount", label: "Amount", right: true, render: (r) => <span className="mono">{money(r.amount)}</span> }, { key: "note", label: "Note", cls: "hidden md:table-cell" }]} />
        </>
      )}
    </QueryState>
  );
}

export function Expenses() {
  const q = useGet("business", "/business/summary", { months: 6 });
  return (
    <QueryState query={q}>
      {q.data && (
        <>
          <SourceNote sources={q.data.sources} />
          <div className="grid lg:grid-cols-2 gap-4">
            <Chart title="Monthly expenses" testid="expenses-history-chart"><BarChart data={q.data.history}><CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} /><XAxis dataKey="month" {...AX} /><YAxis {...AX} width={50} /><Tooltip {...TT} cursor={{ fill: "rgba(255,255,255,0.04)" }} /><Bar dataKey="expenses" fill="#FF9F0A" radius={[2, 2, 0, 0]} /></BarChart></Chart>
            <Chart title={`Breakdown by category · ${q.data.month || ""}`} testid="expenses-category-chart"><BarChart data={q.data.categories}><CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} /><XAxis dataKey="category" {...AX} /><YAxis {...AX} width={50} /><Tooltip {...TT} cursor={{ fill: "rgba(255,255,255,0.04)" }} /><Bar dataKey="amount" fill="#BF5AF2" radius={[2, 2, 0, 0]} /></BarChart></Chart>
          </div>
          <RecordsTable kind="expenses" title="Expense entries" fields={[projectField, monthField, { key: "amount", label: "Amount (USD)", type: "number", required: true }, { key: "category", label: "Category", type: "select", options: ["hosting", "api", "tools", "marketing", "other"], default: "hosting" }, { key: "vendor", label: "Vendor" }]}
            cols={[{ key: "month", label: "Month", render: (r) => <span className="mono">{r.month}</span> }, { key: "project_name", label: "Project" }, { key: "category", label: "Category" }, { key: "vendor", label: "Vendor", cls: "hidden md:table-cell" }, { key: "amount", label: "Amount", right: true, render: (r) => <span className="mono">{money(r.amount)}</span> }]} />
        </>
      )}
    </QueryState>
  );
}

const CUSTOMER_FIELDS = [projectField, { key: "name", label: "Name", required: true }, { key: "plan", label: "Plan" }, { key: "mrr", label: "MRR (USD)", type: "number" }, { key: "status", label: "Status", type: "select", options: ["active", "trial", "churned"], default: "active" }, { key: "started_at", label: "Started", type: "date" }];
const ST_COLOR = { active: "#30D158", trial: "#0A84FF", churned: "#636366" };

export function Customers({ subscriptions }) {
  const q = useOps("customers");
  const [edit, setEdit] = useState(null);
  const rows = (q.data || []).filter((c) => !subscriptions || c.status !== "churned" || true);
  const plans = Object.values(rows.reduce((acc, c) => { const k = c.plan || "No plan"; acc[k] = acc[k] || { plan: k, active: 0, mrr: 0, churned: 0 }; c.status === "churned" ? acc[k].churned++ : (acc[k].active++, (acc[k].mrr += c.mrr)); return acc; }, {}));
  const cols = [
    { key: "name", label: "Customer", render: (c) => <span className="font-medium">{c.name}</span> }, { key: "project_name", label: "Product" }, { key: "plan", label: "Plan" },
    { key: "status", label: "Status", render: (c) => <span className="inline-flex items-center gap-1.5"><Dot color={ST_COLOR[c.status]} size={6} />{c.status}</span> },
    { key: "mrr", label: "MRR", right: true, render: (c) => <span className="mono">{money(c.mrr)}</span> },
    { key: "started_at", label: "Since", right: true, cls: "hidden sm:table-cell", render: (c) => <span className="mono text-[11.5px] text-mute">{shortDate(c.started_at)}</span> },
    { key: "src", label: "", render: (c) => <SourceTag source={c.source} /> },
  ];
  return (
    <div>
      <SourceNote sources={[...new Set(rows.map((r) => r.source))]} />
      {subscriptions && (
        <div className="panel overflow-x-auto mb-5"><table className="tbl" data-testid="plans-table"><thead><tr><th>Plan</th><th className="text-right">Active subs</th><th className="text-right">MRR</th><th className="text-right">Churned</th></tr></thead>
          <tbody>{plans.map((p) => <tr key={p.plan}><td>{p.plan}</td><td className="text-right mono">{p.active}</td><td className="text-right mono">{money(p.mrr)}</td><td className="text-right mono text-mute">{p.churned}</td></tr>)}</tbody></table></div>
      )}
      <Toolbar><button data-testid="new-customer-btn" className="btn btn-primary ml-auto" onClick={() => setEdit({ status: "active", mrr: 0 })}><Plus size={13} /> Add customer</button></Toolbar>
      <QueryState query={q}><DataTable testid="customers-table" columns={cols} rows={rows} onRowClick={setEdit} empty={<Empty title="No customers" text="Add customers manually. A payment provider can verify them later." />} /></QueryState>
      <RecordSheet kind="customers" title="customer" fields={CUSTOMER_FIELDS} record={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

const PAGES = {
  revenue: ["Revenue", "MRR, one-time revenue and profitability by project.", Revenue],
  expenses: ["Expenses", "Hosting, API and tool costs per month.", Expenses],
  subscriptions: ["Subscriptions", "Active subscriptions by plan.", () => <Customers subscriptions />],
  customers: ["Customers", "Customers across every product.", Customers],
};

export default function BusinessPage({ page }) {
  const [title, subtitle, View] = PAGES[page];
  return <div data-testid={`${page}-page`}><PageHeader label="Business" title={title} subtitle={subtitle} /><View /></div>;
}
