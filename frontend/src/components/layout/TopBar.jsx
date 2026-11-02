import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, LogOut, ShieldCheck, Plug, Gauge, ListChecks, FolderKanban, Siren } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NAV_ITEMS } from "@/lib/constants";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import { useIntegrations, useDashboard, useProject } from "@/lib/queries";
import { Dot } from "@/components/common";
import { timeAgo } from "@/lib/format";

function SyncDots() {
  const { data } = useIntegrations();
  if (!data) return null;
  const gh = data.find((p) => p.key === "github");
  const demo = data.filter((p) => p.status === "connected" && p.key !== "github").length;
  const color = gh.status === "connected" ? "#30D158" : gh.status === "error" ? "#FF453A" : "#636366";
  return (
    <Link to="/integrations" data-testid="topbar-sync-status" className="hidden sm:flex items-center gap-3 text-[11.5px] text-mute hover:text-ink transition-colors">
      <span className="flex items-center gap-1.5" title={`GitHub: ${gh.status}${gh.last_sync_at ? ` · synced ${timeAgo(gh.last_sync_at)}` : ""}`}>
        <Dot color={color} size={6} /> GitHub
      </span>
      <span className="flex items-center gap-1.5" title="Other providers connected">
        <Dot color={demo ? "#30D158" : "#636366"} size={6} /> {demo} providers
      </span>
    </Link>
  );
}

export function TopBar({ crumb }) {
  const { user, logout } = useAuth();
  const { setPaletteOpen } = useUI();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = NAV_ITEMS.find((n) => (n.path === "/" ? pathname === "/" : pathname.startsWith(n.path)));
  const projectId = pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const project = useProject(projectId);
  if (projectId && project.data) crumb = `All Projects / ${project.data.name}`;
  return (
    <header className="sticky top-0 z-30 h-12 flex items-center gap-3 px-4 md:px-6 border-b border-line bg-bg0/80 backdrop-blur-md">
      <div data-testid="topbar-breadcrumb" className="flex items-center gap-1.5 text-[12.5px] min-w-0">
        <span className="text-mute hidden sm:inline">Founder OS</span>
        <span className="text-mute/50 hidden sm:inline">/</span>
        <span className="truncate">{crumb || current?.label || "Founder OS"}</span>
      </div>
      <button data-testid="topbar-search-btn" onClick={() => setPaletteOpen(true)} className="ml-auto md:ml-6 flex items-center gap-2 h-7 px-2.5 md:w-72 rounded-[7px] bg-s2 border border-line text-mute text-[12px] hover:border-white/15 transition-colors">
        <Search size={13} /> <span className="hidden md:inline">Search projects, tasks, docs…</span>
        <span className="ml-auto kbd hidden md:inline">⌘K</span>
      </button>
      <div className="md:ml-auto flex items-center gap-4">
        <SyncDots />
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="topbar-avatar-menu" className="w-7 h-7 rounded-full overflow-hidden border border-line bg-s2 flex items-center justify-center text-[11px] font-semibold">
            {user?.picture ? <img src={user.picture} alt="" className="w-full h-full object-cover" /> : (user?.name || "F")[0]}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-s2 border-line">
            <DropdownMenuLabel className="font-normal">
              <div className="text-[12.5px]">{user?.name}</div>
              <div className="text-[11.5px] text-mute truncate">{user?.email} · {user?.role}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-testid="menu-account" onClick={() => navigate("/account")}><ShieldCheck size={13} className="mr-2" /> Account & Security</DropdownMenuItem>
            <DropdownMenuItem data-testid="menu-integrations" onClick={() => navigate("/integrations")}><Plug size={13} className="mr-2" /> Integrations</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-testid="menu-logout" onClick={logout}><LogOut size={13} className="mr-2" /> Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export function MobileNav() {
  const { setPaletteOpen } = useUI();
  const { pathname } = useLocation();
  const dash = useDashboard();
  const items = [
    { to: "/", label: "Home", icon: Gauge, id: "home" },
    { to: "/tasks", label: "Today", icon: ListChecks, id: "today" },
    { to: "/projects", label: "Projects", icon: FolderKanban, id: "projects" },
    { to: "/attention", label: "Alerts", icon: Siren, id: "alerts", badge: dash.data?.alert_count },
  ];
  return (
    <nav data-testid="mobile-bottom-nav" className="md:hidden fixed bottom-0 inset-x-0 z-30 h-14 border-t border-line bg-bg0/90 backdrop-blur-md grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
      {items.map(({ to, label, icon: Icon, id, badge }) => {
        const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
        return (
          <Link key={to} to={to} data-testid={`mobile-nav-${id}`} className={`relative flex flex-col items-center justify-center gap-0.5 text-[10px] ${active ? "text-ink" : "text-mute"}`}>
            <Icon size={17} strokeWidth={1.75} />
            {label}
            {badge > 0 && <span className="absolute top-1.5 right-[28%] mono text-[9px] text-bad">{badge}</span>}
          </Link>
        );
      })}
      <button data-testid="mobile-nav-search" onClick={() => setPaletteOpen(true)} className="flex flex-col items-center justify-center gap-0.5 text-[10px] text-mute">
        <Search size={17} strokeWidth={1.75} /> Search
      </button>
    </nav>
  );
}
