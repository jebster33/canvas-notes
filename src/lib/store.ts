import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  Workspace,
  StatusDef,
  Board, CardNode, CardStyle, CardType, Comment, Edge, Stroke, Theme, Tool, Side,
} from "./types";
import { DEFAULT_THEME, mergeTheme } from "./theme";
import * as storage from "./storage";
import { welcomeBoard } from "./welcome";
import { starterTable } from "./table";

export const uid = () => nanoid(10);
/** Canvas grid spacing in world units (dots / lines and snapping). */
export const GRID_SIZE = 24;

export interface Selection {
  nodes: string[];
  edges: string[];
  strokes: string[];
}
const EMPTY_SEL: Selection = { nodes: [], edges: [], strokes: [] };

type Panel = "settings" | "comments" | "links" | "assistant" | null;

interface HistoryStack {
  past: Board[];
  future: Board[];
}

interface State {
  ready: boolean;
  vault: string;
  boards: Record<string, Board>;
  activeId: string | null;
  sel: Selection;
  editingId: string | null;
  tool: Tool;
  drawColor: string;
  drawWidth: number;
  panel: Panel;
  graphOpen: boolean;
  paletteOpen: boolean;
  toast: string | null;
  /** Where a newly created card should appear (world coords), set by quick-add. */
  quickAdd: {
    x: number; y: number; sx: number; sy: number;
    from?: { id: string; side: Side };
    /** Box drawn with right-drag: the new card fills it. */
    rect?: { x: number; y: number; w: number; h: number };
  } | null;
  /** True while a selection box is being dragged (toolbars wait until it ends). */
  boxing: boolean;
  /** Only cards with one of these tags are shown at full strength. */
  tagFilter: string[];
  /** Index into the board's frames while presenting, or null. */
  presenting: number | null;
  /** How the current board is shown. */
  view: BoardView;
  notifOpen: boolean;
  /** Task shown in the detail overlay. */
  taskDetail: { boardId: string; nodeId: string } | null;
  workspaces: Workspace[];
  activeWs: string;
  /** The start menu (Home) is showing. */
  homeOpen: boolean;
  /** Mount every card, even off screen (used while exporting an image). */
  renderAll: boolean;
  /** Card to center on once its board is showing (set by search / graph). */
  focus: string | null;

  init(): Promise<void>;
  setVault(): Promise<void>;
  board(): Board | null;
  openBoard(id: string): void;
  createBoard(name?: string): string;
  renameBoard(id: string, name: string): void;
  recolorBoard(id: string, color: string): void;
  removeBoard(id: string): void;
  importBoard(b: Board): string;

  mutate(fn: (b: Board) => void, record?: boolean): void;
  beginGesture(): void;
  endGesture(): void;
  undo(): void;
  redo(): void;

  setTool(t: Tool): void;
  setDraw(color?: string, width?: number): void;
  setSel(s: Partial<Selection>): void;
  clearSel(): void;
  setEditing(id: string | null): void;
  setPanel(p: Panel): void;
  setGraph(v: boolean): void;
  setPalette(v: boolean): void;
  setQuickAdd(q: State["quickAdd"]): void;
  setViewport(v: Board["viewport"]): void;
  flash(msg: string): void;

