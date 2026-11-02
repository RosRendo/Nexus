import { useState } from "react";
import { AlertTriangle, RotateCw, Inbox } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STAGE, PRIORITY, HEALTH, SEVERITY, TASK_STATUS } from "@/lib/constants";
import { errMsg } from "@/lib/api";

const TAGS = {
  live: { label: "LIVE", c: "#30D158" },
  demo: { label: "DEMO", c: "#FF9F0A" },
  sample: { label: "SAMPLE", c: "#929299" },
  manual: { label: "MANUAL", c: "#64D2FF" },
};

export const SourceTag = ({ source, className = "" }) => {
  const t = TAGS[source];
  if (!t) return null;
  return (
    <span
      data-testid={`tag-status-${source}`}
      className={`mono inline-flex items-center h-[16px] px-1.5 rounded-[4px] text-[9.5px] font-semibold tracking-wider ${className}`}
      style={{ color: t.c, background: `${t.c}1F`, border: `1px solid ${t.c}40` }}
    >
      {t.label}
    </span>
  );
};

export const Dot = ({ color, pulse, size = 7 }) => (
  <span className={`inline-block rounded-full shrink-0 ${pulse ? "pulse-dot" : ""}`} style={{ width: size, height: size, background: color }} />
);

export const StageBadge = ({ stage }) => {
  const s = STAGE[stage] || STAGE.idea;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink/90">
      <Dot color={s.color} size={6} />
      {s.label}
    </span>
  );
};

export const StatusBadge = ({ status }) => {
  const s = TASK_STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]">
      <Dot color={s?.color} size={6} />
      {s?.label}
    </span>
  );
};

export const HealthDot = ({ telemetry, withLabel = true }) => {
  const h = telemetry ? HEALTH[telemetry.health] : null;
  if (!h) return <span className="text-mute text-[12px]">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]">
      <Dot color={h.color} pulse={telemetry.health === "down"} />
      {withLabel && h.label}
    </span>
  );
};

export const PriorityIcon = ({ priority, showLabel = false }) => {
  const p = PRIORITY[priority] || PRIORITY.medium;
  return (
    <span className="inline-flex items-center gap-1.5" title={p.label}>
      <span className="inline-flex items-end gap-[2px] h-3">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className="w-[3px] rounded-[1px]" style={{ height: 3 + i * 2, background: i <= p.bars ? p.color : "rgba(255,255,255,0.12)" }} />
        ))}
      </span>
      {showLabel && <span className="text-[12px]">{p.label}</span>}
    </span>
  );
};

export const SeverityDot = ({ severity }) => <Dot color={SEVERITY[severity]?.color} pulse={severity === "critical"} />;

export const Kbd = ({ children }) => <kbd className="kbd">{children}</kbd>;

export const ProjectLogo = ({ project, size = 22 }) => {
  if (project?.logo_url) return <img src={project.logo_url} alt="" className="rounded-[6px] object-cover shrink-0" style={{ width: size, height: size }} />;
  const initials = (project?.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const color = STAGE[project?.stage]?.color || "#636366";
  return (
    <span className="inline-flex items-center justify-center rounded-[6px] font-semibold shrink-0 mono" style={{ width: size, height: size, fontSize: size * 0.4, background: `${color}22`, color, border: `1px solid ${color}40` }}>
      {initials}
    </span>
  );
};

export const PageHeader = ({ label, title, subtitle, actions }) => (
  <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
    <div className="min-w-0">
      {label && <div className="section-label mb-1.5">{label}</div>}
      <h1 data-testid="page-title" className="text-[22px] sm:text-[26px] font-semibold tracking-tight leading-tight">{title}</h1>
      {subtitle && <p className="text-mute text-[13px] mt-1">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
);

export const Empty = ({ icon: Icon = Inbox, title, text, action, testid = "empty-state" }) => (
  <div data-testid={testid} className="flex flex-col items-center justify-center text-center py-12 px-6">
    <Icon size={20} className="text-mute mb-3" strokeWidth={1.5} />
    <div className="text-[13.5px] font-medium">{title}</div>
    {text && <div className="text-mute text-[12.5px] mt-1 max-w-sm">{text}</div>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ErrorState = ({ error, onRetry }) => (
  <div data-testid="error-state" className="flex flex-col items-center text-center py-10 px-6">
    <AlertTriangle size={20} className="text-bad mb-3" strokeWidth={1.5} />
    <div className="text-[13.5px] font-medium">Couldn't load this</div>
    <div className="text-mute text-[12.5px] mt-1">{errMsg(error)}</div>
    {onRetry && (
      <button data-testid="error-retry-btn" className="btn btn-outline mt-4" onClick={onRetry}>
        <RotateCw size={13} /> Retry
      </button>
    )}
  </div>
);

export const LoadingRows = ({ rows = 6 }) => (
  <div data-testid="loading-state" className="p-3 space-y-2.5">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="skeleton h-6" style={{ width: `${92 - (i % 3) * 14}%` }} />
    ))}
  </div>
);

export const QueryState = ({ query, rows, children }) => {
  if (query.isLoading) return <LoadingRows rows={rows} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  return children;
};

export const Sparkline = ({ data, color = "#0A84FF", w = 64, h = 20 }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 2 - ((v - min) / (max - min || 1)) * (h - 4)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

export const Field = ({ label, children, hint }) => (
  <label className="block">
    <span className="block text-[11.5px] text-mute mb-1.5">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-mute/80 mt-1">{hint}</span>}
  </label>
);

export const Progress = ({ value, color = "#0A84FF" }) => (
  <div className="h-[4px] rounded-full bg-white/[0.07] overflow-hidden">
    <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, value || 0)}%`, background: color }} />
  </div>
);

export function ConfirmDialog({ open, onOpenChange, title, description, typeToConfirm, actionLabel = "Confirm", danger = true, onConfirm, pending }) {
  const [text, setText] = useState("");
  const ok = !typeToConfirm || text.trim() === typeToConfirm;
  return (
    <Dialog open={open} onOpenChange={(v) => { setText(""); onOpenChange(v); }}>
      <DialogContent data-testid="confirm-dialog" className="bg-s1 border-line sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px]">{title}</DialogTitle>
          <DialogDescription className="text-mute text-[12.5px]">{description}</DialogDescription>
        </DialogHeader>
        {typeToConfirm && (
          <Field label={<>Type <span className="mono text-ink">{typeToConfirm}</span> to confirm</>}>
            <input data-testid="confirm-dialog-input" autoFocus className="fos-input" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        )}
        <DialogFooter className="gap-2">
          <button data-testid="confirm-dialog-cancel" className="btn btn-ghost" onClick={() => onOpenChange(false)}>Cancel</button>
          <button data-testid="confirm-dialog-submit" disabled={!ok || pending} className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={() => onConfirm(text.trim())}>
            {pending ? "Working…" : actionLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
