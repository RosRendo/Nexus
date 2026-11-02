import { GitCommit, GitPullRequest, PlayCircle, ExternalLink, Github } from "lucide-react";
import { Link } from "react-router-dom";
import { useGithub } from "@/lib/queries";
import { timeAgo } from "@/lib/format";
import { Dot, Empty, QueryState, SourceTag } from "@/components/common";

const runColor = (r) => (r.status !== "completed" ? "#0A84FF" : r.conclusion === "success" ? "#30D158" : r.conclusion === "failure" ? "#FF453A" : "#929299");

function Header({ data, title }) {
  return (
    <div className="flex items-center gap-2 h-10 px-3 border-b border-line">
      <Github size={13} className="text-mute" />
      <span className="text-[12.5px] font-medium">{title}</span>
      <span className="mono text-[11px] text-mute truncate">{data.repo}</span>
      <span className="ml-auto"><SourceTag source={data.source} /></span>
    </div>
  );
}

function NoRepo() {
  return <Empty icon={Github} title="No repository linked" text="Add a GitHub repository in this project's Settings tab to see commits, pull requests and Actions runs." />;
}

function Notice({ data }) {
  if (data.error) return <div className="px-3 py-2 text-[11.5px] text-bad border-b border-line">GitHub error: {data.error}</div>;
  if (data.source === "demo") return <div className="px-3 py-2 text-[11.5px] text-warn/90 border-b border-line">Demo data. <Link to="/integrations" className="underline">Connect GitHub</Link> to load real commits for this repo.</div>;
  return null;
}

export function GitHubPanel({ projectId }) {
  const q = useGithub(projectId);
  return (
    <div className="panel overflow-hidden" data-testid="github-panel">
      <QueryState query={q} rows={4}>
        {q.data?.source === "none" ? <NoRepo /> : q.data && (
          <>
            <Header data={q.data} title="Repository" />
            <Notice data={q.data} />
            <div className="section-label px-3 pt-3 pb-1">Recent commits</div>
            {q.data.commits.slice(0, 6).map((c) => (
              <a key={c.sha} href={c.url || undefined} target="_blank" rel="noreferrer" data-testid={`commit-${c.sha.slice(0, 7)}`} className="flex items-center gap-2.5 h-8 px-3 row-hover text-[12px]">
                <GitCommit size={13} className="text-mute shrink-0" />
                <span className="mono text-[11px] text-acc">{c.sha.slice(0, 7)}</span>
                <span className="truncate flex-1">{c.message}</span>
                <span className="mono text-[11px] text-mute">{timeAgo(c.date)}</span>
              </a>
            ))}
            {!q.data.commits.length && <div className="px-3 pb-2 text-[12px] text-mute">No commits returned.</div>}
            <div className="section-label px-3 pt-3 pb-1">Open pull requests</div>
            {q.data.pulls.map((p) => (
              <a key={p.number} href={p.url || undefined} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 h-8 px-3 row-hover text-[12px]">
                <GitPullRequest size={13} className="text-ok shrink-0" />
                <span className="mono text-[11px] text-mute">#{p.number}</span>
                <span className="truncate flex-1">{p.title}</span>
                <span className="mono text-[11px] text-mute">{timeAgo(p.updated_at)}</span>
              </a>
            ))}
            {!q.data.pulls.length && <div className="px-3 pb-3 text-[12px] text-mute">No open pull requests.</div>}
          </>
        )}
      </QueryState>
    </div>
  );
}

export function GitHubRuns({ projectId }) {
  const q = useGithub(projectId);
  return (
    <div className="panel overflow-hidden" data-testid="github-runs">
      <QueryState query={q} rows={4}>
        {q.data?.source === "none" ? <NoRepo /> : q.data && (
          <>
            <Header data={q.data} title="GitHub Actions runs" />
            <Notice data={q.data} />
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Status</th><th>Workflow</th><th>Commit</th><th>Branch</th><th className="text-right">Duration</th><th className="text-right">Started</th><th /></tr></thead>
                <tbody>
                  {q.data.runs.map((r) => (
                    <tr key={r.id} className="row-hover" data-testid={`run-row-${r.id}`}>
                      <td><span className="inline-flex items-center gap-1.5 text-[12px]"><Dot color={runColor(r)} />{r.conclusion || r.status}</span></td>
                      <td className="text-[12.5px]"><span className="inline-flex items-center gap-1.5"><PlayCircle size={12} className="text-mute" />{r.name}</span></td>
                      <td className="mono text-[11.5px] text-acc">{r.sha?.slice(0, 7)}</td>
                      <td className="mono text-[11.5px] text-mute">{r.branch}</td>
                      <td className="mono text-[11.5px] text-right">{r.duration_s != null ? `${Math.floor(r.duration_s / 60)}m ${r.duration_s % 60}s` : "—"}</td>
                      <td className="mono text-[11.5px] text-right text-mute">{timeAgo(r.created_at)}</td>
                      <td>{r.url && <a href={r.url} target="_blank" rel="noreferrer" className="btn btn-ghost h-6 px-1.5"><ExternalLink size={12} /></a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!q.data.runs.length && <div className="p-4 text-[12px] text-mute">No workflow runs found.</div>}
            </div>
          </>
        )}
      </QueryState>
    </div>
  );
}