  addNode(type: CardType, x: number, y: number, init?: Partial<CardNode>): string;
  patchNode(id: string, patch: Partial<CardNode>, record?: boolean): void;
  moveNodes(ids: string[], dx: number, dy: number): void;
  styleNodes(ids: string[], style: Partial<CardStyle> | null): void;
  addEdge(from: string, to: string, fromSide?: Side, toSide?: Side): void;
  patchEdge(id: string, patch: Partial<Edge>): void;
  addStroke(s: Omit<Stroke, "id">): void;
  deleteSelection(): void;
  duplicateSelection(): void;
  copySelection(): void;
  paste(x: number, y: number): void;
  bringToFront(ids: string[]): void;
  setTheme(patch: Partial<Theme>): void;
  setTypeStyle(type: CardType, style: Partial<CardStyle> | null): void;
  applyThemeToAll(type?: CardType): void;
  addComment(nodeId: string, text: string): void;
  patchComment(nodeId: string, cid: string, patch: Partial<Comment>): void;
  removeComment(nodeId: string, cid: string): void;
  arrangeTree(rootId: string): void;
  arrange(ids: string[], mode: ArrangeMode): void;
  setTagFilter(tags: string[]): void;
  toggleTag(ids: string[], tag: string, on: boolean): void;
  setTagColor(tag: string, color: string): void;
  renameTag(from: string, to: string): void;
  setPresenting(i: number | null): void;
  setView(v: BoardView): void;
  setNotifOpen(v: boolean): void;
  openTask(boardId: string, nodeId: string): void;
  closeTask(): void;
  setStatuses(list: StatusDef[]): void;
  setHome(open: boolean): void;
  openWorkspace(id: string): void;
  createWorkspace(name: string, color?: string): string;
  renameWorkspace(id: string, name: string): void;
  recolorWorkspace(id: string, color: string): void;
  deleteWorkspace(id: string): void;
  moveBoardToWorkspace(boardId: string, wsId: string): void;
  wsBoards(wsId?: string): Board[];
}

export type BoardView = "canvas" | "kanban" | "calendar" | "timeline";
export type ArrangeMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom" | "hspace" | "vspace" | "grid";

const history = new Map<string, HistoryStack>();
const saveTimers = new Map<string, number>();
let gestureSnap: Board | null = null;
let initOnce: Promise<void> | null = null;
let clipboard: { nodes: CardNode[]; edges: Edge[] } | null = null;

function stackFor(id: string) {
  let h = history.get(id);
  if (!h) history.set(id, (h = { past: [], future: [] }));
  return h;
}

function saveWorkspaces() {
  const { workspaces, activeWs } = useStore.getState();
  storage.saveMeta({ workspaces, active: activeWs }).catch(() => {});
}

function scheduleSave(board: Board) {
  const prev = saveTimers.get(board.id);
  if (prev) clearTimeout(prev);
  saveTimers.set(
    board.id,
    window.setTimeout(() => {
      saveTimers.delete(board.id);
      const latest = useStore.getState().boards[board.id];
      if (latest) storage.saveBoard(latest).catch((e) => useStore.getState().flash("Couldn't save: " + e));
    }, 450),
  );
}

export function flushSaves() {
  for (const [id, t] of saveTimers) {
    clearTimeout(t);
    const b = useStore.getState().boards[id];
    if (b) storage.saveBoard(b);
  }
  saveTimers.clear();
}

function normalize(b: Board): Board {
  return {
    ...b,
    theme: mergeTheme(b.theme),
    nodes: (b.nodes ?? []).map((n, i) => ({ ...n, style: n.style ?? {}, comments: n.comments ?? [], html: n.html ?? "", title: n.title ?? "", z: n.z ?? i })),
    edges: (b.edges ?? []).map((e) => ({ ...e, label: e.label ?? "" })),
    strokes: b.strokes ?? [],
    viewport: b.viewport ?? { x: 0, y: 0, zoom: 1 },
    order: b.order ?? 0,
    color: b.color ?? "#8B7CF6",
  };
}

export function newBoard(name: string, order: number): Board {
  const now = Date.now();
  return {
    id: uid(),
    name,
    color: "#8B7CF6",
    createdAt: now,
    updatedAt: now,
    theme: structuredClone(DEFAULT_THEME),
    nodes: [],
    edges: [],
    strokes: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    order,
  };
}

const SIZES: Record<CardType, [number, number]> = {
  note: [280, 180],
  task: [300, 260],
  table: [420, 220],
  image: [300, 240],
  sticky: [200, 200],
  link: [260, 110],
  frame: [720, 480],
  chart: [420, 300],
  web: [340, 290],
  code: [420, 260],
  file: [300, 120],
  voice: [300, 130],
};

const TITLES: Record<CardType, string> = {
  note: "Untitled note", task: "New task", table: "Table", image: "", sticky: "", link: "Link",
  frame: "Frame", chart: "Chart", web: "", code: "Code", file: "", voice: "Voice note",
};

