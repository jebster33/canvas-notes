import { memo, useEffect, useState } from "react";
import type { Board, CardNode, Edge, Side } from "../lib/types";
import { anchor, bestSides, bentPath, edgePath, polyPath, routeElbow, type Pt } from "../lib/geometry";
import { useStore, GRID_SIZE } from "../lib/store";
import { toWorld } from "../lib/viewport";

const DIR: Record<Side, Pt> = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

export function edgeGeometry(e: Edge, a: CardNode, b: CardNode, board: Board) {
  const bends = e.points?.length ? e.points : null;
  // With bend points, each end faces its nearest bend instead of the other card.
  const sideToward = (n: CardNode, p: Pt): Side => {
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2, dx = p.x - cx, dy = p.y - cy;
    return Math.abs(dx) / n.w > Math.abs(dy) / n.h ? (dx > 0 ? "right" : "left") : (dy > 0 ? "bottom" : "top");
  };
  const [s1, s2]: [Side, Side] = e.fromSide && e.toSide ? [e.fromSide, e.toSide]
    : bends ? [sideToward(a, bends[0]), sideToward(b, bends[bends.length - 1])] : bestSides(a, b);
  const p1 = anchor(a, s1);
  const p2 = anchor(b, s2);
  const shape = e.shape ?? board.theme.edgeShape;
  const arrow = e.arrow ?? board.theme.edgeArrow;
  const width = e.width ?? board.theme.edgeWidth;
  // Pull the line end back so the arrow tip sits on the card edge.
  const back = arrow ? width * 2.2 + 3 : 0;
  let dir: Pt = { x: -DIR[s2].x, y: -DIR[s2].y };
  const unit = (from: Pt, to: Pt) => { const l = Math.hypot(to.x - from.x, to.y - from.y) || 1; return { x: (to.x - from.x) / l, y: (to.y - from.y) / l }; };
  if (shape === "straight") dir = unit(bends ? bends[bends.length - 1] : p1, p2);
  else if (shape === "curved" && bends) dir = unit(bends[bends.length - 1], p2);
  const end = { x: p2.x - dir.x * back, y: p2.y - dir.y * back };
  if (bends) {
    const { d, mid } = bentPath(p1, s1, end, s2, bends, shape);
    return { d, mid, tip: p2, dir, shape, arrow, width, p1, p2 };
  }
  if (shape === "elbow") {
    const pad = 300;
    const x0 = Math.min(a.x, b.x) - pad, y0 = Math.min(a.y, b.y) - pad, x1 = Math.max(a.x + a.w, b.x + b.w) + pad, y1 = Math.max(a.y + a.h, b.y + b.h) + pad;
    const obstacles = board.nodes.filter((n) => n.id !== a.id && n.id !== b.id && n.type !== "frame" && n.x < x1 && n.x + n.w > x0 && n.y < y1 && n.y + n.h > y0);
    const pts = routeElbow(p1, s1, end, s2, [a, b], obstacles);
    const k = Math.floor((pts.length - 1) / 2);
    return { d: polyPath(pts), mid: { x: (pts[k].x + pts[k + 1].x) / 2, y: (pts[k].y + pts[k + 1].y) / 2 }, tip: p2, dir, shape, arrow, width, p1, p2 };
  }
  const { d, mid } = edgePath(p1, s1, end, s2, shape);
  return { d, mid, tip: p2, dir, shape, arrow, width, p1, p2 };
}

