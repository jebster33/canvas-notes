import { create } from "zustand";
import type { Board, CardNode, Edge } from "./types";
import { defaultNode, uid, useStore } from "./store";
import { starterTable } from "./table";
import { readVaultJson, writeVaultJson } from "./storage";
import { DEFAULT_THEME } from "./theme";

/** A saved group of cards (with the lines between them), or a whole board. */
export interface Template {
  id: string;
  name: string;
  kind: "cards" | "board";
  createdAt: number;
  nodes?: CardNode[];
  edges?: Edge[];
  board?: Board;
}

const FILE = "templates.json";

export const useTemplates = create<{ list: Template[]; loaded: boolean; load(): Promise<void>; add(t: Template): void; remove(id: string): void }>((set, get) => ({
  list: [],
  loaded: false,
  async load() {
    if (get().loaded) return;
    const data = await readVaultJson<{ templates: Template[] }>(FILE, { templates: [] });
    set({ list: data.templates ?? [], loaded: true });
  },
  add(t) {
    const list = [...get().list, t];
    set({ list });
    writeVaultJson(FILE, { templates: list });
  },
  remove(id) {
    const list = get().list.filter((t) => t.id !== id);
    set({ list });
    writeVaultJson(FILE, { templates: list });
  },
}));

/** Save the selected cards (and lines among them) as a reusable template. */
export function saveCardsTemplate(name: string, ids: string[]) {
  const b = useStore.getState().board();
  if (!b || !ids.length) return;
  const set = new Set(ids);
  const nodes = structuredClone(b.nodes.filter((n) => set.has(n.id)));
  const edges = structuredClone(b.edges.filter((e) => set.has(e.from) && set.has(e.to)));
  const x0 = Math.min(...nodes.map((n) => n.x)), y0 = Math.min(...nodes.map((n) => n.y));
  for (const n of nodes) { n.x -= x0; n.y -= y0; n.comments = []; }
  useTemplates.getState().add({ id: uid(), name: name.trim() || "Template", kind: "cards", createdAt: Date.now(), nodes, edges });
  useStore.getState().flash(`Saved template "${name.trim() || "Template"}"`);
}

export function saveBoardTemplate(name: string, board: Board) {
  const copy = structuredClone(board);
  for (const n of copy.nodes) n.comments = [];
  useTemplates.getState().add({ id: uid(), name: name.trim() || board.name, kind: "board", createdAt: Date.now(), board: copy });
  useStore.getState().flash(`Saved "${name.trim() || board.name}" as a board template`);
}

/** Drop a card template onto the current board with its top-left at (x, y). */
export function insertCardsTemplate(t: Template, x: number, y: number) {
  if (!t.nodes?.length) return;
  const st = useStore.getState();
  const b = st.board();
  let z = b ? Math.max(0, ...b.nodes.map((n) => n.z)) + 1 : 0;
  const map = new Map<string, string>();
  const nodes = t.nodes.map((n) => {
    const id = uid();
    map.set(n.id, id);
    return { ...structuredClone(n), id, x: n.x + x, y: n.y + y, z: z++ };
  });
  const edges = (t.edges ?? []).filter((e) => map.has(e.from) && map.has(e.to)).map((e) => ({ ...e, id: uid(), from: map.get(e.from)!, to: map.get(e.to)! }));
  st.mutate((d) => {
    d.nodes.push(...nodes);
    d.edges.push(...edges);
  });
  st.setSel({ nodes: nodes.map((n) => n.id) });
}

/* ---------------- built-in board templates ---------------- */

type Built = { nodes: CardNode[]; edges: Edge[] };
const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function builder() {
  let z = 0;
  const nodes: CardNode[] = [];
  const edges: Edge[] = [];
  const add = (type: CardNode["type"], p: Partial<CardNode>) => {
    const n = { ...defaultNode(type, 0, 0, z++), ...p };
    nodes.push(n);
    return n.id;
  };
  const link = (from: string, to: string, label = "") => edges.push({ id: uid(), from, to, label });
  return { nodes, edges, add, link };
}

const checklist = (items: string[]) =>
  `<ul data-type="taskList">${items.map((t) => `<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>${t}</p></div></li>`).join("")}</ul>`;

