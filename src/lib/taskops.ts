import type { Board, CardNode, TaskData } from "./types";
import { useStore, defaultNode } from "./store";
import { saveBoard } from "./storage";

/** Change a task on any board (undoable when it's the board on screen). */
export function patchTask(boardId: string, nodeId: string, patch: Partial<TaskData>) {
  const st = useStore.getState();
  if (boardId === st.activeId) {
    st.mutate((d) => {
      const n = d.nodes.find((x) => x.id === nodeId);
      if (n?.task) n.task = { ...n.task, ...patch };
    });
    return;
  }
  const b = st.boards[boardId];
  if (!b) return;
  const nb: Board = { ...b, updatedAt: Date.now(), nodes: b.nodes.map((n) => (n.id === nodeId && n.task ? { ...n, task: { ...n.task, ...patch } } : n)) };
  useStore.setState((s) => ({ boards: { ...s.boards, [boardId]: nb } }));
  saveBoard(nb);
}

/** Add a task card to the active board, placed to the right of everything already there. */
export function createTask(title: string, task: Partial<TaskData> = {}): CardNode | null {
  const st = useStore.getState();
  const b = st.board();
  if (!b) return null;
  const right = b.nodes.length ? Math.max(...b.nodes.map((n) => n.x + n.w)) + 80 : 0;
  const top = b.nodes.length ? Math.min(...b.nodes.map((n) => n.y)) : 0;
  const stacked = b.nodes.filter((n) => n.type === "task" && n.x >= right - 400).length;
  const n = defaultNode("task", 0, 0, Math.max(0, ...b.nodes.map((x) => x.z)) + 1);
  n.x = right; n.y = top + stacked * 230;
  n.title = title;
  n.task = { ...n.task!, ...task };
  st.mutate((d) => void d.nodes.push(n));
  return n;
}

export interface TaskRef { n: CardNode; b: Board }

export function collectTasks(boards: Record<string, Board>, onlyBoard: string | null, workspace?: string): TaskRef[] {
  const out: TaskRef[] = [];
  for (const b of Object.values(boards)) {
    if (onlyBoard && b.id !== onlyBoard) continue;
    if (workspace && b.workspace !== workspace) continue;
    for (const n of b.nodes) if (n.type === "task" && n.task) out.push({ n, b });
  }
  return out;
}

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseDay = (s: string) => new Date(`${s}T00:00`);
export const addDays = (s: string, n: number) => {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};

/** Put a captured note/task into the Inbox board (created on first use), without switching boards. */
export function addToInbox(text: string, kind: "note" | "task", due?: string) {
  const st = useStore.getState();
  let inbox = Object.values(st.boards).find((b) => b.name.trim().toLowerCase() === "inbox");
  if (!inbox) {
    const prev = st.activeId;
    const id = st.createBoard("Inbox");
    inbox = useStore.getState().boards[id];
    if (prev) st.openBoard(prev);
  }
  const lines = text.split("\n");
  const title = lines[0].slice(0, 80);
  const rest = lines.slice(1).join("\n").trim() || (lines[0].length > 80 ? lines[0] : "");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
  const n = defaultNode(kind, 0, 0, Math.max(0, ...inbox.nodes.map((x) => x.z)) + 1);
  // Newest at the top of a single column.
  const col = inbox.nodes.filter((x) => x.x === 0);
  n.x = 0;
  n.y = col.length ? Math.min(...col.map((x) => x.y)) - n.h - 24 : 0;
  n.title = title;
  n.html = rest ? `<p>${esc(rest)}</p>` : "";
  if (kind === "task" && due) n.task = { ...n.task!, due };
  const nb: Board = { ...inbox, updatedAt: Date.now(), nodes: [...inbox.nodes, n] };
  if (inbox.id === useStore.getState().activeId) {
    useStore.getState().mutate((d) => void d.nodes.push(n));
  } else {
    useStore.setState((s) => ({ boards: { ...s.boards, [nb.id]: nb } }));
    saveBoard(nb);
  }
  st.flash(`Saved "${title}" to Inbox`);
}

/** Patch any card on any board (undoable when it's the board on screen). */
export function patchNodeIn(boardId: string, nodeId: string, patch: Partial<CardNode> | ((n: CardNode) => Partial<CardNode>)) {
  const st = useStore.getState();
  const apply = (n: CardNode) => ({ ...n, ...(typeof patch === "function" ? patch(n) : patch) });
  if (boardId === st.activeId) {
    st.mutate((d) => {
      const i = d.nodes.findIndex((x) => x.id === nodeId);
      if (i >= 0) d.nodes[i] = apply(d.nodes[i]);
    });
    return;
  }
  const b = st.boards[boardId];
  if (!b) return;
  const nb: Board = { ...b, updatedAt: Date.now(), nodes: b.nodes.map((n) => (n.id === nodeId ? apply(n) : n)) };
  useStore.setState((s) => ({ boards: { ...s.boards, [boardId]: nb } }));
  saveBoard(nb);
}

export function deleteNodeIn(boardId: string, nodeId: string) {
  const st = useStore.getState();
  const strip = (b: Board): Board => ({
    ...b,
    updatedAt: Date.now(),
    nodes: b.nodes.filter((n) => n.id !== nodeId),
    edges: b.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
  });
  if (boardId === st.activeId) {
    st.mutate((d) => {
      const nb = strip(d);
      d.nodes = nb.nodes;
      d.edges = nb.edges;
    });
    return;
  }
  const b = st.boards[boardId];
  if (!b) return;
  const nb = strip(b);
  useStore.setState((s) => ({ boards: { ...s.boards, [boardId]: nb } }));
  saveBoard(nb);
}
