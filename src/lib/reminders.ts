/**
 * Due-date reminders. Runs in the main window (which stays alive in the tray),
 * checks every 30 seconds, and fires each reminder once: at the chosen time
 * before the due date, and again when the task becomes overdue.
 */
import { create } from "zustand";
import type { Board, CardNode, Reminder } from "./types";
import { useStore } from "./store";
import { isTauri } from "./storage";
import { isDoneStatus } from "./status";

export interface AppPrefs {
  enabled: boolean;
  /** Used for tasks with a due date but no time. */
  morning: string;
  overdue: boolean;
  desktop: boolean;
}
const PREFS_KEY = "cn.reminderPrefs";
const FIRED_KEY = "cn.fired";
const FEED_KEY = "cn.feed";
const SNOOZE_KEY = "cn.snooze";

const load = <T,>(k: string, d: T): T => {
  try { return { ...d, ...JSON.parse(localStorage.getItem(k) || "null") } as T; } catch { return d; }
};
const loadMap = (k: string): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; }
};
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };

export interface FeedItem {
  id: string;
  nodeId: string;
  boardId: string;
  title: string;
  body: string;
  at: number;
  kind: "soon" | "due" | "overdue";
  read: boolean;
}

interface RemState {
  prefs: AppPrefs;
  feed: FeedItem[];
  tick: number;
  setPrefs(p: Partial<AppPrefs>): void;
  markAllRead(): void;
  clearFeed(): void;
}

export const useReminders = create<RemState>((set, get) => ({
  prefs: load<AppPrefs>(PREFS_KEY, { enabled: true, morning: "09:00", overdue: true, desktop: true }),
  feed: (() => { try { return JSON.parse(localStorage.getItem(FEED_KEY) || "[]"); } catch { return []; } })(),
  tick: 0,
  setPrefs(p) {
    const prefs = { ...get().prefs, ...p };
    save(PREFS_KEY, prefs);
    set({ prefs });
  },
  markAllRead() {
    const feed = get().feed.map((f) => ({ ...f, read: true }));
    save(FEED_KEY, feed);
    set({ feed });
  },
  clearFeed() {
    save(FEED_KEY, []);
    set({ feed: [] });
  },
}));

/** Due moment of a task, or null without a due date. */
export function dueAt(n: CardNode, morning = useReminders.getState().prefs.morning): Date | null {
  const t = n.task;
  if (!t?.due) return null;
  const d = new Date(`${t.due}T${t.time || morning || "09:00"}`);
  return isNaN(d.getTime()) ? null : d;
}

const OFFSET: Record<Reminder, number> = { none: -1, due: 0, "15m": 15 * 60e3, "1h": 3600e3, "1d": 86400e3 };

export function remindAt(n: CardNode): Date | null {
  const due = dueAt(n);
  const off = OFFSET[n.task?.remind ?? "due"];
  if (!due || off < 0) return null;
  return new Date(due.getTime() - off);
}

export const isOpenTask = (n: CardNode, b: Board) => n.type === "task" && !!n.task && !isDoneStatus(b, n.task.status);

export function describeDue(n: CardNode, now = new Date()) {
  const d = dueAt(n);
  if (!d) return "";
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((day - today) / 86400e3);
  const time = n.task?.time ? ` at ${n.task.time}` : "";
  if (diff === 0) return `Due today${time}`;
  if (diff === 1) return `Due tomorrow${time}`;
  if (diff === -1) return `Was due yesterday${time}`;
  if (diff < 0) return `Was due ${-diff} days ago`;
  if (diff < 7) return `Due ${d.toLocaleDateString(undefined, { weekday: "long" })}${time}`;
  return `Due ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}${time}`;
}

export async function desktopNotify(title: string, body: string, force = false) {
  if (!force && !useReminders.getState().prefs.desktop) return;
  try {
    if (isTauri) {
      const n = await import("@tauri-apps/plugin-notification");
      let ok = await n.isPermissionGranted();
      if (!ok) ok = (await n.requestPermission()) === "granted";
      if (ok) n.sendNotification({ title, body });
    } else if ("Notification" in window) {
      if (Notification.permission === "default") await Notification.requestPermission();
      if (Notification.permission === "granted") new Notification(title, { body });
    }
  } catch (e) {
    console.warn("notification failed", e);
  }
}

