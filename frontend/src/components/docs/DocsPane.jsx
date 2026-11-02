import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { actions, useAction, useDocs } from "@/lib/queries";
import { DOC_CATEGORIES } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import { ConfirmDialog, Empty, QueryState, SourceTag } from "@/components/common";

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const headingText = (children) => (Array.isArray(children) ? children.join("") : String(children));
const H = (Tag) => ({ children }) => <Tag id={slugify(headingText(children))}>{children}</Tag>;

function Outline({ content }) {
  const heads = useMemo(() => (content.match(/^#{1,3} .+$/gm) || []).map((l) => ({ level: l.match(/^#+/)[0].length, text: l.replace(/^#+ /, "") })), [content]);
  if (!heads.length) return null;
  return (
    <div className="hidden xl:block w-48 shrink-0" data-testid="doc-outline">
      <div className="section-label mb-2">On this page</div>
      {heads.map((h, i) => (
        <a key={i} href={`#${slugify(h.text)}`} className="block text-[12px] text-mute hover:text-ink py-1 truncate" style={{ paddingLeft: (h.level - 1) * 10 }}>{h.text}</a>
      ))}
    </div>
  );
}

export function DocsPane({ projectId }) {
  const q = useDocs({ project_id: projectId });
  const [params, setParams] = useSearchParams();
  const docs = q.data || [];
  const selectedId = params.get("doc") || docs[0]?.id;
  const doc = docs.find((d) => d.id === selectedId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", category: "other", content: "" });
  const [confirm, setConfirm] = useState(false);
  const editNext = useRef(null);
  useEffect(() => { if (doc) setDraft({ title: doc.title, category: doc.category, content: doc.content }); setEditing(!!doc && editNext.current === doc.id); }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const select = (id) => setParams((p) => { p.set("doc", id); return p; });
  const create = useAction(actions.createDoc, { success: "Document created", onDone: (d) => { editNext.current = d.id; select(d.id); } });
  const save = useAction(actions.updateDoc, { success: "Document saved", onDone: () => setEditing(false) });
  const del = useAction(actions.deleteDoc, { success: "Document deleted", onDone: () => { setConfirm(false); setParams({}); } });
  const newDoc = () => create.mutate({ project_id: projectId, title: "Untitled document", category: "other", content: "# Untitled document\n\nStart writing…\n" });

  return (
    <QueryState query={q}>
      <div className="flex flex-col md:flex-row gap-4">
        <div className="md:w-56 shrink-0">
          <button data-testid="new-doc-btn" className="btn btn-primary w-full justify-center mb-3" onClick={newDoc} disabled={create.isPending}><Plus size={13} /> New document</button>
          <div className="space-y-[1px]" data-testid="doc-list">
            {docs.map((d) => (
              <button key={d.id} data-testid={`doc-item-${d.id}`} onClick={() => select(d.id)} className={`w-full text-left px-2.5 py-1.5 rounded-[6px] transition-colors ${d.id === selectedId ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"}`}>
                <div className="text-[12.5px] truncate">{d.title}</div>
                <div className="text-[10.5px] text-mute uppercase tracking-wide">{d.category}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          {!doc ? (
            <div className="panel"><Empty icon={FileText} title="No documentation yet" text="Architecture, API docs, schema, deployment steps and runbooks live here." /></div>
          ) : (
            <div className="panel p-5 flex gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-line">
                  {editing ? (
                    <>
                      <input data-testid="doc-title-input" className="fos-input h-7 flex-1" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                      <select data-testid="doc-category-select" className="fos-input h-7 w-36" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                    </>
                  ) : (
                    <>
                      <span className="text-[11px] text-mute uppercase tracking-wide">{doc.category}</span>
                      <span className="text-[11px] text-mute mono">· updated {timeAgo(doc.updated_at)}</span>
                      {doc.source === "sample" && <SourceTag source="sample" />}
                    </>
                  )}
                  <div className="ml-auto flex gap-1">
                    {editing ? (
                      <>
                        <button className="btn btn-ghost h-7" onClick={() => setEditing(false)}>Cancel</button>
                        <button data-testid="doc-save-btn" className="btn btn-primary h-7" disabled={!draft.title.trim() || save.isPending} onClick={() => save.mutate({ id: doc.id, ...draft })}>Save</button>
                      </>
                    ) : (
                      <>
                        <button data-testid="doc-edit-btn" className="btn btn-ghost h-7" onClick={() => setEditing(true)}><Pencil size={12} /> Edit</button>
                        <button data-testid="doc-delete-btn" className="btn btn-ghost h-7 text-bad" onClick={() => setConfirm(true)}><Trash2 size={12} /></button>
                      </>
                    )}
                  </div>
                </div>
                {editing ? (
                  <textarea data-testid="doc-content-input" className="fos-input mono text-[12.5px] min-h-[420px]" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
                ) : (
                  <div className="md" data-testid="doc-content"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ h1: H("h1"), h2: H("h2"), h3: H("h3") }}>{doc.content}</ReactMarkdown></div>
                )}
              </div>
              {!editing && <Outline content={doc.content} />}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete document?" description="The document moves to trash." actionLabel="Delete" pending={del.isPending} onConfirm={() => del.mutate(doc.id)} />
    </QueryState>
  );
}
