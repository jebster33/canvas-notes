import { useEffect, useState } from "react";
import {
  PanelLeft, Undo2, Redo2, Waypoints, MessageSquare, Settings2, Presentation, Filter, MoreHorizontal, Camera, History, X,
  LayoutDashboard, Columns3, CalendarDays, GanttChart, Link2, Globe, FileDown, FileUp, CalendarPlus, Sparkles,
} from "lucide-react";
import { flushSaves, selectBoard, useStore, type BoardView } from "./lib/store";
import { Canvas, isTyping } from "./components/Canvas";
import { Dock, QuickAdd, ZoomControls, TOOL_KEYS, addCardAtCenter, toggleSnap } from "./components/Dock";
import { Sidebar } from "./components/Sidebar";
import { SettingsPanel } from "./components/SettingsPanel";
import { CommentsPanel } from "./components/CommentsPanel";
import { LinksPanel } from "./components/LinksPanel";
import { AssistantPanel } from "./components/AssistantPanel";
import { GraphView } from "./components/GraphView";
import { Palette } from "./components/Palette";
import { WindowControls } from "./components/WindowControls";
import { Presenter, startPresenting } from "./components/Presenter";
import { BellButton, NotificationCenter } from "./components/NotificationCenter";
import { KanbanView, CalendarView, TimelineView } from "./components/TaskViews";
import { Dialogs, openExport, openHistory } from "./components/Dialogs";
import { TaskDetail } from "./components/TaskDetail";
import { FindBar, openFind, useFind } from "./components/FindBar";
import { HomeScreen } from "./components/HomeScreen";
import { TemplatePicker } from "./components/TemplatePicker";
import { FocusTimer } from "./components/FocusTimer";
import { exportCalendar, openDailyNote } from "./lib/productivity";
import { addChildIdea, addSiblingIdea } from "./lib/mindmap";
import { useTemplates } from "./lib/templates";
import { useLook } from "./lib/appearance";
import { exportMarkdown, importMarkdown, looksLikeMarkdown, mdToHtml } from "./lib/markdown";
import { exportWebPage } from "./lib/sharePage";
import { AppSettingsDialog } from "./components/AppSettingsDialog";
import { startupUpdateCheck } from "./lib/updates";
import { PopButton } from "./components/ui";
import { isTauri } from "./lib/storage";
import { TYPE_META } from "./cards/Card";
import { loadWebCard } from "./cards/ExtraBodies";
import { CARD_TYPES, type CardType } from "./lib/types";
import { fitAll, viewCenter, zoomBy, centerOn } from "./lib/viewport";
import { ingestImage } from "./lib/transfer";
import { startReminders } from "./lib/reminders";
import { addToInbox } from "./lib/taskops";
import { boardTags, tagColor } from "./lib/tags";
import type { CapturePayload } from "./components/CaptureApp";

const CARD_KEYS: Record<string, CardType> = Object.fromEntries(CARD_TYPES.map((t) => [TYPE_META[t].key.toLowerCase(), t]));