export function defaultNode(type: CardType, x: number, y: number, z: number): CardNode {
  const [w, h] = SIZES[type];
  const n: CardNode = {
    id: uid(), type, x: x - w / 2, y: y - h / 2, w, h,
    title: TITLES[type],
    html: "", style: {}, comments: [], z,
  };
  if (type === "task") n.task = { status: "todo", owner: "", due: "", priority: "medium", progress: 0, remind: "due" };
  if (type === "frame") n.frame = { color: "#8B7CF6" };
  if (type === "chart") n.chart = { source: "", kind: "bar", labelCol: 0, valueCols: [1] };
  if (type === "web") n.web = { url: "", title: "", description: "", image: "", site: "" };
  if (type === "code") n.code = { lang: "javascript", text: "" };
  if (type === "table")
    // Starter sheet: a header, two empty rows and a self-updating Total row.
    n.table = starterTable([["Item", "Qty", "Price"], ["", "", ""], ["", "", ""]], ["text", "number", "number"]);
  if (type === "image") n.image = { asset: "", fit: "cover" };
  if (type === "link") n.link = { boardId: "" };
  return n;
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  vault: "",
  boards: {},
  activeId: null,
  sel: EMPTY_SEL,
  editingId: null,
  tool: "select",
  drawColor: "#8B7CF6",
  drawWidth: 3,
  panel: null,
  graphOpen: false,
  paletteOpen: false,
  toast: null,
  quickAdd: null,
  boxing: false,
  tagFilter: [],
  presenting: null,
  view: "canvas",
  notifOpen: false,
  taskDetail: null,
  workspaces: [],
  activeWs: "",
  homeOpen: false,
  renderAll: false,
  focus: null,

  async init() {
    // React StrictMode runs effects twice in dev; share one load so we never seed twice.
    initOnce ??= (async () => {
      const [vault, list] = await Promise.all([storage.vaultPath(), storage.listBoards()]);
      const boards: Record<string, Board> = {};
      for (const b of list) boards[b.id] = normalize(b);
      if (!list.length) {
        const w = welcomeBoard();
        boards[w.id] = w;
        await storage.saveBoard(w);
      }
      const meta = await storage.loadMeta();
      let workspaces = meta?.workspaces?.length ? meta.workspaces : [{ id: "personal", name: "Personal", color: "#8B7CF6", order: 0 }];
      const known = new Set(workspaces.map((w) => w.id));
      // Boards from before workspaces (or from a deleted one) join the first workspace.
      for (const b of Object.values(boards)) if (!b.workspace || !known.has(b.workspace)) b.workspace = workspaces[0].id;
      workspaces = [...workspaces].sort((a, b) => a.order - b.order);
      const last = localStorage.getItem("cn.active");
      const sorted = Object.values(boards).sort((a, b) => a.order - b.order);
      const activeId = last && boards[last] ? last : sorted[0].id;
      const activeWs = boards[activeId]?.workspace ?? workspaces[0].id;
      if (!meta) storage.saveMeta({ workspaces, active: activeWs });
      // The start menu greets you on the very first launch only.
      const homeOpen = (() => {
        try {
          if (localStorage.getItem("cn.seenHome")) return false;
          localStorage.setItem("cn.seenHome", "1"); // shown once, however it gets closed
          return true;
        } catch {
          return false;
        }
      })();
      set({ ready: true, vault, boards, activeId, workspaces, activeWs, homeOpen });
    })();
    return initOnce;
  },

  async setVault() {
    const path = await storage.chooseVault();
    if (!path) return;
    flushSaves();
    history.clear();
    set({ ready: false, boards: {}, activeId: null, sel: EMPTY_SEL });
    initOnce = null;
    await get().init();
    get().flash("Opened vault " + path);
  },

  board() {
    const { boards, activeId } = get();
    return activeId ? boards[activeId] ?? null : null;
  },

  openBoard(id) {
    localStorage.setItem("cn.active", id);
    const ws = get().boards[id]?.workspace ?? get().activeWs;
    set({ activeId: id, activeWs: ws, sel: EMPTY_SEL, editingId: null, graphOpen: false, tagFilter: [], presenting: null, homeOpen: false });
  },

  createBoard(name = "Untitled board") {
    const order = Math.max(0, ...Object.values(get().boards).map((b) => b.order + 1));
    const b = { ...newBoard(name, order), workspace: get().activeWs || get().workspaces[0]?.id };
    set((s) => ({ boards: { ...s.boards, [b.id]: b } }));
    storage.saveBoard(b);
    get().openBoard(b.id);
    return b.id;
  },

  renameBoard(id, name) {
    const b = get().boards[id];
    if (!b) return;
    const nb = { ...b, name, updatedAt: Date.now() };
    set((s) => ({ boards: { ...s.boards, [id]: nb } }));
    scheduleSave(nb);
  },

  recolorBoard(id, color) {
    const b = get().boards[id];
    if (!b) return;
    const nb = { ...b, color };
    set((s) => ({ boards: { ...s.boards, [id]: nb } }));
    scheduleSave(nb);
  },

  removeBoard(id) {
    const boards = { ...get().boards };
    delete boards[id];
    storage.deleteBoard(id);
    history.delete(id);
    let activeId = get().activeId;
    if (activeId === id) {
      // Stay in the same workspace when possible.
      const ws = get().activeWs;
      const rest = Object.values(boards).sort((a, b) => a.order - b.order);
      activeId = (rest.find((b) => b.workspace === ws) ?? null)?.id ?? null;
    }
    set({ boards, activeId, sel: EMPTY_SEL });
    if (!activeId) get().createBoard("My first board");
  },

  importBoard(raw) {
    const order = Math.max(0, ...Object.values(get().boards).map((b) => b.order + 1));
    const b = normalize({ ...raw, id: uid(), order, updatedAt: Date.now(), workspace: get().activeWs || get().workspaces[0]?.id });
    set((s) => ({ boards: { ...s.boards, [b.id]: b } }));
    storage.saveBoard(b);
    get().openBoard(b.id);
    return b.id;
  },

  mutate(fn, record = true) {
    const b = get().board();
    if (!b) return;
    const draft = structuredClone(b);
    fn(draft);
    draft.updatedAt = Date.now();
    if (record && !gestureSnap) {
      const h = stackFor(b.id);
      h.past.push(b);
      if (h.past.length > 150) h.past.shift();
      h.future = [];
    }
    set((s) => ({ boards: { ...s.boards, [b.id]: draft } }));
    scheduleSave(draft);
  },

  beginGesture() {
    gestureSnap = get().board();
  },

  endGesture() {
    const snap = gestureSnap;
    gestureSnap = null;
    const cur = get().board();
    if (!snap || !cur || snap === cur) return;
    const h = stackFor(cur.id);
    h.past.push(snap);
    if (h.past.length > 150) h.past.shift();
    h.future = [];
  },

  undo() {
    const cur = get().board();
    if (!cur) return;
    const h = stackFor(cur.id);
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(cur);
    const restored = { ...prev, viewport: cur.viewport };
    set((s) => ({ boards: { ...s.boards, [cur.id]: restored }, sel: EMPTY_SEL, editingId: null }));
    scheduleSave(restored);
  },

  redo() {
    const cur = get().board();
    if (!cur) return;
    const h = stackFor(cur.id);
    const next = h.future.pop();
    if (!next) return;
    h.past.push(cur);
    const restored = { ...next, viewport: cur.viewport };
    set((s) => ({ boards: { ...s.boards, [cur.id]: restored }, sel: EMPTY_SEL, editingId: null }));
    scheduleSave(restored);
  },

  setTool(tool) {
    set({ tool, editingId: null });
  },
  setDraw(color, width) {
    set((s) => ({ drawColor: color ?? s.drawColor, drawWidth: width ?? s.drawWidth }));
  },
  setSel(s) {
    set({ sel: { ...EMPTY_SEL, ...s } });
  },
  clearSel() {
    set({ sel: EMPTY_SEL, editingId: null });
  },
  setEditing(id) {
    set({ editingId: id });
  },
  setPanel(panel) {
    set((s) => ({ panel: s.panel === panel ? null : panel }));
  },
  setGraph(graphOpen) {
    set({ graphOpen });
  },
  setPalette(paletteOpen) {
    set({ paletteOpen });
  },
  setQuickAdd(quickAdd) {
    set({ quickAdd });
  },
  setViewport(viewport) {
    const b = get().board();
    if (!b) return;
    const nb = { ...b, viewport };
    set((s) => ({ boards: { ...s.boards, [b.id]: nb } }));
    scheduleSave(nb);
  },
  flash(toast) {
    set({ toast });
    window.setTimeout(() => get().toast === toast && set({ toast: null }), 2600);
  },

  addNode(type, x, y, init) {
    const b = get().board();
    const z = b ? Math.max(0, ...b.nodes.map((n) => n.z)) + 1 : 0;
    const n = { ...defaultNode(type, x, y, z), ...init };
    if (b?.theme.snap) {
      const g = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;
      n.x = g(n.x); n.y = g(n.y); n.w = Math.max(GRID_SIZE * 4, g(n.w)); n.h = Math.max(GRID_SIZE * 2, g(n.h));
    }
    get().mutate((d) => void d.nodes.push(n));
    set({ sel: { ...EMPTY_SEL, nodes: [n.id] }, editingId: type === "note" || type === "sticky" ? n.id : null });
    return n.id;
  },

  patchNode(id, patch, record = true) {
    get().mutate((d) => {
      const n = d.nodes.find((n) => n.id === id);
      if (n) Object.assign(n, patch);
    }, record);
  },

  moveNodes(ids, dx, dy) {
    const b = get().board();
    if (!b) return;
    const set_ = new Set(ids);
    const nb = {
      ...b,
      updatedAt: Date.now(),
      nodes: b.nodes.map((n) => (set_.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
      // Lines whose both cards move keep their bends in place relative to them.
      edges: b.edges.some((e) => e.points?.length && set_.has(e.from) && set_.has(e.to))
        ? b.edges.map((e) => (e.points?.length && set_.has(e.from) && set_.has(e.to) ? { ...e, points: e.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) } : e))
        : b.edges,
    };
    set((s) => ({ boards: { ...s.boards, [b.id]: nb } }));
    scheduleSave(nb);
  },

  styleNodes(ids, style) {
    get().mutate((d) => {
      for (const n of d.nodes) {
        if (!ids.includes(n.id)) continue;
        if (style === null) n.style = {};
        else {
          n.style = { ...n.style, ...style };
          // An override equal to undefined means "back to theme".
          for (const k of Object.keys(n.style) as (keyof CardStyle)[]) if (n.style[k] === undefined) delete n.style[k];
        }
      }
    });
  },

  addEdge(from, to, fromSide, toSide) {
    if (from === to) return;
    const b = get().board();
    if (b?.edges.some((e) => e.from === from && e.to === to)) return;
    get().mutate((d) => void d.edges.push({ id: uid(), from, to, fromSide, toSide, label: "" }));
  },

  patchEdge(id, patch) {
    get().mutate((d) => {
      const e = d.edges.find((e) => e.id === id);
      if (e) Object.assign(e, patch);
    });
  },

  addStroke(s) {
    get().mutate((d) => void d.strokes.push({ ...s, id: uid() }));
  },

  deleteSelection() {
    const { sel } = get();
    if (!sel.nodes.length && !sel.edges.length && !sel.strokes.length) return;
    get().mutate((d) => {
      const nodes = new Set(sel.nodes);
      d.nodes = d.nodes.filter((n) => !nodes.has(n.id));
      d.edges = d.edges.filter((e) => !sel.edges.includes(e.id) && !nodes.has(e.from) && !nodes.has(e.to));
      d.strokes = d.strokes.filter((s) => !sel.strokes.includes(s.id));
    });
    set({ sel: EMPTY_SEL, editingId: null });
  },

  duplicateSelection() {
    get().copySelection();
    const b = get().board();
    if (!clipboard || !b) return;
    const first = clipboard.nodes[0];
    if (first) get().paste(first.x + first.w / 2 + 32, first.y + first.h / 2 + 32);
  },

  copySelection() {
    const b = get().board();
    const { sel } = get();
    if (!b || !sel.nodes.length) return;
    const ids = new Set(sel.nodes);
    clipboard = structuredClone({
      nodes: b.nodes.filter((n) => ids.has(n.id)),
      edges: b.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
    });
  },

  paste(x, y) {
    if (!clipboard?.nodes.length) return;
    const minX = Math.min(...clipboard.nodes.map((n) => n.x));
    const minY = Math.min(...clipboard.nodes.map((n) => n.y));
    const map = new Map<string, string>();
    const b = get().board();
    let z = b ? Math.max(0, ...b.nodes.map((n) => n.z)) + 1 : 0;
    const nodes = clipboard.nodes.map((n) => {
      const id = uid();
      map.set(n.id, id);
      return { ...structuredClone(n), id, x: x - 40 + (n.x - minX), y: y - 40 + (n.y - minY), z: z++ };
    });
    const edges = clipboard.edges.map((e) => ({ ...e, id: uid(), from: map.get(e.from)!, to: map.get(e.to)! }));
    get().mutate((d) => {
      d.nodes.push(...nodes);
      d.edges.push(...edges);
    });
    set({ sel: { ...EMPTY_SEL, nodes: nodes.map((n) => n.id) } });
  },

  bringToFront(ids) {
    const b = get().board();
    if (!b) return;
    const top = Math.max(0, ...b.nodes.map((n) => n.z));
    if (ids.every((id) => b.nodes.find((n) => n.id === id)?.z === top) && ids.length === 1) return;
    let z = top + 1;
    const nb = { ...b, nodes: b.nodes.map((n) => (ids.includes(n.id) ? { ...n, z: z++ } : n)) };
    set((s) => ({ boards: { ...s.boards, [b.id]: nb } }));
    scheduleSave(nb);
  },

  setTheme(patch) {
    get().mutate((d) => {
      d.theme = { ...d.theme, ...patch, card: { ...d.theme.card, ...(patch.card ?? {}) } };
    });
  },

  setTypeStyle(type, style) {
    get().mutate((d) => {
      const types = { ...d.theme.types };
      if (style === null) delete types[type];
      else types[type] = { ...(types[type] ?? {}), ...style };
      d.theme = { ...d.theme, types };
    });
  },

  applyThemeToAll(type) {
    get().mutate((d) => {
      for (const n of d.nodes) if (!type || n.type === type) n.style = {};
    });
  },

  addComment(nodeId, text) {
    get().mutate((d) => {
      const n = d.nodes.find((n) => n.id === nodeId);
      n?.comments.push({ id: uid(), text, at: Date.now(), resolved: false });
    });
  },
  patchComment(nodeId, cid, patch) {
    get().mutate((d) => {
      const c = d.nodes.find((n) => n.id === nodeId)?.comments.find((c) => c.id === cid);
      if (c) Object.assign(c, patch);
    });
  },
  removeComment(nodeId, cid) {
    get().mutate((d) => {
      const n = d.nodes.find((n) => n.id === nodeId);
      if (n) n.comments = n.comments.filter((c) => c.id !== cid);
    });
  },

  arrange(ids, mode) {
    const b = get().board();
    if (!b || ids.length < 2) return;
    const nodes = b.nodes.filter((n) => ids.includes(n.id));
    const x0 = Math.min(...nodes.map((n) => n.x)), y0 = Math.min(...nodes.map((n) => n.y));
    const x1 = Math.max(...nodes.map((n) => n.x + n.w)), y1 = Math.max(...nodes.map((n) => n.y + n.h));
    const pos = new Map<string, { x: number; y: number }>();
    const GAP = 32;
    if (mode === "hspace" || mode === "vspace") {
      const horiz = mode === "hspace";
      const sorted = [...nodes].sort((a, c) => (horiz ? a.x - c.x : a.y - c.y));
      const total = sorted.reduce((sum, n) => sum + (horiz ? n.w : n.h), 0);
      const span = horiz ? x1 - x0 : y1 - y0;
      const gap = Math.max(16, (span - total) / (sorted.length - 1));
      let at = horiz ? x0 : y0;
      for (const n of sorted) {
        pos.set(n.id, horiz ? { x: at, y: n.y } : { x: n.x, y: at });
        at += (horiz ? n.w : n.h) + gap;
      }
    } else if (mode === "grid") {
      // Reading order, then a near-square grid with even gaps.
      const sorted = [...nodes].sort((a, c) => (Math.abs(a.y - c.y) > 40 ? a.y - c.y : a.x - c.x));
      const cols = Math.ceil(Math.sqrt(sorted.length));
      const colW = Math.max(...sorted.map((n) => n.w));
      let y = y0;
      for (let i = 0; i < sorted.length; i += cols) {
        const row = sorted.slice(i, i + cols);
        row.forEach((n, k) => pos.set(n.id, { x: x0 + k * (colW + GAP), y }));
        y += Math.max(...row.map((n) => n.h)) + GAP;
      }
    } else {
      for (const n of nodes) {
        const p = { x: n.x, y: n.y };
        if (mode === "left") p.x = x0;
        if (mode === "right") p.x = x1 - n.w;
        if (mode === "hcenter") p.x = (x0 + x1) / 2 - n.w / 2;
        if (mode === "top") p.y = y0;
        if (mode === "bottom") p.y = y1 - n.h;
        if (mode === "vcenter") p.y = (y0 + y1) / 2 - n.h / 2;
        pos.set(n.id, p);
      }
    }
    get().mutate((d) => {
      for (const n of d.nodes) {
        const p = pos.get(n.id);
        if (p) { n.x = Math.round(p.x); n.y = Math.round(p.y); }
      }
    });
  },

  setTagFilter(tagFilter) {
    set({ tagFilter });
  },

  toggleTag(ids, tag, on) {
    const t = tag.trim();
    if (!t) return;
    get().mutate((d) => {
      for (const n of d.nodes) {
        if (!ids.includes(n.id)) continue;
        const tags = new Set(n.tags ?? []);
        if (on) tags.add(t); else tags.delete(t);
        n.tags = [...tags];
      }
    });
  },

  setTagColor(tag, color) {
    get().mutate((d) => void (d.tagColors = { ...(d.tagColors ?? {}), [tag]: color }));
  },

  renameTag(from, to) {
    const t = to.trim();
    if (!t || t === from) return;
    get().mutate((d) => {
      for (const n of d.nodes) if (n.tags?.includes(from)) n.tags = [...new Set(n.tags.map((x) => (x === from ? t : x)))];
      if (d.tagColors?.[from]) {
        d.tagColors[t] = d.tagColors[from];
        delete d.tagColors[from];
      }
    });
    set((st) => ({ tagFilter: st.tagFilter.map((x) => (x === from ? t : x)) }));
  },

  setPresenting(presenting) {
    set({ presenting, sel: EMPTY_SEL, editingId: null });
  },

  setView(view) {
    set({ view, sel: EMPTY_SEL, editingId: null });
  },

  setNotifOpen(notifOpen) {
    set({ notifOpen });
  },

  openTask(boardId, nodeId) {
    set({ taskDetail: { boardId, nodeId }, notifOpen: false });
  },
  closeTask() {
    set({ taskDetail: null });
  },

  setStatuses(list) {
    get().mutate((d) => void (d.statuses = list));
  },

  setHome(homeOpen) {
    try { localStorage.setItem("cn.seenHome", "1"); } catch { /* private mode */ }
    set({ homeOpen, notifOpen: false, paletteOpen: false });
  },

  wsBoards(wsId) {
    const id = wsId ?? get().activeWs;
    return Object.values(get().boards).filter((b) => b.workspace === id).sort((a, b) => a.order - b.order);
  },

  openWorkspace(id) {
    const boards = get().wsBoards(id);
    set({ activeWs: id });
    saveWorkspaces();
    if (boards.length) {
      // Reopen the board you used last in that workspace.
      const recent = [...boards].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      get().openBoard(recent.id);
    } else {
      get().createBoard("First board");
    }
  },

  createWorkspace(name, color) {
    const ws: Workspace = {
      id: uid(),
      name: name.trim() || "New workspace",
      color: color ?? ["#6EA8FE", "#5EC2B0", "#F2C66D", "#F28B82", "#F5A3D0", "#A3D977"][get().workspaces.length % 6],
      order: Math.max(0, ...get().workspaces.map((w) => w.order + 1)),
    };
    set((s) => ({ workspaces: [...s.workspaces, ws] }));
    get().openWorkspace(ws.id);
    return ws.id;
  },

  renameWorkspace(id, name) {
    if (!name.trim()) return;
    set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name: name.trim() } : w)) }));
    saveWorkspaces();
  },

  recolorWorkspace(id, color) {
    set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, color } : w)) }));
    saveWorkspaces();
  },

  deleteWorkspace(id) {
    const { workspaces } = get();
    if (workspaces.length <= 1) return;
    const rest = workspaces.filter((w) => w.id !== id);
    const target = rest[0].id;
    // Boards are never deleted with a workspace; they move to the first remaining one.
    for (const b of get().wsBoards(id)) get().moveBoardToWorkspace(b.id, target);
    set({ workspaces: rest });
    if (get().activeWs === id) get().openWorkspace(target);
    saveWorkspaces();
  },

  moveBoardToWorkspace(boardId, wsId) {
    const b = get().boards[boardId];
    if (!b || b.workspace === wsId) return;
    const nb = { ...b, workspace: wsId };
    set((s) => ({ boards: { ...s.boards, [boardId]: nb } }));
    storage.saveBoard(nb);
    if (get().activeId === boardId) set({ activeWs: wsId });
  },

  /** Lay out everything reachable from `rootId` as a left-to-right tree. */
  arrangeTree(rootId) {
    const b = get().board();
    if (!b) return;
    const byId = new Map(b.nodes.map((n) => [n.id, n]));
    const kids = new Map<string, string[]>();
    for (const e of b.edges) {
      if (!kids.has(e.from)) kids.set(e.from, []);
      kids.get(e.from)!.push(e.to);
    }
    const seen = new Set<string>([rootId]);
    const GAP_X = 90, GAP_Y = 28;
    const pos = new Map<string, { x: number; y: number }>();
    // Returns subtree height; places children stacked vertically.
    const place = (id: string, x: number, top: number): number => {
      const n = byId.get(id)!;
      const children = (kids.get(id) ?? []).filter((c) => byId.has(c) && !seen.has(c));
      children.forEach((c) => seen.add(c));
      if (!children.length) {
        pos.set(id, { x, y: top });
        return n.h;
      }
      let y = top;
      const childX = x + n.w + GAP_X;
      const spans: [number, number][] = [];
      for (const c of children) {
        const h = place(c, childX, y);
        spans.push([y, h]);
        y += h + GAP_Y;
      }
      const total = y - GAP_Y - top;
      const mid = top + total / 2;
      pos.set(id, { x, y: Math.max(top, mid - n.h / 2) });
      return Math.max(total, n.h);
    };
    const root = byId.get(rootId);
    if (!root) return;
    const height = place(rootId, root.x, 0);
    const rootNew = pos.get(rootId)!;
    const shiftY = root.y - rootNew.y;
    if (pos.size < 2) {
      get().flash("Connect cards out of this one first, then arrange");
      return;
    }
    void height;
    get().mutate((d) => {
      for (const n of d.nodes) {
        const p = pos.get(n.id);
        if (p) {
          n.x = p.x;
          n.y = p.y + shiftY;
        }
      }
    });
  },
}));

export const selectBoard = (s: State) => (s.activeId ? s.boards[s.activeId] ?? null : null);