/** Drag handles for the selected line: move a bend, drag a "+" to add one, double-click a bend to remove it. */
export function EdgeBends({ board, selected, byId }: { board: Board; selected: string[]; byId: Map<string, CardNode> }) {
  if (selected.length !== 1) return null;
  const e = board.edges.find((x) => x.id === selected[0]);
  const a = e && byId.get(e.from), b = e && byId.get(e.to);
  if (!e || !a || !b) return null;
  const g = edgeGeometry(e, a, b, board);
  const pts = e.points ?? [];
  const chain = [g.p1, ...pts, g.p2];
  const drag = (ev: React.PointerEvent, index: number, insert: boolean) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    ev.preventDefault();
    const st = useStore.getState();
    st.beginGesture();
    let first = true;
    const move = (m: PointerEvent) => {
      const w = toWorld(m.clientX, m.clientY);
      const snap = st.board()?.theme.snap ? (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE : (v: number) => Math.round(v);
      const p = { x: snap(w.x), y: snap(w.y) };
      st.mutate((d) => {
        const x = d.edges.find((q) => q.id === e.id);
        if (!x) return;
        const list = [...(x.points ?? [])];
        if (insert && first) list.splice(index, 0, p); else list[index] = p;
        x.points = list;
      }, false);
      first = false;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      st.endGesture();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const remove = (i: number) => {
    const rest = pts.filter((_, k) => k !== i);
    useStore.getState().patchEdge(e.id, { points: rest.length ? rest : undefined });
  };
  return (
    <>
      {pts.map((p, i) => (
        <div key={"b" + i} className="bend-handle" style={{ left: p.x, top: p.y }} title="Drag to move. Double-click to remove."
          onPointerDown={(ev) => drag(ev, i, false)} onDoubleClick={(ev) => { ev.stopPropagation(); remove(i); }} />
      ))}
      {chain.slice(0, -1).map((p, i) => {
        const q = chain[i + 1];
        return (
          <div key={"m" + i} className="bend-handle add" style={{ left: (p.x + q.x) / 2, top: (p.y + q.y) / 2 }} title="Drag to bend the line"
            onPointerDown={(ev) => drag(ev, i, true)} />
        );
      })}
    </>
  );
}

function arrowHead(tip: Pt, dir: Pt, size: number) {
  const px = -dir.y, py = dir.x;
  const bx = tip.x - dir.x * size * 1.6, by = tip.y - dir.y * size * 1.6;
  return `M${tip.x},${tip.y} L${bx + px * size},${by + py * size} L${bx - px * size},${by - py * size} Z`;
}

interface Props {
  board: Board;
  selected: string[];
  byId: Map<string, CardNode>;
  interactive: boolean;
}

export const EdgeLayer = memo(function EdgeLayer({ board, selected, byId, interactive }: Props) {
  const setSel = useStore((s) => s.setSel);
  const [hover, setHover] = useState<string | null>(null);

  return (
    <svg className="svg-layer" width="1" height="1" style={{ zIndex: 0 }}>
      {board.edges.map((e) => {
        const a = byId.get(e.from), b = byId.get(e.to);
        if (!a || !b) return null;
        const g = edgeGeometry(e, a, b, board);
        const color = e.color ?? board.theme.edgeColor;
        const sel = selected.includes(e.id);
        const stroke = sel ? "var(--accent)" : hover === e.id ? "#9a9db0" : color;
        return (
          <g key={e.id} data-edge-from={e.from} data-edge-to={e.to}>
            <path
              d={g.d}
              className={"edge-path" + (sel ? " sel flow" : "")}
              fill="none"
              stroke={stroke}
              strokeWidth={g.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={e.dashed && !sel ? `${g.width * 3} ${g.width * 3}` : undefined}
            />
            {g.arrow && <path d={arrowHead(g.tip, g.dir, g.width * 2 + 2)} fill={stroke} />}
            {interactive && (
              <path
                d={g.d}
                className="hit"
                stroke="transparent"
                strokeWidth={Math.max(14, g.width + 10)}
                fill="none"
                onPointerEnter={() => setHover(e.id)}
                onPointerLeave={() => setHover(null)}
                onPointerDown={(ev) => {
                  if (ev.button !== 0) return;
                  ev.stopPropagation();
                  setSel({ edges: [e.id] });
                }}
                onDoubleClick={(ev) => {
                  ev.stopPropagation();
                  setSel({ edges: [e.id] });
                  window.dispatchEvent(new CustomEvent("cn:edit-edge-label", { detail: e.id }));
                }}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
});

export function EdgeLabels({ board, selected, byId }: Omit<Props, "interactive">) {
  const [editing, setEditing] = useState<string | null>(null);
  const { patchEdge, setSel } = useStore.getState();

  // Listen for double-click requests from the edge paths and the edge toolbar.
  useEditEdgeLabel(setEditing);

  return (
    <>
      {board.edges.map((e) => {
        if (!e.label && editing !== e.id) return null;
        const a = byId.get(e.from), b = byId.get(e.to);
        if (!a || !b) return null;
        const { mid } = edgeGeometry(e, a, b, board);
        const sel = selected.includes(e.id);
        return (
          <div
            key={e.id}
            className={"edge-label" + (sel ? " sel" : "")}
            style={{ left: mid.x, top: mid.y }}
            onPointerDown={(ev) => {
              ev.stopPropagation();
              setSel({ edges: [e.id] });
            }}
            onDoubleClick={() => setEditing(e.id)}
          >
            {editing === e.id ? (
              <input
                autoFocus
                defaultValue={e.label}
                placeholder="Label"
                onBlur={(ev) => {
                  patchEdge(e.id, { label: ev.target.value.trim() });
                  setEditing(null);
                }}
                onKeyDown={(ev) => {
                  ev.stopPropagation();
                  if (ev.key === "Enter" || ev.key === "Escape") (ev.target as HTMLInputElement).blur();
                }}
              />
            ) : (
              e.label
            )}
          </div>
        );
      })}
    </>
  );
}

function useEditEdgeLabel(cb: (id: string) => void) {
  useEffect(() => {
    const h = (e: Event) => cb((e as CustomEvent<string>).detail);
    window.addEventListener("cn:edit-edge-label", h);
    return () => window.removeEventListener("cn:edit-edge-label", h);
  }, [cb]);
}
