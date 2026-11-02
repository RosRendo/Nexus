import { Link } from "react-router-dom";
import { Check, ExternalLink } from "lucide-react";
import { SEVERITY } from "@/lib/constants";
import { actions, useAction } from "@/lib/queries";
import { timeAgo } from "@/lib/format";
import { Dot, SeverityDot, SourceTag } from "@/components/common";

const EVENT_COLORS = { deployment: "#0A84FF", task: "#BF5AF2", milestone: "#30D158", project: "#F5F5F7", doc: "#64D2FF", github: "#FF9F0A" };

export function AlertRow({ alert, compact }) {
  const ack = useAction(actions.ackAlert, { success: "Alert acknowledged" });
  const href = alert.task_id ? `/projects/${alert.project_slug}/tasks` : `/projects/${alert.project_slug}`;
  return (
    <div data-testid={`alert-row-${alert.id}`} className={`flex items-start gap-3 px-3 py-2.5 border-b border-line last:border-0 row-hover ${alert.acknowledged ? "opacity-50" : ""}`}>
      <span className="mt-1.5"><SeverityDot severity={alert.severity} /></span>
      <div className="flex-1 min-w-0">
        <Link to={href} className="text-[12.5px] font-medium hover:underline underline-offset-2 block truncate">{alert.title}</Link>
        <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-mute">
          <span className="truncate">{alert.project_name}</span>
          <span>·</span><span className="mono">{timeAgo(alert.created_at)}</span>
          {!compact && <span className="hidden sm:inline">· {SEVERITY[alert.severity]?.label}</span>}
        </div>
        {!compact && alert.detail && <div className="text-[11.5px] text-mute mt-1">{alert.detail}</div>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <SourceTag source={alert.source} />
        {alert.link && <a href={alert.link} target="_blank" rel="noreferrer" className="btn btn-ghost h-6 px-1.5" title="Open source"><ExternalLink size={12} /></a>}
        {!alert.acknowledged && !alert.task_id && (
          <button data-testid={`alert-ack-${alert.id}`} disabled={ack.isPending} onClick={() => ack.mutate(alert.id)} className="btn btn-ghost h-6 px-1.5" title="Acknowledge">
            <Check size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

export function EventRow({ event, showProject = true }) {
  return (
    <div data-testid={`event-row-${event.id}`} className="flex items-center gap-3 h-9 px-3 border-b border-line last:border-0 row-hover">
      <Dot color={EVENT_COLORS[event.type] || "#929299"} size={6} />
      <span className="flex-1 truncate text-[12.5px]">{event.message}</span>
      {showProject && <span className="hidden sm:inline text-[11.5px] text-mute truncate max-w-[140px]">{event.project_name}</span>}
      <span className="hidden sm:inline text-[10.5px] text-mute uppercase tracking-wide w-16">{event.type}</span>
      {event.source !== "manual" && <SourceTag source={event.source} />}
      <span className="mono text-[11px] text-mute w-14 text-right">{timeAgo(event.created_at)}</span>
    </div>
  );
}
