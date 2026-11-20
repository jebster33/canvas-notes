import { useEffect, useMemo, useRef, useState } from "react";
import {
  MousePointer2, Hand, Pen, Highlighter, Square, Circle, MoveUpRight, Minus, Eraser, Plus, ZoomIn, ZoomOut, Maximize, Magnet, Map as MapIcon,
} from "lucide-react";
import { useStore } from "../lib/store";
import type { CardType, Tool } from "../lib/types";
import { CARD_TYPES } from "../lib/types";
import { INKS } from "../lib/theme";
import { TYPE_META } from "../cards/Card";
import { fitAll, viewCenter, zoomBy, centerOn, toClient } from "../lib/viewport";
import { Swatches, useKeepOnScreen } from "./ui";
import { toggleMinimap, useMinimapPref } from "./Minimap";

const TOOLS: { t: Tool; icon: typeof Pen; label: string; key: string }[] = [
  { t: "select", icon: MousePointer2, label: "Select", key: "V" },
  { t: "hand", icon: Hand, label: "Pan", key: "H" },
  { t: "pen", icon: Pen, label: "Pen", key: "P" },
  { t: "highlighter", icon: Highlighter, label: "Highlighter", key: "M" },
  { t: "rect", icon: Square, label: "Rectangle", key: "R" },
  { t: "ellipse", icon: Circle, label: "Ellipse", key: "O" },
  { t: "arrow", icon: MoveUpRight, label: "Arrow", key: "A" },
  { t: "line", icon: Minus, label: "Line", key: "L" },
  { t: "eraser", icon: Eraser, label: "Eraser", key: "E" },
];
export const TOOL_KEYS: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [t.key.toLowerCase(), t.t]));

const TYPE_TINT: Record<CardType, string> = {
  note: "#8B7CF6", task: "#6EA8FE", table: "#5EC2B0", image: "#F28B82", sticky: "#F2C66D", link: "#F5A3D0",
  frame: "#A5A7B4", chart: "#6EA8FE", web: "#5EC2B0", code: "#A3D977", file: "#F2A65A", voice: "#F28B82",
};

export function addCardAtCenter(type: CardType) {
  const c = viewCenter();
  const jitter = () => (Math.random() - 0.5) * 60;
  useStore.getState().setTool("select");
  useStore.getState().addNode(type, c.x + jitter(), c.y + jitter());
}

export function Dock() {
  const tool = useStore((s) => s.tool);
  const drawColor = useStore((s) => s.drawColor);
  const drawWidth = useStore((s) => s.drawWidth);
  const { setTool, setDraw } = useStore.getState();
  const [adding, setAdding] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useKeepOnScreen(moreRef, adding);
  const drawing = tool !== "select" && tool !== "hand" && tool !== "eraser";

  return (
    <div className="dock" onPointerDown={(e) => e.stopPropagation()}>
      {drawing && (
        <div className="dock-sub pop">
          <Swatches colors={INKS} value={drawColor} onChange={(c) => c && setDraw(c)} />
          <div className="sep" />
          <div className="widths">
            {[2, 3, 5, 8].map((w) => (
              <button key={w} className={drawWidth === w ? "on" : ""} onClick={() => setDraw(undefined, w)} title={`${w}px`} aria-label={`Thickness ${w}`}>
                <i style={{ height: Math.max(2, w * 0.8) }} />
              </button>
            ))}
          </div>
        </div>
      )}
      {adding && (
        <div ref={moreRef} className="dock-sub pop dock-more" style={{ flexDirection: "column", alignItems: "stretch", padding: 6, gap: 0, width: 250 }}>
          {CARD_TYPES.map((t) => {
            const M = TYPE_META[t];
            return (
              <button key={t} className="qa-item" onClick={() => (addCardAtCenter(t), setAdding(false))}>
                <span className="qa-ic" style={{ background: TYPE_TINT[t] + "22", color: TYPE_TINT[t] }}><M.icon size={16} /></span>
                <span><b>{M.label}</b><small>{M.hint}</small></span>
                <kbd className="kbd">{M.key}</kbd>
              </button>
            );
          })}
        </div>
      )}
      {TOOLS.slice(0, 2).map((t) => (
        <button key={t.t} className={"btn icon tip" + (tool === t.t ? " on" : "")} data-tip={`${t.label}  ${t.key}`} aria-label={t.label} onClick={() => setTool(t.t)}>
          <t.icon size={18} />
        </button>
      ))}
      <div className="sep" />
      {(["note", "task", "table", "sticky"] as CardType[]).map((t) => {
        const M = TYPE_META[t];
        return (
          <button key={t} className="btn icon tip add" data-tip={`${M.label}  ${M.key}`} aria-label={`Add ${M.label}`} onClick={() => addCardAtCenter(t)}>
            <M.icon size={18} color={TYPE_TINT[t]} />
          </button>
        );
      })}
      <button className={"btn icon tip" + (adding ? " on" : "")} data-tip="More cards" aria-label="More cards" onClick={() => setAdding((a) => !a)}>
        <Plus size={18} />
      </button>
      <div className="sep" />
      {TOOLS.slice(2).map((t) => (
        <button key={t.t} className={"btn icon tip" + (tool === t.t ? " on" : "")} data-tip={`${t.label}  ${t.key}`} aria-label={t.label} onClick={() => setTool(t.t)}>
          <t.icon size={18} />
        </button>
      ))}
    </div>
  );
}

