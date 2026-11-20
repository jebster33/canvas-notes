import { useEffect, useMemo, useRef, useState } from "react";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY, type Simulation, type SimulationNodeDatum, type SimulationLinkDatum } from "d3-force";
import { X, Search } from "lucide-react";
import { useStore } from "../lib/store";
import type { CardType } from "../lib/types";
import { CARD_TYPES } from "../lib/types";
import { TYPE_META } from "../cards/Card";
import { Seg, Toggle } from "./ui";

const TYPE_COLOR: Record<CardType | "board", string> = {
  board: "#E8E8EF", note: "#8B7CF6", task: "#6EA8FE", table: "#5EC2B0", image: "#F28B82", sticky: "#F2C66D", link: "#F5A3D0",
  frame: "#A5A7B4", chart: "#6EA8FE", web: "#5EC2B0", code: "#A3D977", file: "#F2A65A", voice: "#F28B82",
};

interface GNode extends SimulationNodeDatum {
  id: string;
  kind: "board" | "card";
  type: CardType | "board";
  label: string;
  boardId: string;
  boardColor: string;
  deg: number;
  text: string;
}
interface GLink extends SimulationLinkDatum<GNode> {
  kind: "member" | "edge" | "link" | "wiki";
}

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export function GraphView() {
  const allBoards = useStore((s) => s.boards);
  const activeWs = useStore((s) => s.activeWs);
  // The graph shows the current workspace.
  const boards = useMemo(() => Object.fromEntries(Object.entries(allBoards).filter(([, b]) => b.workspace === activeWs)), [allBoards, activeWs]);
  const activeId = useStore((s) => s.activeId);
  const { setGraph, openBoard } = useStore.getState();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [query, setQuery] = useState("");
  const [showBoards, setShowBoards] = useState(true);
  const [colorBy, setColorBy] = useState<"type" | "board">("type");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [tip, setTip] = useState<{ x: number; y: number; n: GNode } | null>(null);
  const state = useRef({ k: 1, tx: 0, ty: 0, hover: null as GNode | null, drag: null as GNode | null });
  const sim = useRef<Simulation<GNode, GLink> | null>(null);

  const graph = useMemo(() => {
    const nodes: GNode[] = [];
    const links: GLink[] = [];
    const byTitle = new Map<string, string>();
    const boardByName = new Map<string, string>();
    for (const b of Object.values(boards)) {
      boardByName.set(b.name.trim().toLowerCase(), "b:" + b.id);
      if (showBoards) nodes.push({ id: "b:" + b.id, kind: "board", type: "board", label: b.name, boardId: b.id, boardColor: b.color, deg: 0, text: "" });
      for (const n of b.nodes) {
        if (hidden.has(n.type)) continue;
        const text = plain(n.html);
        const label = n.title || text.slice(0, 40) || TYPE_META[n.type].label;
        nodes.push({ id: n.id, kind: "card", type: n.type, label, boardId: b.id, boardColor: b.color, deg: 0, text });
        if (n.title) byTitle.set(n.title.trim().toLowerCase(), n.id);
        if (showBoards) links.push({ source: "b:" + b.id, target: n.id, kind: "member" });
      }
    }
    const ids = new Set(nodes.map((n) => n.id));
    for (const b of Object.values(boards)) {
      for (const e of b.edges) if (ids.has(e.from) && ids.has(e.to)) links.push({ source: e.from, target: e.to, kind: "edge" });
      for (const n of b.nodes) {
        if (!ids.has(n.id)) continue;
        if (n.type === "link" && n.link?.boardId && ids.has("b:" + n.link.boardId)) links.push({ source: n.id, target: "b:" + n.link.boardId, kind: "link" });
        for (const m of n.html.matchAll(/\[\[([^\]\n]{1,120})\]\]/g)) {
          const key = m[1].trim().toLowerCase();
          const to = byTitle.get(key) ?? boardByName.get(key);
          if (to && to !== n.id && ids.has(to)) links.push({ source: n.id, target: to, kind: "wiki" });
        }
      }
    }
    const deg = new Map<string, number>();
    for (const l of links) {
      deg.set(l.source as string, (deg.get(l.source as string) ?? 0) + 1);
      deg.set(l.target as string, (deg.get(l.target as string) ?? 0) + 1);
    }
    for (const n of nodes) n.deg = deg.get(n.id) ?? 0;
    return { nodes, links };
  }, [boards, showBoards, hidden]);

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of graph.links) {
      const a = l.source as string, b = l.target as string;
      if (!m.has(a)) m.set(a, new Set());
      if (!m.has(b)) m.set(b, new Set());
      m.get(a)!.add(b);
      m.get(b)!.add(a);
    }
    return m;
  }, [graph]);

  const radius = (n: GNode) => (n.kind === "board" ? 9 + Math.min(10, n.deg * 0.6) : 4 + Math.min(8, n.deg * 1.4));
  const color = (n: GNode) => (n.kind === "board" || colorBy === "board" ? n.boardColor : TYPE_COLOR[n.type]);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const st = state.current;
    let raf = 0;
    const nodes = graph.nodes;
    const q = query.trim().toLowerCase();
    const match = (n: GNode) => !q || n.label.toLowerCase().includes(q) || n.text.toLowerCase().includes(q);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      el.width = el.clientWidth * dpr;
      el.height = el.clientHeight * dpr;
      if (!st.tx && !st.ty) {
        st.tx = el.clientWidth / 2;
        st.ty = el.clientHeight / 2;
      }
    };
    resize();

    const s = forceSimulation<GNode>(nodes)
      .force("link", forceLink<GNode, GLink>(graph.links).id((d) => d.id).distance((l) => (l.kind === "member" ? 70 : 55)).strength((l) => (l.kind === "member" ? 0.25 : 0.7)))
      .force("charge", forceManyBody<GNode>().strength((d) => (d.kind === "board" ? -420 : -110)))
      .force("center", forceCenter(0, 0))
      .force("x", forceX(0).strength(0.03))
      .force("y", forceY(0).strength(0.03))
      .force("collide", forceCollide<GNode>().radius((d) => radius(d) + 4))
      .alphaDecay(0.025);
    // Re-running for a filter change: keep the existing layout instead of exploding it.
    if (nodes.length && nodes[0].x !== undefined) s.alpha(0.08);
    sim.current = s;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, el.clientWidth, el.clientHeight);
      ctx.translate(st.tx, st.ty);
      ctx.scale(st.k, st.k);
      const focus = st.hover;
      const near = focus ? neighbors.get(focus.id) : null;
      const lit = (n: GNode) => (!focus || n === focus || near?.has(n.id)) && match(n);

      for (const l of graph.links) {
        const a = l.source as GNode, b = l.target as GNode;
        const on = focus && (a === focus || b === focus);
        ctx.strokeStyle = on ? "rgba(165,151,255,0.85)" : l.kind === "member" ? "rgba(255,255,255,0.05)" : l.kind === "wiki" ? "rgba(245,163,208,0.35)" : "rgba(255,255,255,0.18)";
        if (focus && !on) ctx.strokeStyle = "rgba(255,255,255,0.03)";
        ctx.lineWidth = (on ? 1.6 : 1) / Math.sqrt(st.k);
        ctx.setLineDash(l.kind === "wiki" ? [4 / st.k, 4 / st.k] : []);
        ctx.beginPath();
        ctx.moveTo(a.x!, a.y!);
        ctx.lineTo(b.x!, b.y!);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const n of nodes) {
        const r = radius(n);
        ctx.globalAlpha = lit(n) ? 1 : 0.15;
        ctx.fillStyle = color(n);
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
        ctx.fill();
        if (n.kind === "board") {
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#0b0b10";
          ctx.stroke();
        }
        if (n === focus || (q && match(n))) {
          ctx.lineWidth = 2 / st.k;
          ctx.strokeStyle = "#fff";
          ctx.stroke();
        }
      }
      // Labels: always for boards, for cards when zoomed in or highlighted.
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const n of nodes) {
        const show = n.kind === "board" || st.k > 1.1 || n === focus || near?.has(n.id) || (q && match(n));
        if (!show || (!lit(n) && !(q && match(n)))) continue;
        const fs = (n.kind === "board" ? 13 : 11) / Math.max(0.7, Math.min(st.k, 1.6));
        ctx.font = `${n.kind === "board" ? 600 : 450} ${fs}px Inter Variable, system-ui, sans-serif`;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = n.kind === "board" ? "#F2F2F7" : "#B8BAC6";
        const label = n.label.length > 32 ? n.label.slice(0, 31) + "…" : n.label;
        ctx.fillText(label, n.x!, n.y! + radius(n) + 4);
      }
      ctx.globalAlpha = 1;
    };
    s.on("tick", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    });
    const redraw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };

    const toGraph = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      return { x: (cx - r.left - st.tx) / st.k, y: (cy - r.top - st.ty) / st.k };
    };
    const pick = (cx: number, cy: number) => {
      const p = toGraph(cx, cy);
      let best: GNode | null = null, bd = Infinity;
      for (const n of nodes) {
        const d = Math.hypot(n.x! - p.x, n.y! - p.y);
        if (d < radius(n) + 6 / st.k && d < bd) { best = n; bd = d; }
      }
      return best;
    };

    let down: { x: number; y: number; tx: number; ty: number; node: GNode | null; moved: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      const node = pick(e.clientX, e.clientY);
      down = { x: e.clientX, y: e.clientY, tx: st.tx, ty: st.ty, node, moved: false };
      if (node) {
        st.drag = node;
        node.fx = node.x; node.fy = node.y;
        s.alphaTarget(0.25).restart();
      }
    };
    const onMove = (e: PointerEvent) => {
      if (down) {
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 3) down.moved = true;
        if (down.node) {
          const p = toGraph(e.clientX, e.clientY);
          down.node.fx = p.x; down.node.fy = p.y;
        } else {
          st.tx = down.tx + e.clientX - down.x;
          st.ty = down.ty + e.clientY - down.y;
          redraw();
        }
        return;
      }
      const h = pick(e.clientX, e.clientY);
      if (h !== st.hover) {
        st.hover = h;
        el.style.cursor = h ? "pointer" : "grab";
        redraw();
      }
      setTip(h ? { x: e.clientX, y: e.clientY, n: h } : null);
    };
    const onUp = () => {
      if (!down) return;
      const { node, moved } = down;
      down = null;
      if (node) {
        node.fx = null; node.fy = null;
        s.alphaTarget(0);
        st.drag = null;
        if (!moved) {
          openBoard(node.boardId);
          if (node.kind === "card") useStore.setState({ focus: node.id });
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const k = Math.min(6, Math.max(0.15, st.k * Math.exp(-e.deltaY * 0.0015)));
      st.tx = px - ((px - st.tx) / st.k) * k;
      st.ty = py - ((py - st.ty) / st.k) * k;
      st.k = k;
      redraw();
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", () => setTip(null));
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", resize);
    return () => {
      s.stop();
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, neighbors, query, colorBy]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && setGraph(false);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [setGraph]);

  const boardList = Object.values(boards).sort((a, b) => a.order - b.order);
  const cardCount = graph.nodes.filter((n) => n.kind === "card").length;

  return (
    <div className="graph">
      <canvas ref={canvas} style={{ cursor: "grab" }} />
      <div className="graph-ui pop" onPointerDown={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <b style={{ flex: 1, fontSize: 13 }}>Graph</b>
          <span style={{ color: "var(--faint)", fontSize: 12 }}>{cardCount} cards, {boardList.length} boards</span>
          <button className="btn icon" title="Close graph (Esc)" onClick={() => setGraph(false)}><X size={15} /></button>
        </div>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 9, top: 8, color: "var(--faint)" }} />
          <input className="field" style={{ paddingLeft: 28 }} placeholder="Highlight cards…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        </div>
        <div className="row" style={{ margin: 0 }}>
          <label style={{ color: "var(--muted)" }}>Color by</label>
          <Seg<"type" | "board"> value={colorBy} onChange={setColorBy} options={[{ v: "type", label: "Card type" }, { v: "board", label: "Board" }]} />
        </div>
        <div className="row" style={{ margin: 0 }}>
          <label style={{ color: "var(--muted)" }}>Show boards</label>
          <Toggle label="Show boards" on={showBoards} onChange={setShowBoards} />
        </div>
        <div className="graph-legend">
          {colorBy === "type"
            ? CARD_TYPES.map((t) => (
                <button key={t} className={hidden.has(t) ? "off" : ""} title="Click to show or hide"
                  onClick={() => setHidden((h) => { const n = new Set(h); n.has(t) ? n.delete(t) : n.add(t); return n; })}>
                  <i style={{ background: TYPE_COLOR[t] }} />{TYPE_META[t].label}
                </button>
              ))
            : boardList.map((b) => (
                <button key={b.id} onClick={() => openBoard(b.id)} style={{ fontWeight: b.id === activeId ? 600 : undefined }}>
                  <i style={{ background: b.color }} />{b.name}
                </button>
              ))}
        </div>
      </div>
      {tip && (
        <div className="graph-tip pop" style={{ left: tip.x, top: tip.y, position: "fixed" }}>
          {tip.n.label}
          <small>{tip.n.kind === "board" ? "Board, click to open" : `${TYPE_META[tip.n.type as CardType].label} in ${boards[tip.n.boardId]?.name ?? ""}`}</small>
        </div>
      )}
    </div>
  );
}
