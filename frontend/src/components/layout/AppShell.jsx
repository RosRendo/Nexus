import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { WifiOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sidebar } from "./Sidebar";
import { TopBar, MobileNav } from "./TopBar";
import { CommandPalette } from "@/components/CommandPalette";
import { NewProjectSheet } from "@/components/projects/ProjectForm";
import { NewTaskDialog } from "@/components/tasks/TaskForm";
import { useUI } from "@/context/UIContext";
import { isTyping } from "@/lib/format";
import { Kbd } from "@/components/common";

const SHORTCUTS = [
  ["⌘ K", "Command palette"], ["/", "Search"], ["G M", "Mission Control"], ["G T", "Today"], ["G P", "All projects"],
  ["G A", "Attention Center"], ["C", "Create (task in project or tasks views, otherwise project)"], ["[", "Collapse sidebar"],
  ["Esc", "Close inspector"], ["↵", "Open selected item full page"], ["?", "This list"],
];

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

function useShortcuts() {
  const ui = useUI();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pending = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ui.setPaletteOpen((v) => !v);
        return;
      }
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("[role=dialog]")) return;
      const k = e.key.toLowerCase();
      if (pending.current === "g") {
        pending.current = null;
        const map = { m: "/", t: "/tasks", p: "/projects", a: "/attention" };
        if (map[k]) navigate(map[k]);
        return;
      }
      if (k === "g") { pending.current = "g"; setTimeout(() => { pending.current = null; }, 900); return; }
      if (k === "/") { e.preventDefault(); ui.setPaletteOpen(true); }
      if (k === "[") ui.toggleSidebar();
      if (e.key === "?") ui.setShortcutsOpen(true);
      if (k === "c") {
        e.preventDefault();
        const m = pathname.match(/^\/projects\/([^/]+)/);
        if (m) ui.setNewTask({ projectSlug: m[1] });
        else if (pathname.startsWith("/tasks")) ui.setNewTask({});
        else ui.setNewProject(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui, navigate, pathname]);
}

export function AppShell() {
  const online = useOnline();
  const { shortcutsOpen, setShortcutsOpen } = useUI();
  useShortcuts();
  return (
    <div className="flex min-h-screen bg-bg0">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        {!online && (
          <div data-testid="offline-banner" className="flex items-center justify-center gap-2 h-8 text-[12px] bg-warn/15 text-warn border-b border-warn/30">
            <WifiOff size={13} /> You're offline. Showing the last loaded data; changes will fail until you reconnect.
          </div>
        )}
        <TopBar />
        <main className="flex-1 px-4 md:px-8 py-6 pb-24 md:pb-10 max-w-[1600px] w-full">
          <Outlet />
        </main>
      </div>
      <MobileNav />
      <CommandPalette />
      <NewProjectSheet />
      <NewTaskDialog />
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent data-testid="shortcuts-dialog" className="bg-s1 border-line sm:max-w-md">
          <DialogHeader><DialogTitle className="text-[15px]">Keyboard shortcuts</DialogTitle></DialogHeader>
          <div className="divide-y divide-line">
            {SHORTCUTS.map(([k, d]) => (
              <div key={k} className="flex items-center justify-between h-8 text-[12.5px]">
                <span className="text-mute">{d}</span><Kbd>{k}</Kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
