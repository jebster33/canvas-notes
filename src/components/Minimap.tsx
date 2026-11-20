import { useEffect, useRef } from "react";
import { create } from "zustand";
import type { Board } from "../lib/types";
import { resolveStyle } from "../lib/theme";
import { canvasRect, centerOn } from "../lib/viewport";

const KEY = "cn.minimap";
const usePref = create<{ on: boolean; toggle(): void }>((set) => ({
  on: (() => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } })(),
  toggle: () =>
    set((s) => {
      try { localStorage.setItem(KEY, s.on ? "0" : "1"); } catch { /* private mode */ }
      return { on: !s.on };
    }),
}));
export const useMinimapPref = () => usePref((s) => s.on);
export const toggleMinimap = () => usePref.getState().toggle();

const W = 200, H = 130;

/** Overview of the whole board; click or drag to move the view. */
export function Minimap({ board }: { board: Board }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const geo = useRef({ x0: 0, y0: 0, k: 1 });

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const r = canvasRect();
    const v = board.viewport;
    const view = { x: -v.x / v.zoom, y: -v.y / v.zoom, w: r.width / v.zoom, h: r.height / v.zoom };
    let x0 = view.x, y0 = view.y, x1 = view.x + view.w, y1 = view.y + view.h;
    for (const n of board.nodes) {
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h);
    }
    const pad = 40;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const k = Math.min(W / (x1 - x0), H / (y1 - y0));
    const ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
    geo.current = { x0: x0 - ox / k, y0: y0 - oy / k, k };
    const tx = (x: number) => (x - geo.current.x0) * k;
    const ty = (y: number) => (y - geo.current.y0) * k;

    for (const n of board.nodes) {
      if (n.type === "frame") {
        ctx.strokeStyle = (n.frame?.color ?? "#8B7CF6") + "aa";
        ctx.lineWidth = 1;
        ctx.strokeRect(tx(n.x), ty(n.y), n.w * k, n.h * k);
        continue;
      }
      const s = resolveStyle(board.theme, n);
      ctx.fillStyle = n.type === "sticky" ? s.bg : s.accent;
      ctx.globalAlpha = n.type === "sticky" ? 0.9 : 0.55;
      ctx.fillRect(tx(n.x), ty(n.y), Math.max(2, n.w * k), Math.max(2, n.h * k));
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = "#a597ff";
    ctx.lineWidth = 1.5;
    ctx.fillStyle = "rgba(139,124,246,0.08)";
    ctx.fillRect(tx(view.x), ty(view.y), view.w * k, view.h * k);
    ctx.strokeRect(tx(view.x), ty(view.y), view.w * k, view.h * k);
  }, [board.nodes, board.viewport, board.theme]);

  const jump = (cx: number, cy: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const g = geo.current;
    centerOn(g.x0 + (cx - rect.left) / g.k, g.y0 + (cy - rect.top) / g.k);
  };

  return (
    <canvas
      ref={ref}
      className="minimap"
      style={{ width: W, height: H }}
      title="Click or drag to move around"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        jump(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => e.buttons === 1 && jump(e.clientX, e.clientY)}
      onWheel={(e) => e.stopPropagation()}
    />
  );
}
