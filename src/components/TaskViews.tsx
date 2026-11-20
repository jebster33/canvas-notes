import { useMemo, useRef, useState } from "react";
import { Plus, ChevronLeft, ChevronRight, CalendarDays, Bell, MoreHorizontal, Pencil, Trash2, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { selectBoard, useStore } from "../lib/store";
import type { StatusDef } from "../lib/types";
import { PRIORITY } from "../cards/TaskBody";
import { boardStatuses, isDoneStatus, statusMeta, withStatus, STATUS_COLORS } from "../lib/status";
import { collectTasks, createTask, patchTask, isoDay, parseDay, addDays, type TaskRef } from "../lib/taskops";
import { describeDue, dueAt } from "../lib/reminders";
import { tagColor } from "../lib/tags";
import { Seg } from "./ui";

function useScope() {
  const [all, setAll] = useState(false);
  const board = useStore(selectBoard)!;
  const boards = useStore((s) => s.boards);
  const ws = useStore((s) => s.activeWs);
  const tasks = useMemo(() => collectTasks(boards, all ? null : board.id, ws), [boards, all, board.id, ws]);
  const toggle = (
    <Seg value={all ? "all" : "one"} onChange={(v) => setAll(v === "all")} options={[{ v: "one", label: "This board" }, { v: "all", label: "Whole workspace" }]} />
  );
  return { tasks, all, toggle };
}

function TaskChip({ t, all, compact }: { t: TaskRef; all: boolean; compact?: boolean }) {
  const { n, b } = t;
  const task = n.task!;
  const st = statusMeta(b, task.status);
  const overdue = !st.done && (dueAt(n)?.getTime() ?? Infinity) < Date.now();
  return (
    <div
      className={"tv-card" + (compact ? " compact" : "") + (st.done ? " done" : "")}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-task", JSON.stringify({ b: b.id, n: n.id }));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => useStore.getState().openTask(b.id, n.id)}
      title="Click to open, drag to move"
    >
      <i className="tv-stripe" style={{ background: st.color }} />
      <div className="tv-title">{n.title || "Task"}</div>
      {!compact && (
        <div className="tv-meta">
          {task.due && <span className={"tv-due" + (overdue ? " hot" : "")}>{task.remind && task.remind !== "none" && <Bell size={10} />}{describeDue(n)}</span>}
          <span className="tv-prio" style={{ color: PRIORITY[task.priority].color }}>{PRIORITY[task.priority].label}</span>
          {task.owner && <span className="tv-owner" title={task.owner}>{task.owner.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>}
          {all && <span className="tv-board"><i style={{ background: b.color }} />{b.name}</span>}
        </div>
      )}
      {!compact && n.tags && n.tags.length > 0 && (
        <div className="tv-tags">{n.tags.map((tg) => { const c = tagColor(b.tagColors, tg); return <span key={tg} className="tag-chip" style={{ background: c + "26", color: c, borderColor: c + "55" }}>{tg}</span>; })}</div>
      )}
      {!compact && task.progress > 0 && !st.done && (
        <div className="tv-progress"><div style={{ width: `${task.progress}%`, background: st.color }} /></div>
      )}
    </div>
  );
}

const readDrop = (e: React.DragEvent): { b: string; n: string } | null => {
  try { return JSON.parse(e.dataTransfer.getData("application/x-task")); } catch { return null; }
};

/* ---------------- Kanban (Trello-style lists) ---------------- */

function ListHeader({ s, count, index, total, editable }: { s: StatusDef; count: number; index: number; total: number; editable: boolean }) {
  const board = useStore(selectBoard)!;
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const list = boardStatuses(board);
  const save = (next: StatusDef[]) => useStore.getState().setStatuses(next);
  const patch = (p: Partial<StatusDef>) => save(list.map((x) => (x.id === s.id ? { ...x, ...p } : x)));
  const move = (d: number) => {
    const next = [...list];
    const [it] = next.splice(index, 1);
    next.splice(index + d, 0, it);
    save(next);
  };
  const remove = () => {
    if (list.length <= 1) return;
    const rest = list.filter((x) => x.id !== s.id);
    const fallback = rest[Math.max(0, index - 1)].id;
    // Tasks in the removed list move to the list before it.
    const st = useStore.getState();
    st.mutate((d) => {
      d.statuses = rest;
      for (const n of d.nodes) if (n.task?.status === s.id) n.task = { ...n.task, ...withStatus(d, n.task.progress, fallback) };
    });
    setMenu(false);
  };

  return (
    <div className="kb-head">
      <i style={{ background: s.color }} />
      {editing ? (
        <input
          className="kb-title-input"
          autoFocus
          defaultValue={s.label}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => { const v = e.target.value.trim(); if (v) patch({ label: v }); setEditing(false); }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
        />
      ) : (
        <b className="kb-title" onDoubleClick={() => editable && setEditing(true)} title={editable ? "Double-click to rename" : undefined}>{s.label}</b>
      )}
      {s.done && <span className="kb-done" title="Tasks here count as finished"><CheckCircle2 size={12} /></span>}
      <span className="kb-count">{count}</span>
      {editable && (
        <div style={{ position: "relative" }}>
          <button className="btn icon kb-menu-btn" aria-label="List options" onClick={() => setMenu((m) => !m)}><MoreHorizontal size={15} /></button>
          {menu && (
            <>
              <div className="menu-scrim" onPointerDown={() => setMenu(false)} />
              <div className="pop menu kb-menu">
                <button onClick={() => { setEditing(true); setMenu(false); }}><Pencil size={14} />Rename</button>
                <div className="menu-colors">
                  {STATUS_COLORS.map((c) => (
                    <button key={c} className={"swatch" + (s.color === c ? " on" : "")} style={{ background: c, width: 18, height: 18, padding: 0 }} aria-label="List color" onClick={() => patch({ color: c })} />
                  ))}
                </div>
                <button onClick={() => patch({ done: !s.done })}><CheckCircle2 size={14} />{s.done ? "Stop counting as done" : "Count tasks here as done"}</button>
                <hr />
                <button disabled={index === 0} onClick={() => { move(-1); setMenu(false); }}><ArrowLeft size={14} />Move left</button>
                <button disabled={index === total - 1} onClick={() => { move(1); setMenu(false); }}><ArrowRight size={14} />Move right</button>
                <hr />
                <button className="danger" disabled={list.length <= 1} onClick={remove}><Trash2 size={14} />Delete list ({count ? `tasks move to ${list[Math.max(0, index - 1)] === s ? list[1]?.label : list[Math.max(0, index - 1)].label}` : "empty"})</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function KanbanView() {
  const { tasks, all, toggle } = useScope();
  const board = useStore(selectBoard)!;
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newList, setNewList] = useState<string | null>(null);
  const [dragCol, setDragCol] = useState<number | null>(null);
  const cols = boardStatuses(board);
  // Tasks from other boards land in the list with the same id, else the same name, else the first.
  const colFor = (t: TaskRef) => {
    if (cols.some((c) => c.id === t.n.task!.status)) return t.n.task!.status;
    const label = statusMeta(t.b, t.n.task!.status).label.toLowerCase();
    return (cols.find((c) => c.label.toLowerCase() === label) ?? cols[0]).id;
  };
  const addList = () => {
    const label = (newList ?? "").trim();
    setNewList(null);
    if (!label) return;
    useStore.getState().setStatuses([...cols, { id: "s-" + Math.random().toString(36).slice(2, 8), label, color: STATUS_COLORS[cols.length % STATUS_COLORS.length] }]);
  };
  const moveCol = (from: number, to: number) => {
    if (from === to) return;
    const next = [...cols];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    useStore.getState().setStatuses(next);
  };

  return (
    <div className="tview">
      <div className="tv-bar">
        {toggle}
        <span className="tv-count">{tasks.filter((t) => !isDoneStatus(t.b, t.n.task!.status)).length} open tasks{all ? ` · lists from ${board.name}` : ""}</span>
      </div>
      <div className="kanban">
        {cols.map((s, idx) => {
          const list = tasks
            .filter((t) => colFor(t) === s.id)
            .sort((a, b) => (dueAt(a.n)?.getTime() ?? Infinity) - (dueAt(b.n)?.getTime() ?? Infinity));
          return (
            <div
              key={s.id}
              className={"kb-col" + (over === s.id ? " over" : "") + (dragCol === idx ? " dragging" : "")}
              onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                setOver(null);
                const col = e.dataTransfer.getData("application/x-col");
                if (col !== "") {
                  moveCol(Number(col), idx);
                  setDragCol(null);
                  return;
                }
                const d = readDrop(e);
                if (!d) return;
                const t = tasks.find((x) => x.n.id === d.n);
                const targetBoard = useStore.getState().boards[d.b];
                patchTask(d.b, d.n, withStatus(targetBoard, t?.n.task!.progress ?? 0, s.id));
              }}
            >
              <div
                draggable={!all}
                onDragStart={(e) => { e.dataTransfer.setData("application/x-col", String(idx)); setDragCol(idx); }}
                onDragEnd={() => setDragCol(null)}
                className="kb-grab"
                title={!all ? "Drag to reorder lists" : undefined}
              >
                <ListHeader s={s} count={list.length} index={idx} total={cols.length} editable={!all} />
              </div>
              <div className="kb-list">
                {list.map((t) => <TaskChip key={t.n.id} t={t} all={all} />)}
              </div>
              {adding === s.id ? (
                <input
                  className="field"
                  autoFocus
                  placeholder="Task name, Enter to add"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => { setAdding(null); setDraft(""); }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter" && draft.trim()) { createTask(draft.trim(), withStatus(board, 0, s.id)); setDraft(""); }
                    if (e.key === "Escape") setAdding(null);
                  }}
                />
              ) : (
                <button className="kb-add" onClick={() => setAdding(s.id)}><Plus size={13} />Add task</button>
              )}
            </div>
          );
        })}
        {!all && (
          <div className="kb-col kb-new">
            {newList === null ? (
              <button className="kb-add" onClick={() => setNewList("")}><Plus size={13} />Add another list</button>
            ) : (
              <>
                <input
                  className="field"
                  autoFocus
                  placeholder="List name, like Review"
                  value={newList}
                  onChange={(e) => setNewList(e.target.value)}
                  onBlur={addList}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") addList(); if (e.key === "Escape") setNewList(null); }}
                />
                <p className="hint-sm">Press Enter to add it. Double-click a list name to rename it, or use its ⋯ menu for color, order and "counts as done".</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Calendar ---------------- */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView() {
  const { tasks, all, toggle } = useScope();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const today = isoDay(new Date());

  const start = new Date(month);
  start.setDate(1 - ((month.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const byDay = new Map<string, TaskRef[]>();
  for (const t of tasks) if (t.n.task!.due) (byDay.get(t.n.task!.due) ?? byDay.set(t.n.task!.due, []).get(t.n.task!.due)!).push(t);
  const undated = tasks.filter((t) => !t.n.task!.due && !isDoneStatus(t.b, t.n.task!.status));

  const drop = (e: React.DragEvent, day: string | null) => {
    setOver(null);
    const d = readDrop(e);
    if (d) patchTask(d.b, d.n, { due: day ?? "" });
  };

  return (
    <div className="tview">
      <div className="tv-bar">
        {toggle}
        <div className="cal-nav">
          <button className="btn icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <b>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</b>
          <button className="btn icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
          <button className="btn" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}><CalendarDays size={14} />Today</button>
        </div>
      </div>
      <div className="cal-wrap">
        <div className="cal">
          {WEEKDAYS.map((w) => <div key={w} className="cal-wd">{w}</div>)}
          {days.map((d) => {
            const key = isoDay(d);
            const list = byDay.get(key) ?? [];
            return (
              <div
                key={key}
                className={"cal-day" + (d.getMonth() !== month.getMonth() ? " out" : "") + (key === today ? " today" : "") + (over === key ? " over" : "")}
                onDragOver={(e) => { e.preventDefault(); setOver(key); }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => drop(e, key)}
                onDoubleClick={() => setAdding(key)}
              >
                <div className="cal-num">{d.getDate()}<button className="cal-add" onClick={() => setAdding(key)} aria-label="Add task on this day"><Plus size={11} /></button></div>
                {list.slice(0, 4).map((t) => <TaskChip key={t.n.id} t={t} all={all} compact />)}
                {list.length > 4 && <div className="cal-more">+{list.length - 4} more</div>}
                {adding === key && (
                  <input
                    className="field"
                    autoFocus
                    placeholder="Task name"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => { setAdding(null); setDraft(""); }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter" && draft.trim()) { createTask(draft.trim(), { due: key }); setDraft(""); setAdding(null); }
                      if (e.key === "Escape") setAdding(null);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="cal-side" onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, null)}>
          <div className="kb-head">No due date<span>{undated.length}</span></div>
          <p className="hint-sm">Drag a task onto a day to give it a due date.</p>
          {undated.map((t) => <TaskChip key={t.n.id} t={t} all={all} />)}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Timeline ---------------- */

const DAY_W = 34;

export function TimelineView() {
  const { tasks, all, toggle } = useScope();
  const dated = tasks.filter((t) => t.n.task!.due).sort((a, b) => (a.n.task!.start || a.n.task!.due).localeCompare(b.n.task!.start || b.n.task!.due));
  const today = isoDay(new Date());
  const first = dated.reduce((m, t) => (t.n.task!.start || t.n.task!.due) < m ? t.n.task!.start || t.n.task!.due : m, addDays(today, -3));
  const last = dated.reduce((m, t) => (t.n.task!.due > m ? t.n.task!.due : m), addDays(today, 21));
  const from = addDays(first, -2);
  const span = Math.round((parseDay(last).getTime() - parseDay(from).getTime()) / 86400e3) + 8;
  const dayIdx = (s: string) => Math.round((parseDay(s).getTime() - parseDay(from).getTime()) / 86400e3);
  const drag = useRef<{ id: string; b: string; mode: "move" | "end"; x: number; start: string; due: string } | null>(null);

  const onDown = (e: React.PointerEvent, t: TaskRef, mode: "move" | "end") => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: t.n.id, b: t.b.id, mode, x: e.clientX, start: t.n.task!.start || t.n.task!.due, due: t.n.task!.due };
    useStore.getState().beginGesture();
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const shift = Math.round((e.clientX - d.x) / DAY_W);
    if (d.mode === "move") patchTask(d.b, d.id, { start: addDays(d.start, shift), due: addDays(d.due, shift) });
    else {
      const due = addDays(d.due, shift);
      if (due >= d.start) patchTask(d.b, d.id, { due, start: d.start });
    }
  };
  const onUp = () => {
    if (drag.current) useStore.getState().endGesture();
    drag.current = null;
  };

  return (
    <div className="tview">
      <div className="tv-bar">{toggle}<span className="tv-count">Drag a bar to move it, drag its right end to change the due date</span></div>
      {dated.length === 0 ? (
        <div className="tv-empty">Give tasks a due date (and optionally a start date) to see them here.</div>
      ) : (
        <div className="tl-wrap" onPointerMove={onMove} onPointerUp={onUp}>
          <div className="tl" style={{ width: 240 + span * DAY_W }}>
            <div className="tl-head">
              <div className="tl-namecol" />
              {Array.from({ length: span }, (_, i) => {
                const day = addDays(from, i);
                const d = parseDay(day);
                return (
                  <div key={day} className={"tl-day" + (day === today ? " today" : "") + (d.getDay() === 0 || d.getDay() === 6 ? " wknd" : "")} style={{ width: DAY_W }}>
                    {d.getDate() === 1 || i === 0 ? <b>{d.toLocaleDateString(undefined, { month: "short" })}</b> : null}
                    <span>{d.getDate()}</span>
                  </div>
                );
              })}
            </div>
            <div className="tl-today" style={{ left: 240 + dayIdx(today) * DAY_W + DAY_W / 2 }} />
            {dated.map((t) => {
              const task = t.n.task!;
              const s = dayIdx(task.start || task.due), e = dayIdx(task.due);
              return (
                <div key={t.n.id} className="tl-row">
                  <button className="tl-namecol" onClick={() => useStore.getState().openTask(t.b.id, t.n.id)} title="Open task">
                    <i style={{ background: statusMeta(t.b, task.status).color }} />
                    <span>{t.n.title || "Task"}</span>
                    {all && <small>{t.b.name}</small>}
                  </button>
                  <div className="tl-track">
                    <div
                      className={"tl-bar" + (isDoneStatus(t.b, task.status) ? " done" : "")}
                      style={{ left: s * DAY_W + 3, width: Math.max(1, e - s + 1) * DAY_W - 6, background: statusMeta(t.b, task.status).color }}
                      onDoubleClick={() => useStore.getState().openTask(t.b.id, t.n.id)}
                      onPointerDown={(ev) => onDown(ev, t, "move")}
                    >
                      <span>{task.progress ? `${task.progress}%` : ""}</span>
                      <i className="tl-grip" onPointerDown={(ev) => onDown(ev, t, "end")} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
