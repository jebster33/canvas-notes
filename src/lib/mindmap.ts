import type { Board } from "./types";
import { useStore } from "./store";

/** Walk incoming lines up to the top of a tree. */
export function rootOf(b: Board, id: string) {
  let cur = id;
  const seen = new Set([id]);
  for (;;) {
    const e = b.edges.find((x) => x.to === cur);
    if (!e || seen.has(e.from)) return cur;
    seen.add(e.from);
    cur = e.from;
  }
}

function addLinked(from: string | null, near: { x: number; y: number }) {
  const st = useStore.getState();
  const id = st.addNode("note", near.x, near.y, { title: "", html: "", w: 220, h: 96 });
  if (from) {
    st.addEdge(from, id);
    const b = useStore.getState().board()!;
    st.arrangeTree(rootOf(b, from));
  }
  st.setSel({ nodes: [id] });
  st.setEditing(id);
  return id;
}

/** Tab: a new idea branching off the selected card. */
export function addChildIdea(parentId: string) {
  const b = useStore.getState().board();
  const p = b?.nodes.find((n) => n.id === parentId);
  if (!p) return;
  addLinked(parentId, { x: p.x + p.w + 200, y: p.y + p.h / 2 });
}

/** Ctrl+Enter: a new idea next to the selected one, under the same parent. */
export function addSiblingIdea(id: string) {
  const b = useStore.getState().board();
  const n = b?.nodes.find((x) => x.id === id);
  if (!b || !n) return;
  const parent = b.edges.find((e) => e.to === id)?.from ?? null;
  addLinked(parent, { x: n.x + n.w / 2, y: n.y + n.h + 80 });
}
