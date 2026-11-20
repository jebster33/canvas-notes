import { memo, useEffect, useState } from "react";
import type { Board, CardNode, Edge, Side } from "../lib/types";
import { anchor, bestSides, edgePath, type Pt } from "../lib/geometry";
import { useStore } from "../lib/store";

const DIR: Record<Side, Pt> = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

export function edgeGeometry(e: Edge, a: CardNode, b: CardNode, board: Board) {
  const [s1, s2] = e.fromSide && e.toSide ? [e.fromSide, e.toSide] : bestSides(a, b);
  const p1 = anchor(a, s1);
  const p2 = anchor(b, s2);
  const shape = e.shape ?? board.theme.edgeShape;
  const arrow = e.arrow ?? board.theme.edgeArrow;
  const width = e.width ?? board.theme.edgeWidth;
  // Pull the line end back so the arrow tip sits on the card edge.
  const back = arrow ? width * 2.2 + 3 : 0;
  let dir: Pt = { x: -DIR[s2].x, y: -DIR[s2].y };
  if (shape === "straight") {
    const l = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    dir = { x: (p2.x - p1.x) / l, y: (p2.y - p1.y) / l };
  }
  const end = { x: p2.x - dir.x * back, y: p2.y - dir.y * back };
  const { d, mid } = edgePath(p1, s1, end, s2, shape);
  return { d, mid, tip: p2, dir, shape, arrow, width };
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
