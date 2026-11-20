import { X, ArrowDownLeft, ArrowUpRight, Link2, Spline, LayoutDashboard } from "lucide-react";
import { selectBoard, useStore } from "../lib/store";
import type { Board, CardNode } from "../lib/types";
import { TYPE_META } from "../cards/Card";

interface LinkRow {
  key: string;
  via: "line" | "mention" | "board link";
  boardId: string;
  nodeId?: string;
  title: string;
  where: string;
  type?: CardNode["type"];
}

const norm = (s: string) => s.trim().toLowerCase();
const wikiNames = (html: string) => [...html.matchAll(/\[\[([^\]\n]{1,120})\]\]/g)].map((m) => norm(m[1]));

/** Who links to the selected card (or the board), and what it links to. */
export function computeLinks(boards: Record<string, Board>, board: Board, node: CardNode | null) {
  const incoming: LinkRow[] = [];
  const outgoing: LinkRow[] = [];
  const all = Object.values(boards);
  const label = (n: CardNode) => n.title || TYPE_META[n.type].label;

  if (node) {
    const title = norm(node.title);
    for (const e of board.edges) {
      const other = board.nodes.find((n) => n.id === (e.to === node.id ? e.from : e.to));
      if (!other || (e.to !== node.id && e.from !== node.id)) continue;
      const row: LinkRow = { key: e.id, via: "line", boardId: board.id, nodeId: other.id, title: label(other), where: board.name, type: other.type };
      (e.to === node.id ? incoming : outgoing).push(row);
    }
    if (title) {
      for (const b of all) for (const n of b.nodes) {
        if (n.id !== node.id && wikiNames(n.html).includes(title))
          incoming.push({ key: `m-${n.id}`, via: "mention", boardId: b.id, nodeId: n.id, title: label(n), where: b.name, type: n.type });
      }
    }
    for (const name of new Set(wikiNames(node.html))) {
      const hit = board.nodes.find((n) => norm(n.title) === name) ?? all.flatMap((b) => b.nodes.map((n) => ({ n, b }))).find((x) => norm(x.n.title) === name)?.n;
      const hb = hit ? all.find((b) => b.nodes.includes(hit)) : all.find((b) => norm(b.name) === name);
      if (hit && hb) outgoing.push({ key: `o-${hit.id}`, via: "mention", boardId: hb.id, nodeId: hit.id, title: label(hit), where: hb.name, type: hit.type });
      else if (hb) outgoing.push({ key: `ob-${hb.id}`, via: "mention", boardId: hb.id, title: hb.name, where: "Board" });
    }
    if (node.type === "link" && node.link?.boardId && boards[node.link.boardId]) {
      const t = boards[node.link.boardId];
      outgoing.push({ key: `bl-${t.id}`, via: "board link", boardId: t.id, title: t.name, where: "Board" });
    }
  } else {
    const name = norm(board.name);
    for (const b of all) for (const n of b.nodes) {
      if (b.id === board.id) continue;
      if (n.type === "link" && n.link?.boardId === board.id)
        incoming.push({ key: `l-${n.id}`, via: "board link", boardId: b.id, nodeId: n.id, title: label(n), where: b.name, type: n.type });
      else if (wikiNames(n.html).includes(name))
        incoming.push({ key: `m-${n.id}`, via: "mention", boardId: b.id, nodeId: n.id, title: label(n), where: b.name, type: n.type });
    }
    for (const n of board.nodes) {
      if (n.type === "link" && n.link?.boardId && boards[n.link.boardId])
        outgoing.push({ key: `bl-${n.id}`, via: "board link", boardId: n.link.boardId, title: boards[n.link.boardId].name, where: "Board" });
    }
  }
  return { incoming, outgoing };
}

function Row({ r }: { r: LinkRow }) {
  const Icon = r.type ? TYPE_META[r.type].icon : LayoutDashboard;
  const ViaIcon = r.via === "line" ? Spline : Link2;
  return (
    <button
      className="lk-row"
      onClick={() => {
        const st = useStore.getState();
        if (st.activeId !== r.boardId) st.openBoard(r.boardId);
        if (st.view !== "canvas") st.setView("canvas");
        if (r.nodeId) useStore.setState({ focus: r.nodeId });
      }}
    >
      <Icon size={14} className="lk-ic" />
      <span className="lk-main"><b>{r.title}</b><small>{r.where}</small></span>
      <span className="lk-via" title={r.via === "line" ? "Connected with a line" : r.via === "mention" ? "Mentioned with [[…]]" : "Board link card"}><ViaIcon size={12} />{r.via}</span>
    </button>
  );
}

export function LinksPanel() {
  const board = useStore(selectBoard)!;
  const boards = useStore((s) => s.boards);
  const sel = useStore((s) => s.sel);
  const setPanel = useStore((s) => s.setPanel);
  const node = sel.nodes.length === 1 ? board.nodes.find((n) => n.id === sel.nodes[0]) ?? null : null;
  const { incoming, outgoing } = computeLinks(boards, board, node);
  const subject = node ? node.title || TYPE_META[node.type].label : board.name;

  return (
    <aside className="side-panel" aria-label="Links">
      <div className="sp-head" data-tauri-drag-region>
        <h3>Links</h3>
        <button className="btn icon" title="Close" onClick={() => setPanel("links")}><X size={16} /></button>
      </div>
      <div className="c-target">{node ? "Card" : "Board"}: <b>{subject}</b></div>
      <div className="sp-body" style={{ paddingTop: 10 }}>
        <div className="lk-sec"><ArrowDownLeft size={13} />Linked from <span>{incoming.length}</span></div>
        {incoming.length ? incoming.map((r) => <Row key={r.key} r={r} />) : <p className="hint-sm">Nothing links here yet. Mention it in a note with [[{subject}]] or draw a line to it.</p>}
        <div className="lk-sec"><ArrowUpRight size={13} />Links to <span>{outgoing.length}</span></div>
        {outgoing.length ? outgoing.map((r) => <Row key={r.key} r={r} />) : <p className="hint-sm">{node ? "This card doesn't link anywhere." : "No board links on this board."}</p>}
        {!node && <p className="hint-sm" style={{ marginTop: 16 }}>Select one card to see its links.</p>}
      </div>
    </aside>
  );
}
