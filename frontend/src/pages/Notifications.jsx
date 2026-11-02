import { CheckCheck, Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAction, useGet } from "@/lib/queries";
import { timeAgo } from "@/lib/format";
import { Empty, PageHeader, QueryState, SeverityDot, SourceTag } from "@/components/common";

export default function Notifications() {
  const q = useGet("notifications", "/notifications");
  const read = useAction((ids) => api.post("/notifications/read", { ids }).then((r) => r.data));
  return (
    <div data-testid="notifications-page">
      <PageHeader label="Settings" title="Notifications" subtitle="In-app delivery of alerts that match each project's notification rules."
        actions={<button data-testid="notifications-read-all" className="btn btn-outline" onClick={() => read.mutate(null)}><CheckCheck size={13} /> Mark all read</button>} />
      <p className="text-[12px] text-mute mb-3">Rules are edited per project in <Link to="/projects" className="underline">Workspace → Settings</Link>. Email and push delivery are not connected.</p>
      <div className="panel overflow-hidden">
        <QueryState query={q}>
          {q.data?.items?.length ? q.data.items.map((n) => (
            <div key={n.id} data-testid={`notification-${n.id}`} onClick={() => !n.read && read.mutate([n.id])} className={`flex items-start gap-3 px-3 py-2.5 border-b border-line last:border-0 row-hover cursor-pointer ${n.read ? "opacity-55" : ""}`}>
              <span className="mt-1.5"><SeverityDot severity={n.severity} /></span>
              <div className="flex-1 min-w-0"><div className="text-[12.5px] font-medium">{n.title}</div><div className="text-[11.5px] text-mute truncate">{n.body}</div></div>
              <SourceTag source={n.source} />
              <span className="mono text-[11px] text-mute">{timeAgo(n.created_at)}</span>
              {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-acc mt-2" />}
            </div>
          )) : <Empty icon={Bell} title="No notifications" text="Live alerts (failed deploys, downtime, SSL, error spikes) appear here." />}
        </QueryState>
      </div>
    </div>
  );
}