function push(item: Omit<FeedItem, "id" | "read">) {
  const st = useReminders.getState();
  const feed = [{ ...item, id: `${item.nodeId}-${item.at}`, read: false }, ...st.feed].slice(0, 60);
  save(FEED_KEY, feed);
  useReminders.setState({ feed });
  useStore.getState().flash(`${item.title}: ${item.body}`);
  desktopNotify(item.title, item.body);
}

export function snooze(nodeId: string, ms: number) {
  const s = loadMap(SNOOZE_KEY);
  s[nodeId] = Date.now() + ms;
  save(SNOOZE_KEY, s);
  useReminders.setState((r) => ({ tick: r.tick + 1 }));
}

function check() {
  const { prefs } = useReminders.getState();
  if (!prefs.enabled) return;
  const fired = loadMap(FIRED_KEY);
  const snoozed = loadMap(SNOOZE_KEY);
  const now = Date.now();
  let changed = false;
  const boards: Board[] = Object.values(useStore.getState().boards);
  for (const b of boards) {
    for (const n of b.nodes) {
      if (!isOpenTask(n, b)) continue;
      const due = dueAt(n);
      if (!due) continue;
      const sig = `${n.id}|${n.task!.due}|${n.task!.time ?? ""}|${n.task!.remind ?? "due"}`;
      const title = n.title || "Task";

      // Snoozed: fire again once the snooze ends.
      const until = snoozed[n.id];
      if (until && now >= until) {
        delete snoozed[n.id];
        changed = true;
        push({ nodeId: n.id, boardId: b.id, title, body: `${describeDue(n)} · ${b.name}`, at: now, kind: now > due.getTime() ? "overdue" : "due" });
        continue;
      }
      if (until) continue;

      const rem = remindAt(n);
      // Never replay reminders more than a day old (e.g. after a week away).
      if (rem && now >= rem.getTime() && now - rem.getTime() < 86400e3 && !fired[sig]) {
        fired[sig] = now;
        changed = true;
        push({ nodeId: n.id, boardId: b.id, title, body: `${describeDue(n)} · ${b.name}`, at: now, kind: n.task!.remind === "due" ? "due" : "soon" });
      }
      // Overdue nudge: an hour after an "at due time" reminder, otherwise right after the due time.
      const overSig = `${sig}|over`;
      const grace = (n.task!.remind ?? "due") === "due" ? 3600e3 : 60e3;
      if (prefs.overdue && now > due.getTime() + grace && now - due.getTime() < 3 * 86400e3 && !fired[overSig]) {
        fired[overSig] = now;
        changed = true;
        push({ nodeId: n.id, boardId: b.id, title, body: `Overdue · ${b.name}`, at: now, kind: "overdue" });
      }
    }
  }
  if (changed) {
    // Keep the fired list from growing forever.
    const cutoff = now - 30 * 86400e3;
    for (const [k, t] of Object.entries(fired)) if (t < cutoff) delete fired[k];
    save(FIRED_KEY, fired);
    save(SNOOZE_KEY, snoozed);
  }
  useReminders.setState((r) => ({ tick: r.tick + 1 }));
}

let timer: number | undefined;
export function startReminders() {
  if (timer) return;
  setTimeout(check, 4000);
  timer = window.setInterval(check, 30_000);
}

/** Live groups for the notification panel. */
export function upcoming(boards: Record<string, Board>) {
  const now = new Date();
  const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const week = endToday + 6 * 86400e3;
  const out = { overdue: [] as { n: CardNode; b: Board }[], today: [] as { n: CardNode; b: Board }[], week: [] as { n: CardNode; b: Board }[] };
  for (const b of Object.values(boards)) {
    for (const n of b.nodes) {
      if (!isOpenTask(n, b)) continue;
      const d = dueAt(n)?.getTime();
      if (d === undefined) continue;
      if (d < now.getTime()) out.overdue.push({ n, b });
      else if (d < endToday) out.today.push({ n, b });
      else if (d < week) out.week.push({ n, b });
    }
  }
  const by = (x: { n: CardNode }, y: { n: CardNode }) => (dueAt(x.n)?.getTime() ?? 0) - (dueAt(y.n)?.getTime() ?? 0);
  out.overdue.sort(by); out.today.sort(by); out.week.sort(by);
  return out;
}
