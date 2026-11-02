import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderKanban, ListChecks, FileText, Plus, PanelLeft, Keyboard, LogOut } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { NAV_ITEMS } from "@/lib/constants";
import { useProjects, useSearch } from "@/lib/queries";
import { useUI } from "@/context/UIContext";
import { useAuth } from "@/context/AuthContext";
import { StageBadge } from "@/components/common";

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setNewProject, setNewTask, toggleSidebar, setShortcutsOpen } = useUI();
  const { logout } = useAuth();
  const [term, setTerm] = useState("");
  const navigate = useNavigate();
  const projects = useProjects();
  const search = useSearch(term);
  const names = Object.fromEntries((projects.data?.items || []).map((p) => [p.id, p]));

  const run = (fn) => {
    setPaletteOpen(false);
    setTerm("");
    fn();
  };

  return (
    <CommandDialog open={paletteOpen} onOpenChange={(v) => { setPaletteOpen(v); if (!v) setTerm(""); }}>
      <div data-testid="cmd-k-palette">
        <CommandInput data-testid="cmd-k-input" placeholder="Jump to a project, page or task…" value={term} onValueChange={setTerm} />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem data-testid="cmd-new-project" onSelect={() => run(() => setNewProject(true))}><Plus size={14} className="mr-2" /> New project<CommandShortcut>C</CommandShortcut></CommandItem>
            <CommandItem data-testid="cmd-new-task" onSelect={() => run(() => setNewTask({}))}><Plus size={14} className="mr-2" /> New task</CommandItem>
            <CommandItem onSelect={() => run(toggleSidebar)}><PanelLeft size={14} className="mr-2" /> Toggle sidebar<CommandShortcut>[</CommandShortcut></CommandItem>
            <CommandItem onSelect={() => run(() => setShortcutsOpen(true))}><Keyboard size={14} className="mr-2" /> Keyboard shortcuts<CommandShortcut>?</CommandShortcut></CommandItem>
            <CommandItem onSelect={() => run(logout)}><LogOut size={14} className="mr-2" /> Sign out</CommandItem>
          </CommandGroup>
          <CommandGroup heading="Projects">
            {(projects.data?.items || []).map((p) => (
              <CommandItem key={p.id} value={`project ${p.name} ${p.slug}`} data-testid={`cmd-project-${p.slug}`} onSelect={() => run(() => navigate(`/projects/${p.slug}`))}>
                <FolderKanban size={14} className="mr-2" /> {p.name}
                <span className="ml-auto"><StageBadge stage={p.stage} /></span>
              </CommandItem>
            ))}
          </CommandGroup>
          {search.data?.tasks?.length > 0 && (
            <CommandGroup heading="Tasks">
              {search.data.tasks.map((t) => (
                <CommandItem key={t.id} value={`task ${t.title} ${term}`} onSelect={() => run(() => navigate(`/projects/${names[t.project_id]?.slug || t.project_id}/tasks`))}>
                  <ListChecks size={14} className="mr-2" /> {t.title}
                  <span className="ml-auto text-mute text-[11px]">{names[t.project_id]?.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {search.data?.documents?.length > 0 && (
            <CommandGroup heading="Documents">
              {search.data.documents.map((d) => (
                <CommandItem key={d.id} value={`doc ${d.title} ${term}`} onSelect={() => run(() => navigate(`/projects/${names[d.project_id]?.slug || d.project_id}/docs?doc=${d.id}`))}>
                  <FileText size={14} className="mr-2" /> {d.title}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Pages">
            {NAV_ITEMS.map((n) => (
              <CommandItem key={n.path} value={`page ${n.label}`} onSelect={() => run(() => navigate(n.path))}>
                <n.icon size={14} className="mr-2" /> {n.label}
                {n.phase && <span className="ml-2 mono text-[9px] text-mute border border-line rounded px-1">P{n.phase}</span>}
                {n.shortcut && <CommandShortcut>{n.shortcut}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </div>
    </CommandDialog>
  );
}
