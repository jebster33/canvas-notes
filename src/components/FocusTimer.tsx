import { useEffect, useState } from "react";
import { Pause, Play, Square, Timer, Coffee, Plus } from "lucide-react";
import { focusTick, useFocus } from "../lib/productivity";
import { useStore } from "../lib/store";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Floating focus-timer pill, shown while a task has a timer. */
export function FocusTimer() {
  const f = useFocus();
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!f.nodeId) return;
    const t = window.setInterval(() => { focusTick(); setNow(Date.now()); }, 1000);
    return () => window.clearInterval(t);
  }, [f.nodeId]);
  if (!f.nodeId) return null;
  const left = f.endsAt ? f.endsAt - Date.now() : f.left;
  const pct = f.length ? Math.min(100, Math.max(0, 100 - (left / f.length) * 100)) : 0;
  const goTo = () => {
    const st = useStore.getState();
    if (!f.boardId || !st.boards[f.boardId]) return;
    if (st.activeId !== f.boardId) st.openBoard(f.boardId);
    if (st.view !== "canvas") st.setView("canvas");
    useStore.setState({ focus: f.nodeId });
  };
  return (
    <div className={"focus-pill" + (f.phase === "break" ? " brk" : "")} role="timer" aria-label="Focus timer" style={{ ["--pct" as string]: pct + "%" }}>
      <span className="fp-ic">{f.phase === "break" ? <Coffee size={15} /> : <Timer size={15} />}</span>
      <button className="fp-title" onClick={goTo} title="Show the task">
        <small>{f.phase === "break" ? "Break" : `Focus${f.rounds ? ` · round ${f.rounds + 1}` : ""}`}</small>
        <span>{f.title}</span>
      </button>
      <b className="fp-time">{mmss(left)}</b>
      <button className="btn icon" title="Add 5 minutes" aria-label="Add 5 minutes" onClick={() => f.addMinutes(5)}><Plus size={14} /></button>
      {f.endsAt
        ? <button className="btn icon" title="Pause" aria-label="Pause" onClick={f.pause}><Pause size={14} /></button>
        : <button className="btn icon" title="Start" aria-label="Start" onClick={f.resume}><Play size={14} /></button>}
      <button className="btn icon" title="Stop and log the time" aria-label="Stop" onClick={f.stop}><Square size={13} /></button>
      <i className="fp-bar" />
    </div>
  );
}

/** Small button on task cards that starts (or shows) the focus timer. */
export function FocusButton({ boardId, nodeId }: { boardId: string; nodeId: string }) {
  const active = useFocus((s) => s.nodeId === nodeId);
  const workMin = useFocus((s) => s.workMin);
  return (
    <button
      className={"btn icon focus-btn" + (active ? " on" : "")}
      title={active ? "Focus timer running" : `Focus on this for ${workMin} minutes`}
      aria-label="Focus timer"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); if (!active) useFocus.getState().start(boardId, nodeId); }}
    >
      <Timer size={13} />
    </button>
  );
}
