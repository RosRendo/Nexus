import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TASK_STATUS } from "@/lib/constants";
import { todayStr } from "@/lib/format";

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const parse = (s) => new Date(`${s}T00:00:00`);

export function TaskCalendar({ tasks, onOpen }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const start = addDays(cursor, -((cursor.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const byDay = tasks.reduce((acc, t) => { if (t.due_date) (acc[t.due_date] = acc[t.due_date] || []).push(t); return acc; }, {});
  const today = todayStr();
  const undated = tasks.filter((t) => !t.due_date).length;
  return (
    <div className="panel overflow-hidden" data-testid="task-calendar">
      <div className="flex items-center gap-2 h-10 px-3 border-b border-line">
        <span className="text-[13px] font-medium">{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        {undated > 0 && <span className="text-[11px] text-mute">{undated} without due date</span>}
        <div className="ml-auto flex gap-1">
          <button data-testid="calendar-prev-btn" className="btn btn-ghost h-7 px-2" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={14} /></button>
          <button data-testid="calendar-today-btn" className="btn btn-ghost h-7" onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }}>Today</button>
          <button data-testid="calendar-next-btn" className="btn btn-ghost h-7 px-2" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={14} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-[10.5px] text-mute border-b border-line">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = ymd(d);
          const items = byDay[key] || [];
          const inMonth = d.getMonth() === cursor.getMonth();
          return (
            <div key={key} className={`min-h-[92px] border-b border-r border-line p-1.5 ${inMonth ? "" : "opacity-40"}`}>
              <div className={`mono text-[11px] mb-1 ${key === today ? "text-acc font-semibold" : "text-mute"}`}>{d.getDate()}</div>
              <div className="space-y-1">
                {items.slice(0, 3).map((t) => (
                  <button key={t.id} data-testid={`calendar-task-${t.id}`} onClick={() => onOpen(t)} className="w-full text-left truncate text-[11px] px-1.5 py-[3px] rounded-[4px] bg-white/[0.05] hover:bg-white/[0.1] transition-colors" style={{ borderLeft: `2px solid ${TASK_STATUS[t.status].color}` }}>
                    {t.title}
                  </button>
                ))}
                {items.length > 3 && <div className="text-[10.5px] text-mute px-1">+{items.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TaskTimeline({ tasks, onOpen }) {
  const [offset, setOffset] = useState(0);
  const start = addDays(new Date(new Date().toDateString()), -7 + offset * 14);
  const span = 42;
  const dated = tasks.filter((t) => t.due_date).sort((a, b) => (a.start_date || a.due_date).localeCompare(b.start_date || b.due_date));
  const pos = (s) => ((parse(s) - start) / 86400000 / span) * 100;
  const todayPos = ((new Date(new Date().toDateString()) - start) / 86400000 / span) * 100;
  const weeks = Array.from({ length: 6 }, (_, i) => addDays(start, i * 7));
  return (
    <div className="panel overflow-hidden" data-testid="task-timeline">
      <div className="flex items-center h-10 px-3 border-b border-line gap-2">
        <span className="text-[12px] text-mute">{dated.length} scheduled tasks · 6-week window</span>
        <div className="ml-auto flex gap-1">
          <button data-testid="timeline-prev-btn" className="btn btn-ghost h-7 px-2" onClick={() => setOffset(offset - 1)}><ChevronLeft size={14} /></button>
          <button data-testid="timeline-next-btn" className="btn btn-ghost h-7 px-2" onClick={() => setOffset(offset + 1)}><ChevronRight size={14} /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[220px_1fr] border-b border-line text-[10.5px] text-mute">
            <div className="px-3 py-1.5">Task</div>
            <div className="relative h-7">
              {weeks.map((w, i) => <span key={i} className="absolute top-1.5 mono" style={{ left: `${(i / 6) * 100}%`, paddingLeft: 4 }}>{w.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>)}
            </div>
          </div>
          {dated.map((t) => {
            const s = Math.max(0, pos(t.start_date && t.start_date < t.due_date ? t.start_date : t.due_date));
            const e = Math.min(100, pos(t.due_date) + 100 / span);
            const visible = e > 0 && s < 100;
            return (
              <div key={t.id} className="grid grid-cols-[220px_1fr] border-b border-line last:border-0 row-hover cursor-pointer" onClick={() => onOpen(t)} data-testid={`timeline-row-${t.id}`}>
                <div className="px-3 h-8 flex items-center text-[12px] truncate">{t.title}</div>
                <div className="relative h-8">
                  {todayPos >= 0 && todayPos <= 100 && <div className="absolute top-0 bottom-0 w-px bg-acc/50" style={{ left: `${todayPos}%` }} />}
                  {visible && <div className="absolute top-2 h-4 rounded-[4px]" style={{ left: `${s}%`, width: `${Math.max(1.5, e - s)}%`, background: `${TASK_STATUS[t.status].color}55`, border: `1px solid ${TASK_STATUS[t.status].color}` }} />}
                </div>
              </div>
            );
          })}
          {!dated.length && <div className="p-6 text-center text-mute text-[12.5px]">No tasks with dates. Add start and due dates to see them here.</div>}
        </div>
      </div>
    </div>
  );
}