export const BOARD_TEMPLATES: { id: string; name: string; hint: string; build(): Built }[] = [
  {
    id: "weekly", name: "Weekly planner", hint: "A column for each day plus weekly goals",
    build() {
      const b = builder();
      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      b.add("note", { x: 0, y: -260, w: 560, h: 180, title: "This week's goals", html: checklist(["", "", ""]) });
      days.forEach((d, i) => {
        b.add("frame", { x: i * 280, y: 0, w: 260, h: 460, title: d, frame: { color: ["#8B7CF6", "#6EA8FE", "#5EC2B0", "#A3D977", "#F2C66D", "#F2A65A", "#F28B82"][i] } });
        b.add("sticky", { x: i * 280 + 25, y: 40, w: 210, h: 150, html: "<p></p>" });
      });
      return b;
    },
  },
  {
    id: "roadmap", name: "Project roadmap", hint: "Now, next and later, with tasks",
    build() {
      const b = builder();
      const cols: [string, string][] = [["Now", "#5EC2B0"], ["Next", "#6EA8FE"], ["Later", "#8B7CF6"]];
      cols.forEach(([t, c], i) => {
        b.add("frame", { x: i * 380, y: 0, w: 350, h: 620, title: t, frame: { color: c } });
        for (let k = 0; k < 2; k++) b.add("task", { x: i * 380 + 25, y: 40 + k * 280, w: 300, title: `${t} task ${k + 1}`, task: { status: i === 0 ? "working" : "todo", owner: "", due: day(7 * (i + 1) + k * 3), priority: "medium", progress: 0, remind: "1d" } });
      });
      b.add("note", { x: -360, y: 0, w: 320, h: 220, title: "Goal", html: "<p>What does done look like?</p>" });
      return b;
    },
  },
  {
    id: "study", name: "Study plan", hint: "Topics, a schedule table and exam tasks",
    build() {
      const b = builder();
      const topics = b.add("note", { x: 0, y: 0, w: 300, h: 260, title: "Topics", html: checklist(["Topic 1", "Topic 2", "Topic 3", "Topic 4"]) });
      const sched = b.add("table", { x: 360, y: 0, w: 460, h: 260, title: "Schedule", table: starterTable([["Topic", "Hours", "Score"], ["Topic 1", "3", ""], ["Topic 2", "2", ""], ["Topic 3", "4", ""]], ["text", "number", "number"]) });
      const exam = b.add("task", { x: 360, y: 320, w: 300, title: "Exam", task: { status: "todo", owner: "", due: day(14), priority: "high", progress: 0, remind: "1d" } });
      b.add("sticky", { x: 0, y: 320, w: 220, h: 180, html: "<p>Questions to ask the teacher</p>" });
      b.link(topics, sched);
      b.link(sched, exam);
      return b;
    },
  },
  {
    id: "mood", name: "Mood board", hint: "Images, colors and notes in a frame",
    build() {
      const b = builder();
      b.add("frame", { x: -40, y: -60, w: 1040, h: 660, title: "Mood board", frame: { color: "#F5A3D0" } });
      [[0, 0], [340, 0], [680, 0], [0, 290], [340, 290]].forEach(([x, y]) => b.add("image", { x, y, w: 300, h: 240 }));
      b.add("sticky", { x: 700, y: 290, w: 260, h: 240, html: "<p>Colors, fonts and feelings</p>", style: { bg: "#F5A3D0", textColor: "#2A1020" } });
      return b;
    },
  },
  {
    id: "mindmap", name: "Mind map", hint: "A central idea with branches (Tab adds more)",
    build() {
      const b = builder();
      const root = b.add("note", { x: 0, y: 160, w: 260, h: 120, title: "Central idea", html: "<p>Select a card and press Tab to branch out.</p>" });
      ["Branch 1", "Branch 2", "Branch 3", "Branch 4"].forEach((t, i) => b.link(root, b.add("note", { x: 360, y: i * 150, w: 220, h: 100, title: t, html: "" })));
      return b;
    },
  },
  {
    id: "meeting", name: "Meeting notes", hint: "Agenda, notes and action items",
    build() {
      const b = builder();
      const agenda = b.add("note", { x: 0, y: 0, w: 300, h: 220, title: "Agenda", html: checklist(["Updates", "Decisions", "Next steps"]) });
      const notes = b.add("note", { x: 360, y: 0, w: 360, h: 300, title: "Notes", html: "<p></p>" });
      const act = b.add("task", { x: 360, y: 360, w: 300, title: "Action item", task: { status: "todo", owner: "", due: day(3), priority: "medium", progress: 0, remind: "1d" } });
      b.link(agenda, notes);
      b.link(notes, act);
      return b;
    },
  },
];

/** Create a new board (in the current workspace) from a built-in or saved template. */
export function newBoardFromTemplate(id: string | null, name?: string) {
  const st = useStore.getState();
  if (!id) return st.createBoard(name ?? "Untitled board");
  const saved = useTemplates.getState().list.find((t) => t.id === id);
  if (saved?.board) return st.importBoard({ ...structuredClone(saved.board), name: name ?? saved.name, viewport: { x: 0, y: 0, zoom: 1 } });
  const built = BOARD_TEMPLATES.find((t) => t.id === id);
  const boardId = st.createBoard(name ?? built?.name ?? "Untitled board");
  if (built) {
    const { nodes, edges } = built.build();
    st.mutate((d) => {
      d.nodes = nodes;
      d.edges = edges;
      d.theme = structuredClone(DEFAULT_THEME);
      d.viewport = { x: 0, y: 0, zoom: 1 };
    });
  }
  return boardId;
}
