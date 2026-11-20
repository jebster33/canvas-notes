import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Waypoints, Settings2, LayoutDashboard, Presentation, Columns3, CalendarDays, GanttChart, Camera, History } from "lucide-react";
import { openExport, openHistory } from "./Dialogs";
import { startPresenting } from "./Presenter";
import { useStore } from "../lib/store";
import { TYPE_META } from "../cards/Card";

type Item =
  | { kind: "card"; id: string; boardId: string; title: string; snippet: string; type: keyof typeof TYPE_META; boardName: string; boardColor: string }
  | { kind: "board"; id: string; title: string; color: string; count: number }
  | { kind: "cmd"; id: string; title: string; icon: React.ReactNode; run(): void };

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export function Palette() {
  const boards = useStore((s) => s.boards);
  const { setPalette, openBoard, createBoard, setGraph, setPanel } = useStore.getState();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    const query = q.trim().toLowerCase();
    const cmds: Item[] = [
      { kind: "cmd", id: "new", title: query ? `New board "${q.trim()}"` : "New board", icon: <Plus size={15} />, run: () => createBoard(q.trim() || "Untitled board") },
      { kind: "cmd", id: "graph", title: "Open graph view", icon: <Waypoints size={15} />, run: () => setGraph(true) },
      { kind: "cmd", id: "settings", title: "Open sheet settings", icon: <Settings2 size={15} />, run: () => useStore.getState().panel !== "settings" && setPanel("settings") },
      { kind: "cmd", id: "present", title: "Present frames", icon: <Presentation size={15} />, run: () => startPresenting() },
      { kind: "cmd", id: "kanban", title: "Show tasks as a Kanban board", icon: <Columns3 size={15} />, run: () => useStore.getState().setView("kanban") },
      { kind: "cmd", id: "calendar", title: "Show tasks on a calendar", icon: <CalendarDays size={15} />, run: () => useStore.getState().setView("calendar") },
      { kind: "cmd", id: "timeline", title: "Show tasks on a timeline", icon: <GanttChart size={15} />, run: () => useStore.getState().setView("timeline") },
      { kind: "cmd", id: "export", title: "Export as image or PDF", icon: <Camera size={15} />, run: () => openExport() },
      { kind: "cmd", id: "history", title: "Version history", icon: <History size={15} />, run: () => openHistory() },
    ];
    const bs: Item[] = Object.values(boards)
      .sort((a, b) => a.order - b.order)
      .filter((b) => !query || b.name.toLowerCase().includes(query))
      .map((b) => ({ kind: "board", id: b.id, title: b.name, color: b.color, count: b.nodes.length }));
    const cards: Item[] = [];
    for (const b of Object.values(boards)) {
      for (const n of b.nodes) {
        const text = plain(n.html) + " " + (n.table?.cells.flat().join(" ") ?? "") + " " + n.comments.map((c) => c.text).join(" ");
        const hay = (n.title + " " + text).toLowerCase();
        if (query && !hay.includes(query)) continue;
        let snippet = text.slice(0, 90);
        if (query) {
          const at = text.toLowerCase().indexOf(query);
          if (at > 30) snippet = "…" + text.slice(at - 25, at + 70);
        }
        cards.push({ kind: "card", id: n.id, boardId: b.id, title: n.title || TYPE_META[n.type].label, snippet, type: n.type, boardName: b.name, boardColor: b.color });
      }
    }
    const filteredCmds = cmds.filter((c) => !query || c.title.toLowerCase().includes(query) || c.id === "new");
    return query ? [...bs, ...cards.slice(0, 60), ...filteredCmds] : [...filteredCmds, ...bs, ...cards.slice(0, 20)];
  }, [boards, q, createBoard, setGraph, setPanel]);

  useEffect(() => setI(0), [q]);
  useEffect(() => {
    list.current?.querySelector(".pal-item.on")?.scrollIntoView({ block: "nearest" });
  }, [i]);

  const choose = (it: Item | undefined) => {
    if (!it) return;
    setPalette(false);
    if (it.kind === "cmd") it.run();
    else if (it.kind === "board") openBoard(it.id);
    else {
      openBoard(it.boardId);
      useStore.setState({ focus: it.id });
    }
  };

  return (
    <div className="scrim" onPointerDown={() => setPalette(false)}>
      <div className="pop palette" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
        <input
          autoFocus
          placeholder="Search cards, boards and commands…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "ArrowDown") { e.preventDefault(); setI((i + 1) % Math.max(1, items.length)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setI((i - 1 + items.length) % Math.max(1, items.length)); }
            if (e.key === "Enter") choose(items[i]);
            if (e.key === "Escape") setPalette(false);
          }}
        />
        <div className="results" ref={list}>
          {items.length === 0 && <div className="pal-empty">Nothing matches "{q}".</div>}
          {items.map((it, k) => {
            const on = k === i;
            if (it.kind === "cmd")
              return (
                <div key={"c" + it.id} className={"pal-item" + (on ? " on" : "")} onMouseEnter={() => setI(k)} onClick={() => choose(it)}>
                  <span style={{ color: "var(--accent-2)", display: "flex" }}>{it.icon}</span>
                  <div className="t"><b>{it.title}</b></div>
                </div>
              );
            if (it.kind === "board")
              return (
                <div key={"b" + it.id} className={"pal-item" + (on ? " on" : "")} onMouseEnter={() => setI(k)} onClick={() => choose(it)}>
                  <LayoutDashboard size={15} color={it.color} />
                  <div className="t"><b>{it.title}</b></div>
                  <span className="where">{it.count} cards</span>
                </div>
              );
            const I = TYPE_META[it.type].icon;
            return (
              <div key={"n" + it.id} className={"pal-item" + (on ? " on" : "")} onMouseEnter={() => setI(k)} onClick={() => choose(it)}>
                <I size={15} style={{ color: "var(--muted)", flex: "none" }} />
                <div className="t">
                  <b>{it.title}</b>
                  {it.snippet && <small>{it.snippet}</small>}
                </div>
                <span className="where"><i style={{ background: it.boardColor }} />{it.boardName}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
