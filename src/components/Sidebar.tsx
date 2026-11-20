import { useEffect, useState } from "react";
import { Plus, Search, Waypoints, MoreHorizontal, Pencil, Copy, Download, Trash2, Upload, FolderOpen, Camera, History, Home, ArrowRightLeft } from "lucide-react";
import { WorkspaceSwitcher } from "./Workspaces";
import { useStore, uid } from "../lib/store";
import { INKS } from "../lib/theme";
import { exportBoard, importBoardFile } from "../lib/transfer";
import { openExport, openHistory } from "./Dialogs";
import { isTauri } from "../lib/storage";

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const boards = useStore((s) => s.boards);
  const activeId = useStore((s) => s.activeId);
  const vault = useStore((s) => s.vault);
  const graphOpen = useStore((s) => s.graphOpen);
  const { openBoard, createBoard, renameBoard, setPalette, setGraph, setVault } = useStore.getState();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const activeWs = useStore((s) => s.activeWs);
  const list = Object.values(boards).filter((b) => b.workspace === activeWs).sort((a, b) => a.order - b.order);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  return (
    <nav className={"sidebar" + (collapsed ? " collapsed" : "")} aria-label="Boards">
      <div className="sb-head" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <span className="brand-mark">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="6" height="5" rx="1.5" fill="#fff" /><rect x="9" y="9" width="6" height="5" rx="1.5" fill="#fff" fillOpacity=".55" /><path d="M7 4.5C10 4.5 9 11.5 9 11.5" stroke="#fff" strokeWidth="1.4" /></svg>
          </span>
          Canvas Notes
        </div>
        <button className="btn icon" title="Start menu" aria-label="Start menu" onClick={() => useStore.getState().setHome(true)}><Home size={15} /></button>
      </div>
      <WorkspaceSwitcher />
      <button className="sb-search" onClick={() => setPalette(true)}>
        <Search size={14} />
        <span>Search</span>
        <kbd className="kbd">Ctrl K</kbd>
      </button>
      <div className="sb-section">
        Boards
        <button className="btn icon" style={{ width: 24, height: 24 }} title="New board" onClick={() => setRenaming(createBoard())}>
          <Plus size={15} />
        </button>
      </div>
      <div className="sb-list">
        {list.map((b) => (
          <div
            key={b.id}
            className={"sb-item" + (b.id === activeId && !graphOpen ? " on" : "")}
            onClick={() => openBoard(b.id)}
            onDoubleClick={() => setRenaming(b.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ id: b.id, x: e.clientX, y: e.clientY });
            }}
          >
            <span className="dot" style={{ background: b.color }} />
            {renaming === b.id ? (
              <input
                autoFocus
                defaultValue={b.name}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  if (e.target.value.trim()) renameBoard(b.id, e.target.value.trim());
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenaming(null);
                }}
              />
            ) : (
              <span className="name">{b.name}</span>
            )}
            <span className="count">{b.nodes.length || ""}</span>
            <button
              className="btn icon more"
              style={{ width: 22, height: 22 }}
              aria-label="Board options"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setMenu({ id: b.id, x: r.right - 10, y: r.bottom + 4 });
              }}
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="sb-foot">
        <button className={"btn" + (graphOpen ? " on" : "")} onClick={() => setGraph(!graphOpen)}>
          <Waypoints size={15} />Graph view
        </button>
        <button className="btn" onClick={importBoardFile}>
          <Upload size={15} />Import board
        </button>
        {isTauri && (
          <button className="btn" onClick={setVault} title={vault}>
            <FolderOpen size={15} />Change vault
          </button>
        )}
        <div className="vault" title={vault}>{vault}</div>
      </div>
      {menu && boards[menu.id] && (
        <BoardMenu id={menu.id} x={menu.x} y={menu.y} onRename={() => setRenaming(menu.id)} close={() => setMenu(null)} />
      )}
    </nav>
  );
}

function BoardMenu({ id, x, y, onRename, close }: { id: string; x: number; y: number; onRename(): void; close(): void }) {
  const b = useStore((s) => s.boards[id]);
  const { recolorBoard, importBoard, removeBoard } = useStore.getState();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="pop menu" style={{ left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - 260) }} onPointerDown={(e) => e.stopPropagation()}>
      <button onClick={() => (onRename(), close())}><Pencil size={14} />Rename</button>
      <button onClick={() => (importBoard({ ...structuredClone(b), id: uid(), name: b.name + " copy" }), close())}><Copy size={14} />Duplicate</button>
      <button onClick={() => (exportBoard(b), close())}><Download size={14} />Export board file</button>
      <button onClick={() => (useStore.getState().openBoard(id), close(), setTimeout(openExport, 50))}><Camera size={14} />Export as image or PDF</button>
      <button onClick={() => (useStore.getState().openBoard(id), close(), setTimeout(openHistory, 50))}><History size={14} />Version history</button>
      <MoveToWorkspace boardId={id} close={close} />
      <div className="menu-colors">
        {INKS.slice(2).map((c) => (
          <button key={c} className={"swatch" + (b.color === c ? " on" : "")} style={{ background: c, width: 18, height: 18, padding: 0 }} aria-label={"Color " + c} onClick={() => recolorBoard(id, c)} />
        ))}
      </div>
      <hr />
      {confirm ? (
        <button className="danger" onClick={() => (removeBoard(id), close())}><Trash2 size={14} />Delete "{b.name}" for good</button>
      ) : (
        <button className="danger" onClick={() => setConfirm(true)}><Trash2 size={14} />Delete board…</button>
      )}
    </div>
  );
}

function MoveToWorkspace({ boardId, close }: { boardId: string; close(): void }) {
  const workspaces = useStore((s) => s.workspaces);
  const current = useStore((s) => s.boards[boardId]?.workspace);
  const [open, setOpen] = useState(false);
  const others = workspaces.filter((w) => w.id !== current);
  if (!others.length) return null;
  return (
    <>
      <button onClick={() => setOpen((o) => !o)}><ArrowRightLeft size={14} />Move to workspace…</button>
      {open &&
        others.map((w) => (
          <button key={w.id} className="menu-sub" onClick={() => { useStore.getState().moveBoardToWorkspace(boardId, w.id); useStore.getState().flash(`Moved to ${w.name}`); close(); }}>
            <i className="ws-dot" style={{ background: w.color }} />{w.name}
          </button>
        ))}
    </>
  );
}