export default function App() {
  const ready = useStore((s) => s.ready);
  const board = useStore(selectBoard);
  const panel = useStore((s) => s.panel);
  const graphOpen = useStore((s) => s.graphOpen);
  const paletteOpen = useStore((s) => s.paletteOpen);
  const presenting = useStore((s) => s.presenting);
  const view = useStore((s) => s.view);
  const toast = useStore((s) => s.toast);
  const [sidebar, setSidebar] = useState(() => localStorage.getItem("cn.sidebar") !== "0");

  useEffect(() => {
    useStore.getState().init().then(() => {
      startReminders();
      useTemplates.getState().load();
      useLook.getState().loadFonts();
      setTimeout(startupUpdateCheck, 3000);
    }).catch((e) => useStore.getState().flash("Couldn't open the vault: " + e));
    const flush = () => flushSaves();
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  // Notes and tasks typed into the quick-capture window land in the Inbox board.
  useEffect(() => {
    if (!isTauri) return;
    let off: (() => void) | undefined;
    import("@tauri-apps/api/event").then(async ({ listen }) => {
      off = await listen<CapturePayload>("quick-capture", (e) => {
        const go = () => addToInbox(e.payload.text, e.payload.kind, e.payload.due);
        if (useStore.getState().ready) go();
        else useStore.getState().init().then(go);
      });
    });
    return () => off?.();
  }, []);

  useEffect(() => localStorage.setItem("cn.sidebar", sidebar ? "1" : "0"), [sidebar]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (st.presenting !== null) return; // the presenter owns the keyboard
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && k === "k") { e.preventDefault(); st.setPalette(!st.paletteOpen); return; }
      if (ctrl && (k === "f" || k === "h") && !st.homeOpen) { e.preventDefault(); openFind(k === "h" || useFind.getState().replace); return; }
      if (ctrl && k === "g") { e.preventDefault(); st.setGraph(!st.graphOpen); return; }
      if (ctrl && e.shiftKey && k === "d") { e.preventDefault(); openDailyNote(); return; }
      if (ctrl && k === "j") { e.preventDefault(); st.setPanel("assistant"); return; }
      if (ctrl && e.key === ",") { e.preventDefault(); st.setPanel("settings"); return; }
      if (ctrl && k === "\\") { e.preventDefault(); setSidebar((v) => !v); return; }
      if (e.key === "F5") { e.preventDefault(); startPresenting(); return; }
      if (e.key === "Escape") {
        if (st.editingId) { st.setEditing(null); (document.activeElement as HTMLElement)?.blur(); return; }
        if (st.quickAdd) return st.setQuickAdd(null);
        if (st.notifOpen) return st.setNotifOpen(false);
        if (st.tool !== "select") return st.setTool("select");
        st.clearSel();
        return;
      }
      if (isTyping() || st.paletteOpen || st.graphOpen || st.editingId || st.taskDetail || st.homeOpen || st.view !== "canvas") return;
      if (ctrl && k === "z") { e.preventDefault(); e.shiftKey ? st.redo() : st.undo(); return; }
      if (ctrl && k === "y") { e.preventDefault(); st.redo(); return; }
      if (ctrl && k === "d") { e.preventDefault(); st.duplicateSelection(); return; }
      if (ctrl && k === "c") { st.copySelection(); return; }
      if (ctrl && k === "a") {
        e.preventDefault();
        const b = st.board();
        if (b) st.setSel({ nodes: b.nodes.map((n) => n.id), strokes: b.strokes.map((s) => s.id) });
        return;
      }
      if (ctrl && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomBy(1.2); return; }
      if (ctrl && e.key === "-") { e.preventDefault(); zoomBy(1 / 1.2); return; }
      if (ctrl && e.key === "0") { e.preventDefault(); const c = viewCenter(); centerOn(c.x, c.y, 1); return; }
      if (e.shiftKey && e.code === "Digit1") { fitAll(); return; }
      if (e.key === "Delete" || e.key === "Backspace") { st.deleteSelection(); return; }
      // Mind-map keys: Tab branches off the selected card, Ctrl+Enter adds a sibling.
      if (e.key === "Tab" && !ctrl && st.sel.nodes.length === 1) { e.preventDefault(); addChildIdea(st.sel.nodes[0]); return; }
      if (e.key === "Enter" && ctrl && st.sel.nodes.length === 1) { e.preventDefault(); addSiblingIdea(st.sel.nodes[0]); return; }
      if (e.key === "Enter" && st.sel.nodes.length === 1) {
        const n = st.board()?.nodes.find((n) => n.id === st.sel.nodes[0]);
        if (n && !["table", "link", "chart", "file", "voice"].includes(n.type)) { e.preventDefault(); st.setEditing(n.id); }
        return;
      }
      if (ctrl || e.altKey) return;
      if (k === "g" && !e.shiftKey) { toggleSnap(); return; }
      if (TOOL_KEYS[k] && !e.shiftKey) { st.setTool(TOOL_KEYS[k]); return; }
      if (CARD_KEYS[k] && !e.shiftKey) { e.preventDefault(); addCardAtCenter(CARD_KEYS[k]); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Paste: images → image cards, links → web cards, text → notes, else copied cards.
  useEffect(() => {
    let lastCopiedText = "";
    const onPaste = async (e: ClipboardEvent) => {
      const st0 = useStore.getState();
      if (isTyping() || st0.view !== "canvas") return;
      const st = st0;
      const img = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      const c = viewCenter();
      if (img) {
        e.preventDefault();
        const file = img.getAsFile();
        if (!file) return;
        const { asset, w, h } = await ingestImage(file);
        const width = Math.min(420, Math.max(160, w));
        const height = Math.round((width * h) / w);
        st.addNode("image", c.x, c.y, { image: { asset, fit: "cover" }, w: width, h: height, x: c.x - width / 2, y: c.y - height / 2 });
        return;
      }
      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (text && !text.includes("\u0000") && text !== lastCopiedText) {
        e.preventDefault();
        if (/^https?:\/\/\S+$/i.test(text)) {
          const id = st.addNode("web", c.x, c.y);
          loadWebCard(id, text);
          return;
        }
        // Markdown keeps its formatting; plain text becomes paragraphs.
        const md = looksLikeMarkdown(text);
        const html = md
          ? mdToHtml(text)
          : text.split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`).join("");
        const first = text.split("\n")[0].replace(/^#+\s*/, "").slice(0, 60);
        st.addNode("note", c.x, c.y, { title: first, html, h: md ? 300 : 180 });
        st.setEditing(null);
        return;
      }
      st.paste(c.x, c.y);
    };
    const onCopy = (e: ClipboardEvent) => {
      if (isTyping()) return;
      const st = useStore.getState();
      const b = st.board();
      const nodes = b?.nodes.filter((n) => st.sel.nodes.includes(n.id)) ?? [];
      if (!nodes.length) return;
      // Readable text on the system clipboard; remembered so a paste here duplicates the cards.
      lastCopiedText = nodes.map((n) => [n.title, n.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()].filter(Boolean).join("\n")).join("\n\n").trim();
      e.clipboardData?.setData("text/plain", lastCopiedText);
      e.preventDefault();
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("copy", onCopy);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("copy", onCopy);
    };
  }, []);

  if (!ready || !board) return <div className="loading">Opening your vault…</div>;
  const isCanvas = view === "canvas";

  return (
    <div className={"app" + (isTauri ? " chrome" : "") + (panel ? " panel-open" : "") + (presenting !== null ? " presenting" : "")}>
      <WindowControls />
      <Sidebar collapsed={!sidebar || presenting !== null} />
      <main className="main">
        {isCanvas ? (
          <Canvas key={board.id} />
        ) : (
          <div className="view-host" style={{ background: board.theme.canvasBg }}>
            {view === "kanban" && <KanbanView />}
            {view === "calendar" && <CalendarView />}
            {view === "timeline" && <TimelineView />}
          </div>
        )}
        {graphOpen && <GraphView />}
        {presenting === null && <Topbar sidebar={sidebar} toggleSidebar={() => setSidebar((v) => !v)} />}
        {!graphOpen && isCanvas && presenting === null && (
          <>
            <Dock />
            <ZoomControls zoom={board.viewport.zoom} />
          </>
        )}
        <FindBar />
        <Presenter />
        <QuickAdd />
        <NotificationCenter />
      </main>
      {presenting === null && panel === "settings" && <SettingsPanel />}
      {presenting === null && panel === "comments" && <CommentsPanel />}
      {presenting === null && panel === "links" && <LinksPanel />}
      {presenting === null && panel === "assistant" && <AssistantPanel />}
      {paletteOpen && <Palette />}
      <Dialogs />
      <TaskDetail />
      <HomeScreen />
      <AppSettingsDialog />
      <TemplatePicker />
      <FocusTimer />
      {toast && <div className="toast pop" role="status">{toast}</div>}
    </div>
  );
}

const VIEWS: { v: BoardView; label: string; icon: typeof LayoutDashboard }[] = [
  { v: "canvas", label: "Canvas", icon: LayoutDashboard },
  { v: "kanban", label: "Board", icon: Columns3 },
  { v: "calendar", label: "Calendar", icon: CalendarDays },
  { v: "timeline", label: "Timeline", icon: GanttChart },
];

function TagFilter() {
  const board = useStore(selectBoard)!;
  const filter = useStore((s) => s.tagFilter);
  const setTagFilter = useStore((s) => s.setTagFilter);
  const tags = boardTags(board);
  return (
    <PopButton
      title="Filter by tag"
      className={"btn icon tip" + (filter.length ? " on" : "")}
      align="right"
      label={<><Filter size={16} />{filter.length > 0 && <span className="bell-dot">{filter.length}</span>}</>}
    >
      <div className="tag-pop">
        <h4>Show cards tagged</h4>
        {tags.length === 0 && <p className="hint-sm">No tags yet. Select a card and use the tag button on its toolbar.</p>}
        <div className="tag-list">
          {tags.map((t) => {
            const c = tagColor(board.tagColors, t);
            const on = filter.includes(t);
            return (
              <button key={t} className={"tag-toggle" + (on ? " on" : "")} onClick={() => setTagFilter(on ? filter.filter((x) => x !== t) : [...filter, t])}>
                <span className="tag-check">{on && "✓"}</span>
                <span className="tag-chip" style={{ background: c + "26", color: c, borderColor: c + "55" }}>{t}</span>
                <small>{board.nodes.filter((n) => n.tags?.includes(t)).length}</small>
              </button>
            );
          })}
        </div>
        {filter.length > 0 && <button className="btn outline" style={{ marginTop: 8 }} onClick={() => setTagFilter([])}><X size={13} />Show everything</button>}
      </div>
    </PopButton>
  );
}

function Topbar({ sidebar, toggleSidebar }: { sidebar: boolean; toggleSidebar(): void }) {
  const board = useStore(selectBoard)!;
  const panel = useStore((s) => s.panel);
  const graphOpen = useStore((s) => s.graphOpen);
  const view = useStore((s) => s.view);
  const { renameBoard, undo, redo, setGraph, setPanel, setView } = useStore.getState();
  const [name, setName] = useState(board.name);
  useEffect(() => setName(board.name), [board.name, board.id]);
  const hasFrames = board.nodes.some((n) => n.type === "frame");

  return (
    <header className="topbar">
      <div className="bar-group">
        <button className="btn icon tip" data-tip={sidebar ? "Hide sidebar  Ctrl \\" : "Show sidebar  Ctrl \\"} aria-label="Toggle sidebar" onClick={toggleSidebar}>
          <PanelLeft size={16} />
        </button>
        {!graphOpen && (
          <input
            className="board-title"
            value={name}
            aria-label="Board name"
            size={Math.max(6, name.length)}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => (name.trim() ? renameBoard(board.id, name.trim()) : setName(board.name))}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
            }}
          />
        )}
      </div>
      {!graphOpen && (
        <div className="bar-group views">
          {VIEWS.map(({ v, label, icon: I }) => (
            <button key={v} className={"btn tip" + (view === v ? " on" : "")} data-tip={label} aria-label={label} onClick={() => setView(v)}>
              <I size={15} /><span className="view-label">{label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="spacer drag" data-tauri-drag-region />
      {!graphOpen && view === "canvas" && (
        <div className="bar-group">
          <button className="btn icon tip" data-tip="Undo  Ctrl Z" aria-label="Undo" onClick={undo}><Undo2 size={16} /></button>
          <button className="btn icon tip" data-tip="Redo  Ctrl Y" aria-label="Redo" onClick={redo}><Redo2 size={16} /></button>
          <TagFilter />
          {hasFrames && <button className="btn icon tip" data-tip="Present frames  F5" aria-label="Present" onClick={startPresenting}><Presentation size={16} /></button>}
        </div>
      )}
      <div className="bar-group">
        <BellButton />
        <button className={"btn icon tip" + (graphOpen ? " on" : "")} data-tip="Graph  Ctrl G" aria-label="Graph" onClick={() => setGraph(!graphOpen)}><Waypoints size={16} /></button>
        <button className={"btn icon tip" + (panel === "comments" ? " on" : "")} data-tip="Comments" aria-label="Comments" onClick={() => setPanel("comments")}><MessageSquare size={16} /></button>
        <button className={"btn icon tip" + (panel === "links" ? " on" : "")} data-tip="Links and backlinks" aria-label="Links" onClick={() => setPanel("links")}><Link2 size={16} /></button>
        <button className={"btn icon tip" + (panel === "assistant" ? " on" : "")} data-tip="AI assistant  Ctrl J" aria-label="Assistant" onClick={() => setPanel("assistant")}><Sparkles size={16} /></button>
        <PopButton title="More" className="btn icon" align="right" label={<MoreHorizontal size={16} />}>
          {(close) => (
            <div className="stack more-menu">
              <button className="btn" onClick={() => { close(); openExport(); }}><Camera size={15} />Export as image or PDF</button>
              <button className="btn" onClick={() => { close(); openHistory(); }}><History size={15} />Version history</button>
              <button className="btn" onClick={() => { close(); startPresenting(); }}><Presentation size={15} />Present frames</button>
              <button className="btn" onClick={() => { close(); exportWebPage(useStore.getState().board()!); }}><Globe size={15} />Share as web page</button>
              <button className="btn" onClick={() => { close(); exportMarkdown(useStore.getState().board()!); }}><FileDown size={15} />Export as Markdown</button>
              <button className="btn" onClick={() => { close(); importMarkdown(); }}><FileUp size={15} />Import Markdown</button>
              <button className="btn" onClick={() => { close(); exportCalendar(useStore.getState().activeId ?? undefined); }}><CalendarPlus size={15} />Export tasks to calendar</button>
            </div>
          )}
        </PopButton>
        <button className={"btn tip" + (panel === "settings" ? " on" : "")} data-tip="Sheet settings  Ctrl ," onClick={() => setPanel("settings")}>
          <Settings2 size={16} /><span className="view-label">Sheet settings</span>
        </button>
      </div>
    </header>
  );
}
