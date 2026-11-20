import type { CardNode, EdgeShape, Side } from "./types";

export interface Pt { x: number; y: number }

export function anchor(n: CardNode, side: Side): Pt {
  const h = n.collapsed ? 44 : n.h;
  switch (side) {
    case "top": return { x: n.x + n.w / 2, y: n.y };
    case "bottom": return { x: n.x + n.w / 2, y: n.y + h };
    case "left": return { x: n.x, y: n.y + h / 2 };
    case "right": return { x: n.x + n.w, y: n.y + h / 2 };
  }
}

/** Choose the pair of facing sides that gives the shortest connector. */
export function bestSides(a: CardNode, b: CardNode): [Side, Side] {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = bc.x - ac.x, dy = bc.y - ac.y;
  if (Math.abs(dx) * 0.8 > Math.abs(dy)) return dx > 0 ? ["right", "left"] : ["left", "right"];
  return dy > 0 ? ["bottom", "top"] : ["top", "bottom"];
}

const DIR: Record<Side, Pt> = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

export function edgePath(p1: Pt, s1: Side, p2: Pt, s2: Side, shape: EdgeShape): { d: string; mid: Pt } {
  if (shape === "straight") {
    return { d: `M${p1.x},${p1.y} L${p2.x},${p2.y}`, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
  }
  const d1 = DIR[s1], d2 = DIR[s2];
  if (shape === "curved") {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const k = Math.min(160, Math.max(40, dist * 0.45));
    const c1 = { x: p1.x + d1.x * k, y: p1.y + d1.y * k };
    const c2 = { x: p2.x + d2.x * k, y: p2.y + d2.y * k };
    const mid = {
      x: 0.125 * p1.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p2.x,
      y: 0.125 * p1.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p2.y,
    };
    return { d: `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`, mid };
  }
  // Elbow: leave each side by a stub, then route with right angles through the midpoint.
  const stub = 24;
  const a = { x: p1.x + d1.x * stub, y: p1.y + d1.y * stub };
  const b = { x: p2.x + d2.x * stub, y: p2.y + d2.y * stub };
  const horizontal = s1 === "left" || s1 === "right";
  const pts: Pt[] = [p1, a];
  if (horizontal) {
    const mx = (a.x + b.x) / 2;
    pts.push({ x: mx, y: a.y }, { x: mx, y: b.y });
  } else {
    const my = (a.y + b.y) / 2;
    pts.push({ x: a.x, y: my }, { x: b.x, y: my });
  }
  pts.push(b, p2);
  const d = "M" + pts.map((p) => `${p.x},${p.y}`).join(" L");
  return { d, mid: { x: (pts[2].x + pts[3].x) / 2, y: (pts[2].y + pts[3].y) / 2 } };
}

export function rectsIntersect(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function strokeBounds(pts: number[], pad = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
  }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Hit test for the eraser: is point within `r` of the stroke's outline? */
export function strokeHit(tool: string, pts: number[], x: number, y: number, r: number): boolean {
  if (tool === "rect" || tool === "ellipse") {
    const [x0, y0, x1, y1] = pts;
    const l = Math.min(x0, x1), t = Math.min(y0, y1), rr = Math.max(x0, x1), b = Math.max(y0, y1);
    if (tool === "rect") {
      return (
        distToSeg(x, y, l, t, rr, t) < r || distToSeg(x, y, rr, t, rr, b) < r ||
        distToSeg(x, y, rr, b, l, b) < r || distToSeg(x, y, l, b, l, t) < r
      );
    }
    const cx = (l + rr) / 2, cy = (t + b) / 2, rx = (rr - l) / 2 || 1, ry = (b - t) / 2 || 1;
    const k = Math.hypot((x - cx) / rx, (y - cy) / ry);
    return Math.abs(k - 1) * Math.min(rx, ry) < r;
  }
  for (let i = 0; i + 3 < pts.length; i += 2) if (distToSeg(x, y, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]) < r) return true;
  return pts.length === 2 && Math.hypot(x - pts[0], y - pts[1]) < r;
}
