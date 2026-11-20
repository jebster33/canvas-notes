import { useLayoutEffect, useRef, useState } from "react";
import type { Board, CardNode, Priority, Reminder, TaskData } from "../lib/types";
import { selectBoard, useStore } from "../lib/store";
import { boardStatuses, isDoneStatus, statusMeta, withProgress, withStatus } from "../lib/status";
import { RichText } from "./RichText";

export const PRIORITY: Record<Priority, { label: string; color: string }> = {
  low: { label: "Low", color: "#5B9BD5" },
  medium: { label: "Medium", color: "#8B7CF6" },
  high: { label: "High", color: "#E39B2B" },
  critical: { label: "Critical", color: "#E2445C" },
};

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function TaskBody({ node, editing }: { node: CardNode; editing: boolean }) {
  const patchNode = useStore((s) => s.patchNode);
  const t = node.task!;
  const root = useRef<HTMLDivElement>(null);
  // Grow the card when its fields no longer fit (e.g. after adding a due date and reminder).
  useLayoutEffect(() => {
    const body = root.current?.closest<HTMLElement>(".card-body");
    if (!body || editing) return;
    const extra = body.scrollHeight - body.clientHeight;
    if (extra > 1 && extra < 400) patchNode(node.id, { h: node.h + extra }, false);
  }, [t.due, t.time, t.start, t.remind, node.h, node.id, editing, patchNode]);
  const set = (p: Partial<TaskData>) => patchNode(node.id, { task: { ...t, ...p } });
  const board = useStore(selectBoard);
  const st = statusMeta(board, t.status);
  const overdue = t.due && !st.done && new Date(`${t.due}T${t.time || "23:59"}`) < new Date();

  return (
    <>
      <div className="status-row" ref={root} style={{ position: "relative" }}>
        <StatusPicker board={board} value={t.status} onChange={(id) => set(withStatus(board, t.progress, id))} />
        <ProgressBar value={t.progress} color={st.color} onChange={(p) => set(withProgress(board, t.status, p))} />
      </div>
      <div className="task-meta" onPointerDown={stop} onKeyDown={stop}>
        <label>Owner</label>
        <input value={t.owner} placeholder="Unassigned" onChange={(e) => set({ owner: e.target.value })} />
        <label>Due</label>
        <div className="due-row">
          <input type="date" value={t.due} onChange={(e) => set({ due: e.target.value })} style={{ colorScheme: "dark", color: overdue ? "#F27474" : undefined }} />
          {t.due && <input type="time" value={t.time ?? ""} onChange={(e) => set({ time: e.target.value || undefined })} style={{ colorScheme: "dark" }} title="Time (optional)" />}
        </div>
        {t.due && (
          <>
            <label>Remind</label>
            <select value={t.remind ?? "due"} onChange={(e) => set({ remind: e.target.value as Reminder })} title="When to send a reminder">
              <option value="none">No reminder</option>
              <option value="due">{t.time ? "At due time" : "On the day"}</option>
              <option value="15m">15 minutes before</option>
              <option value="1h">1 hour before</option>
              <option value="1d">1 day before</option>
            </select>
          </>
        )}
        {(t.start || editing) && (
          <>
            <label>Start</label>
            <input type="date" value={t.start ?? ""} onChange={(e) => set({ start: e.target.value || undefined })} style={{ colorScheme: "dark" }} title="Start date, shown on the timeline" />
          </>
        )}
        <label>Priority</label>
        <select value={t.priority} onChange={(e) => set({ priority: e.target.value as Priority })} style={{ color: PRIORITY[t.priority].color, fontWeight: 600 }}>
          {(Object.keys(PRIORITY) as Priority[]).map((p) => (
            <option key={p} value={p}>{PRIORITY[p].label}</option>
          ))}
        </select>
      </div>
      <RichText nodeId={node.id} html={node.html} editing={editing} placeholder="Add details…" onChange={(html) => patchNode(node.id, { html })} />
    </>
  );
}

/** Status pill that opens the board's list of states. */
export function StatusPicker({ board, value, onChange }: { board: Board | null; value: string; onChange(id: string): void }) {
  const [open, setOpen] = useState(false);
  const st = statusMeta(board, value);
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button className="pill" style={{ background: st.color }} onPointerDown={stop} onClick={() => setOpen((o) => !o)}>
        {st.label}
      </button>
      {open && (
        <div className="pop menu" style={{ position: "absolute", top: 30, left: 0, minWidth: 170, zIndex: 50 }} onPointerDown={stop}>
          {boardStatuses(board).map((s) => (
            <button key={s.id} onClick={() => { onChange(s.id); setOpen(false); }}>
              <span className="pill" style={{ background: s.color, height: 18, padding: "0 8px", fontSize: 11 }}>{s.label}</span>
              {s.id === value && <span style={{ marginLeft: "auto", opacity: 0.6 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProgressBar({ value, color, onChange }: { value: number; color: string; onChange(p: number): void }) {
  return (
    <>
      <div
        className="progress"
        title="Click to set progress"
        onPointerDown={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          onChange(Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 20) * 5);
        }}
      >
        <div style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="progress-num">{value}%</span>
    </>
  );
}

export { isDoneStatus };
