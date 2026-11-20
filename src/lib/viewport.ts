import { useStore } from "./store";
import type { CardNode } from "./types";

let el: HTMLElement | null = null;
export const registerCanvas = (e: HTMLElement | null) => void (el = e);

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

function vp() {
  return useStore.getState().board()?.viewport ?? { x: 0, y: 0, zoom: 1 };
}

export function canvasRect() {
  return el?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

/** Client (mouse) coordinates → world coordinates. */
export function toWorld(clientX: number, clientY: number) {
  const r = canvasRect();
  const v = vp();
  return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
}

/** World → client coordinates. */
export function toClient(x: number, y: number) {
  const r = canvasRect();
  const v = vp();
  return { x: x * v.zoom + v.x + r.left, y: y * v.zoom + v.y + r.top };
}

export function viewCenter() {
  const r = canvasRect();
  return toWorld(r.left + r.width / 2, r.top + r.height / 2);
}

export function zoomAt(clientX: number, clientY: number, next: number) {
  const r = canvasRect();
  const v = vp();
  const z = clampZoom(next);
  const px = clientX - r.left, py = clientY - r.top;
  const wx = (px - v.x) / v.zoom, wy = (py - v.y) / v.zoom;
  useStore.getState().setViewport({ zoom: z, x: px - wx * z, y: py - wy * z });
}

export function zoomBy(factor: number) {
  const r = canvasRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, vp().zoom * factor);
}

export function centerOn(x: number, y: number, zoom = vp().zoom) {
  const r = canvasRect();
  useStore.getState().setViewport({ zoom, x: r.width / 2 - x * zoom, y: r.height / 2 - y * zoom });
}

export function fitTo(nodes: CardNode[], pts: number[] = []) {
  const r = canvasRect();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h);
  }
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
  }
  if (!isFinite(x0)) return centerOn(0, 0, 1);
  const pad = 80;
  const z = clampZoom(Math.min((r.width - pad * 2) / (x1 - x0 || 1), (r.height - pad * 2) / (y1 - y0 || 1), 1.2));
  centerOn((x0 + x1) / 2, (y0 + y1) / 2, z);
}

export function fitAll() {
  const b = useStore.getState().board();
  if (!b) return;
  fitTo(b.nodes, b.strokes.flatMap((s) => s.pts));
}
