import { useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { selectBoard, useStore } from "../lib/store";
import type { CardNode } from "../lib/types";
import { canvasRect, clampZoom } from "../lib/viewport";

/** Frames in reading order: top-to-bottom rows, left-to-right within a row. */
export function framesInOrder(nodes: CardNode[]) {
  return nodes
    .filter((n) => n.type === "frame")
    .sort((a, b) => (Math.abs(a.y - b.y) > Math.min(a.h, b.h) / 2 ? a.y - b.y : a.x - b.x));
}

/** Animate the viewport; the target is re-read every frame so it tracks a canvas that is still resizing. */
function animateTo(getTarget: () => { x: number; y: number; zoom: number }) {
  const st = useStore.getState();
  const from = st.board()!.viewport;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return st.setViewport(getTarget());
  const t0 = performance.now(), dur = 420;
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / dur), e = ease(t);
    const target = getTarget();
    st.setViewport({
      x: from.x + (target.x - from.x) * e,
      y: from.y + (target.y - from.y) * e,
      zoom: from.zoom + (target.zoom - from.zoom) * e,
    });
    if (t < 1 && useStore.getState().presenting !== null) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function startPresenting() {
  const st = useStore.getState();
  const b = st.board();
  if (!b || !framesInOrder(b.nodes).length) {
    st.flash("Add a Frame (F) around some cards to present them");
    return;
  }
  st.setView("canvas");
  st.setPresenting(0);
}

export function Presenter() {
  const board = useStore(selectBoard)!;
  const index = useStore((s) => s.presenting);
  const setPresenting = useStore((s) => s.setPresenting);
  const frames = useMemo(() => framesInOrder(board.nodes), [board.nodes]);
  const frame = index !== null ? frames[index] : undefined;

  const frameRef = useRef(frame);
  frameRef.current = frame;
  const target = (f: CardNode) => {
    const r = canvasRect();
    const pad = 48;
    const zoom = clampZoom(Math.min((r.width - pad * 2) / f.w, (r.height - pad * 2 - 40) / f.h));
    return { zoom, x: r.width / 2 - (f.x + f.w / 2) * zoom, y: (r.height - 40) / 2 - (f.y + f.h / 2) * zoom };
  };

  // Remember where the view was, and go back there when presenting ends.
  const before = useRef<{ x: number; y: number; zoom: number } | null>(null);
  useEffect(() => {
    const st = useStore.getState();
    if (index !== null && !before.current) before.current = st.board()?.viewport ?? null;
    if (index === null && before.current) {
      const v = before.current;
      before.current = null;
      setTimeout(() => useStore.getState().setViewport(v), 220);
    }
  }, [index]);

  // Glide to each new frame.
  useEffect(() => {
    if (frame) animateTo(() => target(frame));
  }, [frame]);

  // The canvas grows when the sidebar and panels slide away (and on window resizes): re-fit instantly.
  useEffect(() => {
    if (index === null) return;
    const el = document.querySelector(".canvas");
    if (!el) return;
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) { first = false; return; }
      const f = frameRef.current;
      if (f) useStore.getState().setViewport(target(f));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [index === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (index === null) return;
    const go = (d: number) => setPresenting(Math.max(0, Math.min(frames.length - 1, (useStore.getState().presenting ?? 0) + d)));
    const k = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); go(1); }
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); go(-1); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setPresenting(null); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [index, frames.length, setPresenting]);

  if (index === null || !frame) return null;
  return (
    <div className="presenter pop" onPointerDown={(e) => e.stopPropagation()}>
      <button className="btn icon" disabled={index === 0} onClick={() => setPresenting(index - 1)} aria-label="Previous frame"><ChevronLeft size={18} /></button>
      <div className="pres-label">
        <b>{frame.title || "Frame"}</b>
        <small>{index + 1} of {frames.length}</small>
      </div>
      <button className="btn icon" disabled={index === frames.length - 1} onClick={() => setPresenting(index + 1)} aria-label="Next frame"><ChevronRight size={18} /></button>
      <div className="sep" />
      <button className="btn icon" onClick={() => setPresenting(null)} aria-label="Stop presenting" title="Stop presenting (Esc)"><X size={16} /></button>
    </div>
  );
}
