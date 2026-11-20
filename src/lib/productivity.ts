/**
 * Daily notes, calendar (.ics) export and the focus (Pomodoro) timer.
 */
import { create } from "zustand";
import type { Board, CardNode } from "./types";
import { useStore, defaultNode } from "./store";
import { saveBoard, saveTextFile } from "./storage";
import { isoDay, patchTask } from "./taskops";
import { isDoneStatus, statusMeta } from "./status";
import { desktopNotify } from "./reminders";

/* ---------------- daily note ---------------- */

const JOURNAL = "Journal";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
// Monday 1 Jan 2024: weeks are counted from here so each day has a fixed spot.
const EPOCH = new Date(2024, 0, 1).getTime();

/** Open (or create) today's note on the Journal board: one column per weekday, one row per week. */
export function openDailyNote(day = new Date()) {
  const st = useStore.getState();
  const key = isoDay(day);
  let journal = Object.values(st.boards).find((b) => b.name.trim().toLowerCase() === JOURNAL.toLowerCase() && (b.workspace ?? st.activeWs) === st.activeWs)
    ?? Object.values(st.boards).find((b) => b.name.trim().toLowerCase() === JOURNAL.toLowerCase());
  if (!journal) {
    const id = st.createBoard(JOURNAL);
    journal = useStore.getState().boards[id];
  }
  const existing = journal.nodes.find((n) => n.daily === key);
  if (existing) {
    st.openBoard(journal.id);
    useStore.setState({ focus: existing.id });
    return;
  }

  // Tasks due today (or overdue and not done) across every board.
  const due: { n: CardNode; b: Board }[] = [];
  for (const b of Object.values(useStore.getState().boards))
    for (const n of b.nodes)
      if (n.task?.due && n.task.due <= key && !isDoneStatus(b, n.task.status)) due.push({ n, b });
  due.sort((a, b) => (a.n.task!.due + (a.n.task!.time ?? "")).localeCompare(b.n.task!.due + (b.n.task!.time ?? "")));

  const dueHtml = due.length
    ? `<h3>Due today</h3><ul data-type="taskList">${due.slice(0, 30).map(({ n, b }) => {
        const late = n.task!.due < key ? " (overdue)" : n.task!.time ? ` at ${n.task!.time}` : "";
        return `<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>${esc(n.title || "Untitled task")} <em>· ${esc(b.name)}${late}</em></p></div></li>`;
      }).join("")}</ul>`
    : "";
  const html = `${dueHtml}<h3>Plan</h3><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p></p></div></li></ul><h3>Notes</h3><p></p>`;

  const mid = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const daysSince = Math.round((mid - EPOCH) / 86400e3);
  const weekOf = (iso: string) => Math.floor(Math.round((new Date(`${iso}T00:00`).getTime() - EPOCH) / 86400e3) / 7);
  // Rows count from the journal's first week, so the board starts near the origin.
  const ref = journal.nodes.find((x) => x.daily);
  const firstWeek = ref ? weekOf(ref.daily!) - Math.round(ref.y / 440) : Math.floor(daysSince / 7);
  const week = Math.floor(daysSince / 7) - firstWeek, wd = ((daysSince % 7) + 7) % 7;
  const n = defaultNode("note", 0, 0, Math.max(0, ...journal.nodes.map((x) => x.z)) + 1);
  Object.assign(n, {
    x: wd * 340, y: week * 440, w: 310, h: 400, html, daily: key,
    title: day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    icon: "📅",
  });
  if (journal.id === useStore.getState().activeId) {
    useStore.getState().mutate((d) => void d.nodes.push(n));
  } else {
    const nb: Board = { ...journal, updatedAt: Date.now(), nodes: [...journal.nodes, n] };
    useStore.setState((s) => ({ boards: { ...s.boards, [nb.id]: nb } }));
    saveBoard(nb);
    useStore.getState().openBoard(journal.id);
  }
  useStore.setState({ focus: n.id });
  st.flash(due.length ? `Today's note: ${due.length} task${due.length === 1 ? "" : "s"} due` : "Today's note is ready");
}

/* ---------------- calendar export ---------------- */

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c);
/** Fold long lines at 74 octets-ish, as the spec asks. */
const fold = (line: string) => line.match(/.{1,73}/gu)?.join("\r\n ") ?? line;
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
const local = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;
const ALARM: Record<string, string | null> = { none: null, due: "PT0M", "15m": "-PT15M", "1h": "-PT1H", "1d": "-P1D" };

/** Every open task with a due date (this workspace, or one board) as an .ics calendar file. */
export function tasksToIcs(onlyBoard?: string): { ics: string; count: number } {
  const st = useStore.getState();
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Canvas Notes//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Canvas Notes tasks"];
  let count = 0;
  const now = stamp(new Date());
  for (const b of Object.values(st.boards)) {
    if (onlyBoard ? b.id !== onlyBoard : (b.workspace ?? st.activeWs) !== st.activeWs) continue;
    for (const n of b.nodes) {
      const t = n.task;
      if (!t?.due || isDoneStatus(b, t.status)) continue;
      const [y, m, d] = t.due.split("-").map(Number);
      if (!y || !m || !d) continue;
      count++;
      out.push("BEGIN:VEVENT", `UID:${n.id}@canvas-notes`, `DTSTAMP:${now}`);
      if (t.time) {
        const [hh, mm] = t.time.split(":").map(Number);
        const s = new Date(y, m - 1, d, hh || 0, mm || 0);
        out.push(`DTSTART:${local(s)}`, `DTEND:${local(new Date(s.getTime() + 30 * 60e3))}`);
      } else {
        const next = new Date(y, m - 1, d + 1);
        out.push(`DTSTART;VALUE=DATE:${t.due.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${isoDay(next).replace(/-/g, "")}`);
      }
      const desc = [`Board: ${b.name}`, `Status: ${statusMeta(b, t.status).label}`, `Priority: ${t.priority}`, t.owner && `Owner: ${t.owner}`]
        .filter(Boolean).join("\n");
      out.push(fold(`SUMMARY:${icsText(n.title || "Untitled task")}`), fold(`DESCRIPTION:${icsText(desc)}`));
      const alarm = ALARM[t.remind ?? "due"];
      if (alarm) out.push("BEGIN:VALARM", "ACTION:DISPLAY", fold(`DESCRIPTION:${icsText(n.title || "Task due")}`), `TRIGGER:${alarm}`, "END:VALARM");
      out.push("END:VEVENT");
    }
  }
  out.push("END:VCALENDAR");
  return { ics: out.join("\r\n") + "\r\n", count };
}

