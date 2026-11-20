import { useEffect, useState } from "react";
import { X, Plus, Upload, ArrowRight, Keyboard, Bell, LayoutDashboard, Settings } from "lucide-react";
import { useAppSettingsDialog } from "./AppSettingsDialog";
import { openTemplatePicker } from "./TemplatePicker";
import { useUpdates } from "../lib/updates";
import { useStore } from "../lib/store";
import { importBoardFile } from "../lib/transfer";
import { upcoming } from "../lib/reminders";
import { WsBadge } from "./Workspaces";
import logoMark from "../assets/logo-mark.png";

function ago(t: number) {
  const d = Date.now() - t;
  if (d < 60e3) return "just now";
  if (d < 3600e3) return `${Math.floor(d / 60e3)} min ago`;
  if (d < 86400e3) return `${Math.floor(d / 3600e3)} h ago`;
  if (d < 7 * 86400e3) return `${Math.floor(d / 86400e3)} d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Start menu: pick a workspace, reopen a recent board, or start something new. */
export function HomeScreen() {
  const open = useStore((s) => s.homeOpen);
  const workspaces = useStore((s) => s.workspaces);
  const boards = useStore((s) => s.boards);
  const activeWs = useStore((s) => s.activeWs);
  const { setHome, openWorkspace, openBoard, createWorkspace, setNotifOpen } = useStore.getState();
  const [naming, setNaming] = useState(false);
  const updateReady = useUpdates((s) => s.status === "available");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !naming && !useAppSettingsDialog.getState().open) { e.stopPropagation(); setHome(false); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [open, naming, setHome]);

  if (!open) return null;
  const all = Object.values(boards);
  const recent = [...all].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  const wsOf = (id?: string) => workspaces.find((w) => w.id === id);
  const u = upcoming(boards);
  const due = u.overdue.length + u.today.length;
  const create = () => {
    if (name.trim()) createWorkspace(name);
    setName("");
    setNaming(false);
  };

  return (
    <div className="home" role="dialog" aria-label="Start menu">
      <div className="home-top" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <span className="brand-mark">
            <img src={logoMark} alt="" width={15} height={15} draggable={false} />
          </span>
          Canvas Notes
        </div>
        <div className="home-top-actions">
          <button className="btn home-settings" onClick={() => useAppSettingsDialog.getState().set(true)} title="App settings">
            <Settings size={16} />App settings{updateReady && <span className="upd-dot" aria-label="Update available" />}
          </button>
          <button className="btn home-close" onClick={() => setHome(false)} title="Close (Esc)"><X size={16} />Close</button>
        </div>
      </div>

      <div className="home-inner">
        <h1 className="home-hello">{greeting()}.</h1>
        <p className="home-sub">Pick a workspace or jump back into a board.</p>

        <section>
          <h2>Workspaces</h2>
          <div className="home-ws">
            {workspaces.map((w) => {
              const list = all.filter((b) => b.workspace === w.id);
              const last = list.reduce((m, b) => Math.max(m, b.updatedAt), 0);
              return (
                <button key={w.id} className={"ws-card" + (w.id === activeWs ? " current" : "")} style={{ ["--ws" as string]: w.color }} onClick={() => openWorkspace(w.id)}>
                  <div className="ws-card-top">
                    <WsBadge ws={w} size={34} />
                    {w.id === activeWs && <span className="ws-here">Open now</span>}
                  </div>
                  <b>{w.name}</b>
                  <small>{list.length} board{list.length === 1 ? "" : "s"}{last ? ` · edited ${ago(last)}` : ""}</small>
                  <div className="ws-card-boards">
                    {list.slice(0, 5).map((b) => <span key={b.id}><i style={{ background: b.color }} />{b.name}</span>)}
                    {list.length > 5 && <span className="more">+{list.length - 5} more</span>}
                  </div>
                </button>
              );
            })}
            <div className="ws-card new">
              {naming ? (
                <>
                  <b>New workspace</b>
                  <input
                    className="field"
                    autoFocus
                    placeholder="Name, like School or Work"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") create(); if (e.key === "Escape") setNaming(false); }}
                  />
                  <div className="ws-new-actions">
                    <button className="btn" onClick={() => setNaming(false)}>Cancel</button>
                    <button className="btn solid" disabled={!name.trim()} onClick={create}>Create</button>
                  </div>
                </>
              ) : (
                <button className="ws-new-btn" onClick={() => setNaming(true)}>
                  <Plus size={22} />
                  <b>New workspace</b>
                  <small>A separate set of boards</small>
                </button>
              )}
            </div>
          </div>
        </section>

        <div className="home-cols">
          <section>
            <h2>Recent boards</h2>
            <div className="home-recent">
              {recent.map((b) => {
                const w = wsOf(b.workspace);
                return (
                  <button key={b.id} className="recent-row" onClick={() => openBoard(b.id)}>
                    <i className="dot" style={{ background: b.color }} />
                    <span className="recent-name">{b.name}</span>
                    {w && <span className="recent-ws" style={{ color: w.color }}>{w.name}</span>}
                    <small>{b.nodes.length} cards · {ago(b.updatedAt)}</small>
                    <ArrowRight size={14} className="recent-go" />
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h2>Start something</h2>
            <div className="home-actions">
              <button className="home-action" onClick={() => { setHome(false); openTemplatePicker(); }}>
                <LayoutDashboard size={18} />
                <span><b>New board</b><small>In {wsOf(activeWs)?.name ?? "this workspace"}</small></span>
              </button>
              <button className="home-action" onClick={() => { setHome(false); importBoardFile(); }}>
                <Upload size={18} />
                <span><b>Import a board</b><small>From a .canvasboard file</small></span>
              </button>
              {due > 0 && (
                <button className="home-action hot" onClick={() => { setHome(false); setNotifOpen(true); }}>
                  <Bell size={18} />
                  <span><b>{due === 1 ? "1 task needs" : `${due} tasks need`} attention</b><small>{u.overdue.length ? `${u.overdue.length} overdue` : "Due today"}</small></span>
                </button>
              )}
              <div className="home-tip">
                <Keyboard size={16} />
                <span>Press <kbd className="kbd">Ctrl Shift Space</kbd> anywhere in Windows to drop a quick note into your Inbox.</span>
              </div>
            </div>
          </section>
        </div>
        <p className="home-foot">Esc closes this. The house button at the top of the sidebar brings it back.</p>
      </div>
    </div>
  );
}