export function toggleSnap() {
  const st = useStore.getState();
  const on = !st.board()?.theme.snap;
  st.setTheme({ snap: on });
  st.flash(on ? "Snap to grid on" : "Snap to grid off");
}

export function ZoomControls({ zoom }: { zoom: number }) {
  const snap = useStore((s) => (s.activeId ? s.boards[s.activeId]?.theme.snap : false));
  const mapOn = useMinimapPref();
  return (
    <div className="zoom-ctl" onPointerDown={(e) => e.stopPropagation()}>
      <button className={"btn icon" + (snap ? " on" : "")} title={snap ? "Snap to grid is on  G" : "Snap to grid  G"} aria-pressed={!!snap} onClick={toggleSnap}>
        <Magnet size={15} />
      </button>
      <div className="zsep" />
      <button className="btn icon" title="Zoom out" onClick={() => zoomBy(1 / 1.2)}><ZoomOut size={15} /></button>
      <button className="pct" title="Reset to 100%" onClick={() => { const c = viewCenter(); centerOn(c.x, c.y, 1); }}>{Math.round(zoom * 100)}%</button>
      <button className="btn icon" title="Zoom in" onClick={() => zoomBy(1.2)}><ZoomIn size={15} /></button>
      <button className="btn icon" title="Fit everything  Shift 1" onClick={fitAll}><Maximize size={15} /></button>
      <button className={"btn icon" + (mapOn ? " on" : "")} title="Minimap" aria-pressed={mapOn} onClick={toggleMinimap}><MapIcon size={15} /></button>
    </div>
  );
}

/** Menu shown after double-clicking the canvas or dropping a connector on empty space. */
export function QuickAdd() {
  const qa = useStore((s) => s.quickAdd);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const items = useMemo(
    () => CARD_TYPES.filter((t) => !q || TYPE_META[t].label.toLowerCase().includes(q.toLowerCase())),
    [q],
  );
  useEffect(() => {
    setQ("");
    setI(0);
  }, [qa]);
  useEffect(() => {
    if (!qa) return;
    const h = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && useStore.getState().setQuickAdd(null);
    window.addEventListener("pointerdown", h, true);
    return () => window.removeEventListener("pointerdown", h, true);
  }, [qa]);
  useKeepOnScreen(ref, !!qa);
  if (!qa) return null;

  const pick = (t: CardType) => {
    const st = useStore.getState();
    st.setQuickAdd(null);
    const b = st.board();
    let { x, y } = qa;
    if (qa.from && b) {
      // Place the new card so the connector arrives at its near edge.
      const side = qa.from.side;
      const [w, h] = t === "table" ? [420, 220] : t === "sticky" ? [200, 200] : [280, 180];
      if (side === "right") x += w / 2;
      if (side === "left") x -= w / 2;
      if (side === "bottom") y += h / 2;
      if (side === "top") y -= h / 2;
    }
    const r = qa.rect;
    const init = r
      ? { x: r.x, y: r.y, w: Math.max(140, r.w), h: Math.max(t === "sticky" ? 100 : 60, r.h) }
      : undefined;
    const id = st.addNode(t, x, y, init);
    if (qa.from) st.addEdge(qa.from.id, id);
  };

  // A box menu sits beside the box (right side, or left if no room) so the box stays visible.
  let left = qa.sx;
  let top = qa.sy;
  if (qa.rect) {
    const a = toClient(qa.rect.x, qa.rect.y), b = toClient(qa.rect.x + qa.rect.w, qa.rect.y + qa.rect.h);
    left = b.x + 250 < window.innerWidth ? b.x + 10 : Math.max(8, a.x - 250);
    top = a.y;
  }
  return (
    <div ref={ref} className="pop quick-add" style={{ left, top }}>
      <input
        className="field"
        autoFocus
        placeholder={qa.from ? "Add a connected card…" : qa.rect ? "Make a card in this box…" : "Add a card…"}
        value={q}
        onChange={(e) => (setQ(e.target.value), setI(0))}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "ArrowDown") { setI((i + 1) % Math.max(1, items.length)); e.preventDefault(); }
          if (e.key === "ArrowUp") { setI((i - 1 + items.length) % Math.max(1, items.length)); e.preventDefault(); }
          if (e.key === "Enter" && items[i]) pick(items[i]);
          if (e.key === "Escape") useStore.getState().setQuickAdd(null);
        }}
      />
      {items.map((t, k) => {
        const M = TYPE_META[t];
        return (
          <button key={t} className={"qa-item" + (k === i ? " on" : "")} onMouseEnter={() => setI(k)} onClick={() => pick(t)}>
            <span className="qa-ic" style={{ background: TYPE_TINT[t] + "22", color: TYPE_TINT[t] }}><M.icon size={16} /></span>
            <span><b>{M.label}</b><small>{M.hint}</small></span>
          </button>
        );
      })}
    </div>
  );
}
