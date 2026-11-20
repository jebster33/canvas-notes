import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GRID_SIZE, selectBoard, useStore } from "../lib/store";
import type { CardNode, DrawTool, Side, Stroke } from "../lib/types";
import { Card, CanvasCtx, type CanvasApi } from "../cards/Card";
import { CardBoundary } from "../cards/CardBoundary";
import { EdgeLayer, EdgeLabels, EdgeBends } from "./EdgeLayer";
import { StrokeLayer, StrokeShape } from "./StrokeLayer";
import { SelectionBar } from "./SelectionBar";
import { anchor, rectsIntersect, strokeBounds, strokeHit } from "../lib/geometry";
import { fitAll, registerCanvas, centerOn, toWorld, zoomAt } from "../lib/viewport";
import { ingestImage } from "../lib/transfer";
import { saveFileBlob } from "../lib/storage";
import { loadWebCard } from "../cards/ExtraBodies";
import { Minimap, useMinimapPref } from "./Minimap";

const DRAW_TOOLS: DrawTool[] = ["pen", "highlighter", "rect", "ellipse", "arrow", "line"];
const GRID = GRID_SIZE;

/** Attach window-level move/up listeners for the life of one pointer gesture. */
function track(onMove: (e: PointerEvent) => void, onUp?: (e: PointerEvent) => void) {
  const move = (e: PointerEvent) => onMove(e);
  const up = (e: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    onUp?.(e);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

const snapTo = (v: number, on: boolean) => (on ? Math.round(v / GRID) * GRID : v);

export function Canvas() {
  const board = useStore(selectBoard)!;
  const sel = useStore((s) => s.sel);
  const editingId = useStore((s) => s.editingId);
  const tool = useStore((s) => s.tool);
  const focus = useStore((s) => s.focus);
  const pendingBox = useStore((s) => s.quickAdd?.rect);
  const tagFilter = useStore((s) => s.tagFilter);
  const presenting = useStore((s) => s.presenting);
  const renderAll = useStore((s) => s.renderAll);
  const showMap = useMinimapPref();
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Omit<Stroke, "id"> | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [link, setLink] = useState<{ from: CardNode; side: Side; x: number; y: number; target: string | null } | null>(null);
  const [panning, setPanning] = useState(false);
  const space = useRef(false);

  const { viewport: vp, theme } = board;

  // While panning/zooming the world is a GPU layer (smooth); 160 ms after it stops
  // the layer is dropped so the browser redraws text sharp at the new zoom.
  const worldRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = worldRef.current;
    if (!el) return;
    el.classList.add("moving");
    const t = window.setTimeout(() => el.classList.remove("moving"), 160);
    return () => window.clearTimeout(t);
  }, [vp.x, vp.y, vp.zoom]);
  const byId = useMemo(() => new Map(board.nodes.map((n) => [n.id, n])), [board.nodes]);
  const isDraw = (DRAW_TOOLS as string[]).includes(tool);

  useEffect(() => {
    registerCanvas(ref.current);
    return () => registerCanvas(null);
  }, []);

  // A board that has never been positioned gets framed to its content.
  const framed = useRef(new Set<string>());
  useEffect(() => {
    if (framed.current.has(board.id)) return;
    framed.current.add(board.id);
    if (!(board.viewport.x === 0 && board.viewport.y === 0 && board.nodes.length)) return;
    // Wait until the canvas has a real size (it can be 0 while the window is still laying out).
    let tries = 0;
    const attempt = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r && r.width > 100 && r.height > 100) fitAll();
      else if (tries++ < 40) window.setTimeout(attempt, 50);
    };
    window.setTimeout(attempt, 0);
  }, [board.id, board.viewport.x, board.viewport.y, board.nodes.length]);

  // Jump to a card requested by search, graph or a wiki link.
  useEffect(() => {
    if (!focus) return;
    const n = byId.get(focus);
    if (!n) return;
    useStore.setState({ focus: null, sel: { nodes: [n.id], edges: [], strokes: [] } });
    centerOn(n.x + n.w / 2, n.y + n.h / 2, Math.max(vp.zoom, 0.9));
  }, [focus, byId, vp.zoom]);

  // Space bar = temporary hand tool.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping()) return;
      space.current = true;
      ref.current?.classList.add("tool-hand");
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      space.current = false;
      ref.current?.classList.remove("tool-hand");
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Wheel: zoom or pan depending on the board setting; Ctrl always zooms.
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      const t = e.target as HTMLElement;
      const body = t.closest?.(".card-body, .sp-body, .menu, .pop") as HTMLElement | null;
      if (body && !e.ctrlKey && body.scrollHeight > body.clientHeight + 1 && t.closest(".card.sel, .card.editing, .pop")) return;
      e.preventDefault();
      const st = useStore.getState();
      const b = st.board();
      if (!b) return;
      const v = b.viewport;
      const zoomMode = e.ctrlKey || (b.theme.wheel === "zoom" && !e.shiftKey);
      if (zoomMode) {
        const factor = Math.exp(-e.deltaY * (e.ctrlKey && Math.abs(e.deltaY) < 50 ? 0.01 : 0.0018));
        zoomAt(e.clientX, e.clientY, v.zoom * factor);
      } else {
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        st.setViewport({ ...v, x: v.x - dx, y: v.y - dy });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const startPan = (e: React.PointerEvent) => {
    const st = useStore.getState();
    const v0 = st.board()!.viewport;
    const sx = e.clientX, sy = e.clientY;
    setPanning(true);
    track(
      (m) => st.setViewport({ ...v0, x: v0.x + m.clientX - sx, y: v0.y + m.clientY - sy }),
      () => setPanning(false),
    );
  };

  const api: CanvasApi = useMemo(
    () => ({
      startDrag(e, node) {
        const st = useStore.getState();
        if (e.button === 1 || space.current) return startPan(e);
        let ids = st.sel.nodes;
        if (e.shiftKey) {
          ids = ids.includes(node.id) ? ids.filter((i) => i !== node.id) : [...ids, node.id];
          st.setSel({ nodes: ids, strokes: st.sel.strokes });
          if (!ids.includes(node.id)) return;
        } else if (!ids.includes(node.id)) {
          ids = [node.id];
          st.setSel({ nodes: ids });
        }
        if (st.editingId && st.editingId !== node.id) st.setEditing(null);
        const b = st.board()!;
        // Frames carry everything fully inside them (cards and drawings).
        const frames = b.nodes.filter((n) => n.type === "frame" && ids.includes(n.id));
        const inside = (r: { x: number; y: number; w: number; h: number }) =>
          frames.some((f) => r.x >= f.x && r.y >= f.y && r.x + r.w <= f.x + f.w && r.y + r.h <= f.y + f.h);
        const carried = frames.length ? b.nodes.filter((n) => !ids.includes(n.id) && inside(n)).map((n) => n.id) : [];
        const carriedStrokes = frames.length ? b.strokes.filter((s) => inside(strokeBounds(s.pts))).map((s) => s.id) : [];
        const moveIds = [...ids, ...carried];
        st.bringToFront(ids.filter((id) => !frames.some((f) => f.id === id)));
        const zoom = b.viewport.zoom;
        const snap = b.theme.snap;
        const sx = e.clientX, sy = e.clientY;
        let applied = { x: 0, y: 0 };
        let moved = false;
        track(
          (m) => {
            const dx = (m.clientX - sx) / zoom, dy = (m.clientY - sy) / zoom;
            if (!moved) {
              if (Math.hypot(m.clientX - sx, m.clientY - sy) < 3) return;
              moved = true;
              st.beginGesture();
            }
            const want = { x: snapTo(node.x + dx, snap) - node.x, y: snapTo(node.y + dy, snap) - node.y };
            const ddx = want.x - applied.x, ddy = want.y - applied.y;
            st.moveNodes(moveIds, ddx, ddy);
            if (carriedStrokes.length && (ddx || ddy)) {
              st.mutate((d) => {
                for (const s of d.strokes) if (carriedStrokes.includes(s.id)) s.pts = s.pts.map((v, i) => v + (i % 2 ? ddy : ddx));
              }, false);
            }
            applied = want;
          },
          () => moved && st.endGesture(),
        );
      },

      startResize(e, node, dir) {
        const st = useStore.getState();
        const b = st.board()!;
        const zoom = b.viewport.zoom;
        const snap = b.theme.snap;
        const sx = e.clientX, sy = e.clientY;
        st.setSel({ nodes: [node.id] });
        st.beginGesture();
        const ratio = node.h / node.w;
        const minW = 140, minH = node.type === "sticky" ? 100 : 60;
        const N = dir.includes("n"), S = dir.includes("s"), E = dir.includes("e"), W = dir.includes("w");
        track(
          (m) => {
            const dx = (m.clientX - sx) / zoom, dy = (m.clientY - sy) / zoom;
            // Move only the edges being dragged; the opposite edges stay put.
            let l = node.x, r = node.x + node.w, t = node.y, bt = node.y + node.h;
            if (E) r = snapTo(r + dx, snap);
            if (W) l = snapTo(l + dx, snap);
            if (S) bt = snapTo(bt + dy, snap);
            if (N) t = snapTo(t + dy, snap);
            if (r - l < minW) (W ? (l = r - minW) : (r = l + minW));
            if (bt - t < minH) (N ? (t = bt - minH) : (bt = t + minH));
            // Shift on a corner (and images always) keeps the shape's proportions.
            const keep = node.type === "image" || (m.shiftKey && (N || S) && (E || W));
            if (keep) {
              if (E || W) {
                const h = Math.round((r - l) * ratio);
                if (N) t = bt - h; else bt = t + h;
              } else {
                const w = Math.round((bt - t) / ratio);
                if (W) l = r - w; else r = l + w;
              }
            }
            st.patchNode(node.id, { x: l, y: t, w: r - l, h: bt - t }, false);
          },
          () => st.endGesture(),
        );
      },

      startConnect(e, node, side) {
        const p = anchor(node, side);
        setLink({ from: node, side, x: p.x, y: p.y, target: null });
        const sx = e.clientX, sy = e.clientY;
        track(
          (m) => {
            const w = toWorld(m.clientX, m.clientY);
            const el = document.elementFromPoint(m.clientX, m.clientY)?.closest<HTMLElement>("[data-node]");
            const target = el && el.dataset.node !== node.id ? el.dataset.node! : null;
            setLink((l) => (l ? { ...l, x: w.x, y: w.y, target } : l));
          },
          (u) => {
            const el = document.elementFromPoint(u.clientX, u.clientY)?.closest<HTMLElement>("[data-node]");
            const target = el?.dataset.node;
            setLink(null);
            const st = useStore.getState();
            if (target && target !== node.id) {
              st.addEdge(node.id, target);
            } else if (Math.hypot(u.clientX - sx, u.clientY - sy) > 30) {
              // Dropped on empty canvas: pick a card type to create and connect.
              const w = toWorld(u.clientX, u.clientY);
              st.setQuickAdd({ x: w.x, y: w.y, sx: u.clientX, sy: u.clientY, from: { id: node.id, side } });
            }
          },
        );
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onStrokeDown = useCallback((e: React.PointerEvent, id: string) => {
    const st = useStore.getState();
    const ids = st.sel.strokes.includes(id) ? st.sel.strokes : [id];
    const zoom = st.board()!.viewport.zoom;
    const sx = e.clientX, sy = e.clientY;
    let applied = { x: 0, y: 0 };
    let moved = false;
    track(
      (m) => {
        const want = { x: (m.clientX - sx) / zoom, y: (m.clientY - sy) / zoom };
        if (!moved) {
          if (Math.hypot(want.x, want.y) * zoom < 3) return;
          moved = true;
          st.beginGesture();
        }
        const dx = want.x - applied.x, dy = want.y - applied.y;
        applied = want;
        st.mutate((d) => {
          for (const s of d.strokes) if (ids.includes(s.id)) s.pts = s.pts.map((v, i) => v + (i % 2 ? dy : dx));
        }, false);
      },
      () => moved && st.endGesture(),
    );
  }, []);

  /**
   * Box gesture (right-drag, or Shift + left-drag). If the box catches cards or
   * drawings it selects them; if it lands on empty space it offers to create a
   * card that fills the box. A right-click without dragging opens the add menu.
   */
  const startBox = (e: React.PointerEvent) => {
    const st = useStore.getState();
    if (st.editingId) st.setEditing(null);
    const w0 = toWorld(e.clientX, e.clientY);
    const additive = e.shiftKey;
    const base = additive ? st.sel : { nodes: [], edges: [], strokes: [] };
    if (!additive) st.clearSel();
    let moved = false;
    let rect = { x: w0.x, y: w0.y, w: 0, h: 0 };
    let caught = false;
    track(
      (m) => {
        const w = toWorld(m.clientX, m.clientY);
        if (!moved && Math.hypot(m.clientX - e.clientX, m.clientY - e.clientY) < 5) return;
        if (!moved) useStore.setState({ boxing: true });
        moved = true;
        rect = { x: Math.min(w0.x, w.x), y: Math.min(w0.y, w.y), w: Math.abs(w.x - w0.x), h: Math.abs(w.y - w0.y) };
        setMarquee({ x0: w0.x, y0: w0.y, x1: w.x, y1: w.y });
        const b = useStore.getState().board()!;
        // Frames are big; only pick them when the box swallows the whole frame.
        const contains = (n: { x: number; y: number; w: number; h: number }) =>
          n.x >= rect.x && n.y >= rect.y && n.x + n.w <= rect.x + rect.w && n.y + n.h <= rect.y + rect.h;
        const nodes = b.nodes.filter((n) => (n.type === "frame" ? contains(n) : rectsIntersect(rect, n))).map((n) => n.id);
        const strokes = b.strokes.filter((s) => rectsIntersect(rect, strokeBounds(s.pts))).map((s) => s.id);
        caught = nodes.length + strokes.length > 0;
        st.setSel({
          nodes: [...new Set([...base.nodes, ...nodes])],
          strokes: [...new Set([...base.strokes, ...strokes])],
        });
      },
      (u) => {
        setMarquee(null);
        useStore.setState({ boxing: false });
        if (caught) return;
        const zoom = useStore.getState().board()!.viewport.zoom;
        if (!moved) {
          if (e.button === 2) st.setQuickAdd({ x: w0.x, y: w0.y, sx: u.clientX, sy: u.clientY });
          return;
        }
        // Empty area: make a card exactly where the box was drawn (grandMA3 style).
        if (rect.w * zoom > 24 && rect.h * zoom > 18) {
          st.setQuickAdd({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, sx: u.clientX, sy: u.clientY, rect });
        }
      },
    );
  };

  const onPointerDown = (e: React.PointerEvent) => {
    ref.current?.focus({ preventScroll: true });
    const st = useStore.getState();
    if (st.quickAdd) st.setQuickAdd(null);
    if (e.button === 2) return startBox(e);
    if (e.button === 1 || space.current || tool === "hand") return startPan(e);
    const w0 = toWorld(e.clientX, e.clientY);

    if (isDraw) {
      const t = tool as DrawTool;
      const color = st.drawColor, width = st.drawWidth;
      let s: Omit<Stroke, "id"> = { tool: t, pts: [w0.x, w0.y], color, width };
      setDraft(s);
      track(
        (m) => {
          const w = toWorld(m.clientX, m.clientY);
          if (t === "pen" || t === "highlighter") s = { ...s, pts: [...s.pts, w.x, w.y] };
          else {
            let { x, y } = w;
            if (m.shiftKey) {
              // Shift: square / circle, or 45° lines.
              const dx = x - w0.x, dy = y - w0.y;
              if (t === "rect" || t === "ellipse") {
                const d = Math.max(Math.abs(dx), Math.abs(dy));
                x = w0.x + Math.sign(dx || 1) * d; y = w0.y + Math.sign(dy || 1) * d;
              } else {
                const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
                const len = Math.hypot(dx, dy);
                x = w0.x + Math.cos(ang) * len; y = w0.y + Math.sin(ang) * len;
              }
            }
            // Shapes snap their corners to the grid when snapping is on.
            const sn = useStore.getState().board()?.theme.snap ?? false;
            s = { ...s, pts: [snapTo(w0.x, sn), snapTo(w0.y, sn), snapTo(x, sn), snapTo(y, sn)] };
          }
          setDraft(s);
        },
        () => {
          setDraft(null);
          const b = strokeBounds(s.pts);
          if (s.pts.length >= 4 && (b.w > 2 || b.h > 2)) st.addStroke(s);
          else if (s.pts.length === 2 && (t === "pen" || t === "highlighter")) st.addStroke({ ...s, pts: [...s.pts, s.pts[0] + 0.1, s.pts[1] + 0.1] });
        },
      );
      return;
    }

    if (tool === "eraser") {
      st.beginGesture();
      const zoom = st.board()!.viewport.zoom;
      const erase = (cx: number, cy: number) => {
        const w = toWorld(cx, cy);
        const b = useStore.getState().board()!;
        const hit = b.strokes.filter((s) => strokeHit(s.tool, s.pts, w.x, w.y, Math.max(8 / zoom, s.width)));
        if (hit.length) st.mutate((d) => void (d.strokes = d.strokes.filter((s) => !hit.some((h) => h.id === s.id))), false);
      };
      erase(e.clientX, e.clientY);
      track((m) => erase(m.clientX, m.clientY), () => st.endGesture());
      return;
    }

    // Select tool on empty canvas: Shift draws a box, otherwise drag moves the canvas.
    if (e.shiftKey) return startBox(e);
    if (st.editingId) st.setEditing(null);
    const v0 = st.board()!.viewport;
    let moved = false;
    track(
      (m) => {
        if (!moved && Math.hypot(m.clientX - e.clientX, m.clientY - e.clientY) < 4) return;
        if (!moved) setPanning(true);
        moved = true;
        st.setViewport({ ...v0, x: v0.x + m.clientX - e.clientX, y: v0.y + m.clientY - e.clientY });
      },
      () => {
        setPanning(false);
        if (!moved) st.clearSel();
      },
    );
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool !== "select" || e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("world")) return;
    const w = toWorld(e.clientX, e.clientY);
    useStore.getState().setQuickAdd({ x: w.x, y: w.y, sx: e.clientX, sy: e.clientY });
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const st = useStore.getState();
    let { x, y } = toWorld(e.clientX, e.clientY);
    // A dropped link becomes a web preview card.
    const uri = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (!e.dataTransfer.files.length && /^https?:\/\//i.test(uri.trim())) {
      const id = st.addNode("web", x, y);
      loadWebCard(id, uri.trim().split(/\s/)[0]);
      return;
    }
    for (const f of [...e.dataTransfer.files]) {
      try {
        if (f.type.startsWith("image/")) {
          const { asset, w, h } = await ingestImage(f);
          const width = Math.min(420, Math.max(160, w));
          const height = Math.round((width * h) / w);
          st.addNode("image", x, y, { image: { asset, fit: "cover" }, w: width, h: height, x: x - width / 2, y: y - height / 2 });
        } else if (f.size > 200 * 1048576) {
          st.flash(`${f.name} is over 200 MB. Use Choose a file on a File card instead.`);
          continue;
        } else if (f.type.startsWith("audio/")) {
          const saved = await saveFileBlob(f, "voice");
          st.addNode("voice", x, y, { voice: { asset: saved.asset, duration: 0 }, title: f.name.replace(/\.[^.]+$/, "") });
        } else {
          const saved = await saveFileBlob(f, "file");
          st.addNode("file", x, y, { file: { ...saved, mime: f.type }, title: f.name });
        }
      } catch (err) {
        st.flash(`Couldn't add ${f.name}: ${err}`);
      }
      x += 40; y += 40;
    }
  };

  const gridStyle = useMemo(() => {
    let size = GRID * vp.zoom;
    while (size < 12) size *= 2;
    const pos = `${vp.x}px ${vp.y}px`;
    const c = theme.gridColor;
    if (theme.grid === "dots") {
      const r = Math.max(0.8, Math.min(1.6, vp.zoom * 1.3));
      return { backgroundImage: `radial-gradient(circle, ${c} ${r}px, transparent ${r + 0.6}px)`, backgroundSize: `${size}px ${size}px`, backgroundPosition: pos };
    }
    if (theme.grid === "lines") {
      return {
        backgroundImage: `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`,
        backgroundSize: `${size}px ${size}px`,
        backgroundPosition: pos,
      };
    }
    return {};
  }, [vp.x, vp.y, vp.zoom, theme.grid, theme.gridColor]);

  // Only mount cards near the visible area (plus anything selected or being edited),
  // so huge boards stay smooth. A margin keeps cards ready just off screen.
  const [size, setSize] = useState({ w: 1600, h: 1000 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const visibleNodes = useMemo(() => {
    if (board.nodes.length < 150 || renderAll) return board.nodes;
    const m = 400 / vp.zoom;
    const view = { x: -vp.x / vp.zoom - m, y: -vp.y / vp.zoom - m, w: size.w / vp.zoom + m * 2, h: size.h / vp.zoom + m * 2 };
    const keep = new Set([...sel.nodes, editingId ?? ""]);
    return board.nodes.filter((n) => keep.has(n.id) || rectsIntersect(view, n));
  }, [board.nodes, vp.x, vp.y, vp.zoom, size, sel.nodes, editingId, renderAll]);
  const linkFrom = link ? anchor(link.from, link.side) : null;

  return (
    <CanvasCtx.Provider value={api}>
      <div
        ref={ref}
        tabIndex={-1}
        className={[
          "canvas",
          tool === "hand" ? "tool-hand" : "",
          isDraw ? "tool-draw" : "",
          tool === "eraser" ? "tool-eraser" : "",
          panning ? "panning" : "",
        ].join(" ")}
        style={{ background: theme.canvasBg }}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="grid-layer" style={gridStyle} />
        <div
          ref={worldRef}
          className="world"
          style={{
            // Whole-pixel offsets keep text from landing between pixels.
            transform: `translate(${Math.round(vp.x)}px, ${Math.round(vp.y)}px) scale(${vp.zoom})`,
            pointerEvents: isDraw || tool === "eraser" || tool === "hand" ? "none" : undefined,
          }}
        >
          <EdgeLayer board={board} selected={sel.edges} byId={byId} interactive={tool === "select"} />
          {linkFrom && link && (
            <svg className="svg-layer" width="1" height="1" style={{ zIndex: 9999 }}>
              <path
                d={`M${linkFrom.x},${linkFrom.y} L${link.x},${link.y}`}
                stroke="var(--accent)"
                strokeWidth={2 / vp.zoom + 0.5}
                strokeDasharray={`${6 / vp.zoom} ${5 / vp.zoom}`}
                fill="none"
              />
              <circle cx={link.x} cy={link.y} r={5 / vp.zoom} fill="var(--accent)" />
            </svg>
          )}
          {visibleNodes.map((n) => (
            <CardBoundary key={n.id} node={n}>
              <Card
                node={n}
                theme={theme}
                selected={sel.nodes.includes(n.id)}
                editing={editingId === n.id}
                dropTarget={link?.target === n.id}
                tagColors={board.tagColors}
                dimmed={tagFilter.length > 0 && n.type !== "frame" && !(n.tags ?? []).some((t) => tagFilter.includes(t))}
              />
            </CardBoundary>
          ))}
          <EdgeLabels board={board} selected={sel.edges} byId={byId} />
          {tool === "select" && <EdgeBends board={board} selected={sel.edges} byId={byId} />}
          <div style={{ position: "absolute", left: 0, top: 0, zIndex: 100000, pointerEvents: "none" }}>
            <div style={{ pointerEvents: tool === "select" ? "auto" : "none" }}>
              <StrokeLayer strokes={board.strokes} selected={sel.strokes} interactive={tool === "select"} onStrokeDown={onStrokeDown} />
            </div>
            {draft && (
              <svg className="svg-layer" width="1" height="1">
                <StrokeShape s={{ ...draft, id: "draft" }} />
              </svg>
            )}
          </div>
          {pendingBox && !marquee && (
            <div
              className="marquee pending"
              style={{ left: pendingBox.x, top: pendingBox.y, width: pendingBox.w, height: pendingBox.h, borderWidth: 1.5 / vp.zoom, zIndex: 100001 }}
            />
          )}
          {marquee && (
            <div
              className="marquee"
              style={{
                left: Math.min(marquee.x0, marquee.x1),
                top: Math.min(marquee.y0, marquee.y1),
                width: Math.abs(marquee.x1 - marquee.x0),
                height: Math.abs(marquee.y1 - marquee.y0),
                borderWidth: 1 / vp.zoom,
                zIndex: 100001,
              }}
            />
          )}
        </div>
        {presenting === null && <SelectionBar />}
        {presenting === null && showMap && <Minimap board={board} />}
      </div>
    </CanvasCtx.Provider>
  );
}

export function isTyping() {
  const a = document.activeElement as HTMLElement | null;
  if (!a) return false;
  return a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable || !!a.closest(".sheet");
}
