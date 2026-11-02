import { NavLink } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, Command } from "lucide-react";
import { NAV } from "@/lib/constants";
import { useUI } from "@/context/UIContext";
import { useDashboard, useGet } from "@/lib/queries";

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function NavItem({ item, collapsed, badge }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      data-testid={`nav-${slug(item.label)}`}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `group flex items-center gap-2.5 h-[28px] rounded-[6px] px-2 text-[12.5px] transition-colors duration-100 ${
          isActive ? "bg-white/[0.07] text-ink" : item.phase ? "text-mute/55 hover:text-mute" : "text-mute hover:text-ink hover:bg-white/[0.04]"
        } ${collapsed ? "justify-center" : ""}`
      }
    >
      <Icon size={14} strokeWidth={1.75} className="shrink-0" />
      {!collapsed && <span className="truncate flex-1">{item.label}</span>}
      {!collapsed && item.phase && <span className="mono text-[9px] text-mute/60 border border-line rounded px-1">P{item.phase}</span>}
      {!collapsed && badge > 0 && <span className="mono text-[10px] text-bad">{badge}</span>}
    </NavLink>
  );
}

export function Sidebar() {
  const { collapsed, toggleSidebar, setPaletteOpen } = useUI();
  const dash = useDashboard();
  const alertCount = dash.data?.alert_count || 0;
  const notes = useGet("notifications", "/notifications");
  const badges = { "/attention": alertCount, "/notifications": notes.data?.unread || 0 };
  return (
    <aside
      data-testid="sidebar-nav"
      className={`hidden md:flex flex-col shrink-0 h-screen sticky top-0 border-r border-line bg-bg0 transition-[width] duration-200 ${collapsed ? "w-[56px]" : "w-[232px]"}`}
    >
      <div className={`flex items-center h-12 px-3 gap-2 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-[5px] bg-ink text-bg0 flex items-center justify-center text-[10px] font-bold">F</span>
            <span className="text-[13px] font-semibold tracking-tight">Founder OS</span>
          </div>
        )}
        <button data-testid="sidebar-toggle-btn" onClick={toggleSidebar} className="btn btn-ghost h-7 px-1.5" title="Toggle sidebar ([)">
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>
      </div>
      {!collapsed && (
        <button data-testid="sidebar-search-btn" onClick={() => setPaletteOpen(true)} className="mx-3 mb-2 flex items-center gap-2 h-7 px-2 rounded-[6px] border border-line text-mute text-[12px] hover:text-ink transition-colors">
          <Command size={12} /> Search or jump to… <span className="ml-auto kbd">⌘K</span>
        </button>
      )}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {NAV.map((g) => (
          <div key={g.group} className="mt-3">
            {!collapsed ? <div className="section-label px-2 mb-1">{g.group}</div> : <div className="h-px bg-line mx-2 mb-2" />}
            <div className="space-y-[1px]">
              {g.items.map((it) => (
                <NavItem key={it.path} item={it} collapsed={collapsed} badge={badges[it.path] || 0} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
