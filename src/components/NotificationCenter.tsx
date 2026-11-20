import { useEffect, useRef } from "react";
import { Bell, Check, AlarmClock, ArrowUpRight, Settings2, BellOff } from "lucide-react";
import { useStore } from "../lib/store";
import { describeDue, snooze, upcoming, useReminders } from "../lib/reminders";
import type { Board, CardNode } from "../lib/types";
import { firstDone, statusMeta } from "../lib/status";

function ago(t: number) {
  const d = Date.now() - t;
  if (d < 60e3) return "just now";
  if (d < 3600e3) return `${Math.floor(d / 60e3)} min ago`;
  if (d < 86400e3) return `${Math.floor(d / 3600e3)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function openCard(boardId: string, nodeId: string) {
  const st = useStore.getState();
  st.openBoard(boardId);
  st.setView("canvas");
  useStore.setState({ focus: nodeId });
}

function markDone(boardId: string, nodeId: string) {
  const st = useStore.getState();
  const b = st.boards[boardId];
  const n = b?.nodes.find((x) => x.id === nodeId);
  if (!b || !n?.task) return;
  // Edit the right board even if it isn't the one on screen.
  const nb = { ...b, nodes: b.nodes.map((x) => (x.id === nodeId ? { ...x, task: { ...x.task!, status: firstDone(b), progress: 100 } } : x)), updatedAt: Date.now() };
  useStore.setState((s) => ({ boards: { ...s.boards, [boardId]: nb } }));
  import("../lib/storage").then((m) => m.saveBoard(nb));
}

export function BellButton() {
  const open = useStore((s) => s.notifOpen);
  const setOpen = useStore((s) => s.setNotifOpen);
  const boards = useStore((s) => s.boards);
  useReminders((r) => r.tick);
  const unread = useReminders((r) => r.feed.filter((f) => !f.read).length);
  const u = upcoming(boards);
  const urgent = u.overdue.length + u.today.length;
  return (
    <button className={"btn icon tip bell" + (open ? " on" : "")} data-tip="Due dates and reminders" aria-label="Notifications" onClick={() => setOpen(!open)}>
      <Bell size={16} />
      {(unread > 0 || urgent > 0) && <span className={"bell-dot" + (u.overdue.length ? " hot" : "")}>{unread || urgent}</span>}
    </button>
  );
}

function Row({ n, b, onClose }: { n: CardNode; b: Board; onClose(): void }) {
  const st = statusMeta(b, n.task!.status);
  return (
    <div className="nc-row">
      <i className="nc-status" style={{ background: st.color }} title={st.label} />
      <button className="nc-main" onClick={() => (useStore.getState().openTask(b.id, n.id), onClose())}>
        <b>{n.title || "Task"}</b>
        <small>{describeDue(n)} · {b.name}</small>
      </button>
      <button className="btn icon" title="Snooze 1 hour" onClick={() => snooze(n.id, 3600e3)}><AlarmClock size={14} /></button>
      <button className="btn icon" title="Mark done" onClick={() => markDone(b.id, n.id)}><Check size={14} /></button>
    </div>
  );
}

export function NotificationCenter() {
  const open = useStore((s) => s.notifOpen);
  const setOpen = useStore((s) => s.setNotifOpen);
  const boards = useStore((s) => s.boards);
  const { feed, prefs, markAllRead, clearFeed } = useReminders();
  useReminders((r) => r.tick);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest(".bell")) setOpen(false);
    };
    window.addEventListener("pointerdown", h, true);
    return () => {
      window.removeEventListener("pointerdown", h, true);
      markAllRead();
    };
  }, [open, setOpen, markAllRead]);

  if (!open) return null;
  const u = upcoming(boards);
  const close = () => setOpen(false);
  const empty = !u.overdue.length && !u.today.length && !u.week.length;

  return (
    <div ref={ref} className="pop notif-center" role="dialog" aria-label="Due dates and reminders">
      <div className="nc-head">
        <b>Due dates</b>
        {!prefs.enabled && <span className="nc-off"><BellOff size={12} />Reminders off</span>}
        <button
          className="btn icon"
          title="Reminder settings"
          onClick={() => {
            close();
            window.dispatchEvent(new CustomEvent("cn:settings-tab", { detail: "app" }));
            if (useStore.getState().panel !== "settings") useStore.getState().setPanel("settings");
          }}
        >
          <Settings2 size={15} />
        </button>
      </div>
      <div className="nc-body">
        {empty && <p className="nc-empty">Nothing due in the next 7 days. Give a task a due date and you'll be reminded here and on your desktop.</p>}
        {u.overdue.length > 0 && <div className="nc-sec hot">Overdue</div>}
        {u.overdue.map(({ n, b }) => <Row key={n.id} n={n} b={b} onClose={close} />)}
        {u.today.length > 0 && <div className="nc-sec">Today</div>}
        {u.today.map(({ n, b }) => <Row key={n.id} n={n} b={b} onClose={close} />)}
        {u.week.length > 0 && <div className="nc-sec">Next 7 days</div>}
        {u.week.map(({ n, b }) => <Row key={n.id} n={n} b={b} onClose={close} />)}
        {feed.length > 0 && (
          <>
            <div className="nc-sec nc-sec-row">Recent alerts<button className="link-btn" onClick={clearFeed}>Clear</button></div>
            {feed.slice(0, 12).map((f) => (
              <button key={f.id} className={"nc-alert" + (f.read ? "" : " unread")} onClick={() => (useStore.getState().openTask(f.boardId, f.nodeId), close())}>
                <span><b>{f.title}</b><small>{f.body}</small></span>
                <em>{ago(f.at)}</em>
                <ArrowUpRight size={13} />
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
