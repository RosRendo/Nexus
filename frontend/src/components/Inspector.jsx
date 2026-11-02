import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Maximize2 } from "lucide-react";
import { isTyping } from "@/lib/format";
import { Kbd } from "@/components/common";

export function Inspector({ open, onClose, onOpenFull, title, subtitle, children, testid = "inspector-panel" }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && onOpenFull && !isTyping(e) && !document.querySelector("[role=dialog]")) onOpenFull();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onOpenFull]);

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          data-testid={testid}
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed z-40 inset-0 md:inset-auto md:top-12 md:bottom-3 md:right-3 md:w-[400px] bg-s1/95 backdrop-blur-xl md:rounded-xl border-l md:border border-line shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col"
        >
          <div className="flex items-start justify-between gap-2 px-4 h-14 border-b border-line shrink-0 pt-3">
            <div className="min-w-0">
              <div className="text-[14px] font-semibold truncate">{title}</div>
              {subtitle && <div className="text-[11.5px] text-mute truncate">{subtitle}</div>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onOpenFull && (
                <button data-testid="inspector-open-full-btn" className="btn btn-ghost h-7 px-2" onClick={onOpenFull} title="Open full page (Enter)">
                  <Maximize2 size={13} /> <span className="hidden md:inline"><Kbd>↵</Kbd></span>
                </button>
              )}
              <button data-testid="inspector-close-btn" className="btn btn-ghost h-7 px-2" onClick={onClose} title="Close (Esc)">
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
