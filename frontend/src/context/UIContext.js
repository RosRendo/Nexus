import { createContext, useContext, useState } from "react";

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("fos.sidebar") === "1" || window.innerWidth < 1100);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [newTask, setNewTask] = useState(null);

  const toggleSidebar = () =>
    setCollapsed((c) => {
      localStorage.setItem("fos.sidebar", c ? "0" : "1");
      return !c;
    });

  return (
    <UIContext.Provider value={{ collapsed, toggleSidebar, paletteOpen, setPaletteOpen, shortcutsOpen, setShortcutsOpen, newProject, setNewProject, newTask, setNewTask }}>
      {children}
    </UIContext.Provider>
  );
}

export const useUI = () => useContext(UIContext);
