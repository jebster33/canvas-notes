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

type Rect = { x: number; y: number; w: number; h: number };

/** Does the axis-aligned segment a→b pass through the rect (shrunk-in by nothing, grown by pad)? */
function segHitsRect(a: Pt, b: Pt, r: Rect, pad = 10) {
  const x0 = r.x - pad, y0 = r.y - pad, x1 = r.x + r.w + pad, y1 = r.y + r.h + pad;
  if (a.y === b.y) return a.y > y0 && a.y < y1 && Math.max(a.x, b.x) > x0 && Math.min(a.x, b.x) < x1;
  if (a.x === b.x) return a.x > x0 && a.x < x1 && Math.max(a.y, b.y) > y0 && Math.min(a.y, b.y) < y1;
  return false;
}
const polyLen = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + Math.abs(p.x - pts[i - 1].x) + Math.abs(p.y - pts[i - 1].y) : 0), 0);

/**
 * Elbow route that steers around other cards: tries a handful of right-angle
 * routes (middle channel at different spots, or detours above/below or to the
 * sides) and keeps the shortest one that doesn't cross a card.
 */
export function routeElbow(p1: Pt, s1: Side, p2: Pt, s2: Side, ends: Rect[], obstacles: Rect[]): Pt[] {
  const stub = 24;
  const d1 = DIR[s1], d2 = DIR[s2];
  const a = { x: p1.x + d1.x * stub, y: p1.y + d1.y * stub };
  const b = { x: p2.x + d2.x * stub, y: p2.y + d2.y * stub };
  const horizontal = s1 === "left" || s1 === "right";
  const cands: Pt[][] = [];
  const fracs = [0.5, 0.3, 0.7, 0.15, 0.85];
  if (horizontal) for (const f of fracs) { const mx = a.x + (b.x - a.x) * f; cands.push([{ x: mx, y: a.y }, { x: mx, y: b.y }]); }
  else for (const f of fracs) { const my = a.y + (b.y - a.y) * f; cands.push([{ x: a.x, y: my }, { x: b.x, y: my }]); }
  const all = [...ends, ...obstacles];
  if (all.length) {
    const top = Math.min(...all.map((r) => r.y)) - 30, bottom = Math.max(...all.map((r) => r.y + r.h)) + 30;
    const left = Math.min(...all.map((r) => r.x)) - 30, right = Math.max(...all.map((r) => r.x + r.w)) + 30;
    for (const y of [top, bottom]) cands.push([{ x: a.x, y }, { x: b.x, y }]);
    for (const x of [left, right]) cands.push([{ x, y: a.y }, { x, y: b.y }]);
    // Channels just beside each obstacle.
    for (const r of obstacles.slice(0, 12)) {
      if (horizontal) for (const mx of [r.x - 24, r.x + r.w + 24]) cands.push([{ x: mx, y: a.y }, { x: mx, y: b.y }]);
      else for (const my of [r.y - 24, r.y + r.h + 24]) cands.push([{ x: a.x, y: my }, { x: b.x, y: my }]);
    }
  }
  let best: Pt[] = [], bestScore = Infinity;
  for (const mid of cands) {
    const route = [a, ...mid, b];
    let hits = 0;
    for (let i = 0; i + 1 < route.length; i++) {
      for (const r of obstacles) if (segHitsRect(route[i], route[i + 1], r)) hits++;
      // The middle legs must not cut back through the two connected cards either.
      if (i > 0 && i + 2 < route.length) for (const r of ends) if (segHitsRect(route[i], route[i + 1], r, 4)) hits++;
    }
    const score = hits * 1e6 + polyLen(route);
    if (score < bestScore) { bestScore = score; best = route; }
    if (!hits && mid === cands[0]) break; // the plain route is clear: keep it
  }
  // Drop zero-length legs.
  const pts = [p1, ...best, p2].filter((p, i, arr) => i === 0 || p.x !== arr[i - 1].x || p.y !== arr[i - 1].y);
  return pts;
}

/** Path through user-placed bend points. */
export function bentPath(p1: Pt, s1: Side, p2: Pt, s2: Side, bends: Pt[], shape: EdgeShape): { d: string; mid: Pt; last: Pt } {
  if (shape === "elbow") {
    const stub = 24;
    const a = { x: p1.x + DIR[s1].x * stub, y: p1.y + DIR[s1].y * stub };
    const b = { x: p2.x + DIR[s2].x * stub, y: p2.y + DIR[s2].y * stub };
    const pts: Pt[] = [p1, a];
    const via = [...bends, b];
    let horiz = s1 === "left" || s1 === "right";
    for (const q of via) {
      const prev = pts[pts.length - 1];
      pts.push(horiz ? { x: q.x, y: prev.y } : { x: prev.x, y: q.y }, q);
      horiz = !horiz;
    }
    pts.push(p2);
    const d = "M" + pts.map((p) => `${p.x},${p.y}`).join(" L");
    return { d, mid: bends[Math.floor(bends.length / 2)] ?? pts[2], last: b };
  }
  const pts = [p1, ...bends, p2];
  if (shape === "straight") {
    return { d: "M" + pts.map((p) => `${p.x},${p.y}`).join(" L"), mid: bends[Math.floor(bends.length / 2)], last: pts[pts.length - 2] };
  }
  // Smooth curve through every point (Catmull-Rom as cubic Béziers).
  let d = `M${p1.x},${p1.y}`;
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[i - 1] ?? pts[i], pa = pts[i], pb = pts[i + 1], p3 = pts[i + 2] ?? pb;
    const c1 = { x: pa.x + (pb.x - p0.x) / 6, y: pa.y + (pb.y - p0.y) / 6 };
    const c2 = { x: pb.x - (p3.x - pa.x) / 6, y: pb.y - (p3.y - pa.y) / 6 };
    d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${pb.x},${pb.y}`;
  }
  return { d, mid: bends[Math.floor(bends.length / 2)], last: pts[pts.length - 2] };
}

export const polyPath = (pts: Pt[]) => "M" + pts.map((p) => `${p.x},${p.y}`).join(" L");

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