export async function exportCalendar(onlyBoard?: string) {
  const { ics, count } = tasksToIcs(onlyBoard);
  const st = useStore.getState();
  if (!count) { st.flash("No open tasks with a due date to export"); return; }
  const name = onlyBoard ? (st.boards[onlyBoard]?.name.replace(/[^\w\- ]+/g, "").trim() || "tasks") : "Canvas Notes tasks";
  if (await saveTextFile(name + ".ics", "ics", "Calendar", ics))
    st.flash(`Exported ${count} task${count === 1 ? "" : "s"}. Open the file to add them to Outlook, Google or Apple Calendar.`);
}

/* ---------------- focus timer ---------------- */

export type FocusPhase = "work" | "break";
interface FocusState {
  boardId: string | null;
  nodeId: string | null;
  title: string;
  phase: FocusPhase;
  /** Planned length of this phase, ms. */
  length: number;
  /** When running: the moment it ends. When paused: null. */
  endsAt: number | null;
  /** Remaining ms while paused. */
  left: number;
  /** When the current stretch of work started (for logging time spent). */
  since: number | null;
  rounds: number;
  workMin: number;
  breakMin: number;
  start(boardId: string, nodeId: string, minutes?: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  addMinutes(m: number): void;
  setLengths(work: number, brk: number): void;
}

const PREFS = "cn.focus";
const prefs = (() => { try { return { workMin: 25, breakMin: 5, ...JSON.parse(localStorage.getItem(PREFS) || "{}") }; } catch { return { workMin: 25, breakMin: 5 }; } })();

/** Add worked time to the task's "time spent". */
function logWork() {
  const f = useFocus.getState();
  if (f.phase !== "work" || !f.since || !f.boardId || !f.nodeId) return;
  const secs = Math.round((Date.now() - f.since) / 1000);
  useFocus.setState({ since: null });
  if (secs < 5) return;
  const n = useStore.getState().boards[f.boardId]?.nodes.find((x) => x.id === f.nodeId);
  if (n?.task) patchTask(f.boardId, f.nodeId, { spent: (n.task.spent ?? 0) + secs });
}

export const useFocus = create<FocusState>((set, get) => ({
  boardId: null, nodeId: null, title: "", phase: "work", length: 0, endsAt: null, left: 0, since: null, rounds: 0,
  workMin: prefs.workMin, breakMin: prefs.breakMin,
  start(boardId, nodeId, minutes) {
    if (get().nodeId) logWork();
    const n = useStore.getState().boards[boardId]?.nodes.find((x) => x.id === nodeId);
    const length = (minutes ?? get().workMin) * 60e3;
    set({ boardId, nodeId, title: n?.title || "Untitled task", phase: "work", length, endsAt: Date.now() + length, left: length, since: Date.now(), rounds: 0 });
  },
  pause() {
    const f = get();
    if (!f.endsAt) return;
    logWork();
    set({ endsAt: null, left: Math.max(0, f.endsAt - Date.now()) });
  },
  resume() {
    const f = get();
    if (f.endsAt || !f.nodeId) return;
    set({ endsAt: Date.now() + f.left, since: f.phase === "work" ? Date.now() : null });
  },
  stop() {
    logWork();
    set({ boardId: null, nodeId: null, endsAt: null, left: 0, since: null });
  },
  addMinutes(m) {
    const f = get();
    if (f.endsAt) set({ endsAt: f.endsAt + m * 60e3, length: f.length + m * 60e3 });
    else set({ left: f.left + m * 60e3, length: f.length + m * 60e3 });
  },
  setLengths(workMin, breakMin) {
    try { localStorage.setItem(PREFS, JSON.stringify({ workMin, breakMin })); } catch { /* ignore */ }
    set({ workMin, breakMin });
  },
}));

/** Called every second by the timer widget: switches between work and break when time is up. */
export function focusTick() {
  const f = useFocus.getState();
  if (!f.endsAt || Date.now() < f.endsAt) return;
  if (f.phase === "work") {
    logWork();
    const length = f.breakMin * 60e3;
    useFocus.setState({ phase: "break", length, endsAt: Date.now() + length, rounds: f.rounds + 1, since: null });
    desktopNotify("Focus session done", `Nice work on "${f.title}". Take a ${f.breakMin} minute break.`, true);
    useStore.getState().flash(`Focus session done. ${f.breakMin} minute break.`);
  } else {
    const length = f.workMin * 60e3;
    useFocus.setState({ phase: "work", length, endsAt: null, left: length, since: null });
    desktopNotify("Break's over", `Ready for another round on "${f.title}"?`, true);
    useStore.getState().flash("Break's over. Press play when you're ready.");
  }
}

export const fmtSpent = (secs: number) => {
  const m = Math.round(secs / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim();
};
