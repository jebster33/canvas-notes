import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, Plus, Check, Pencil, Trash2 } from "lucide-react";
import { useStore } from "../lib/store";
import { useKeepOnScreen } from "./ui";
import type { Workspace } from "../lib/types";

export const WS_COLORS = ["#8B7CF6", "#6EA8FE", "#5EC2B0", "#A3D977", "#F2C66D", "#F2A65A", "#F28B82", "#F5A3D0"];

/** Square badge with the workspace's first letter. */
export function WsBadge({ ws, size = 22 }: { ws: Workspace; size?: number }) {
  return (
    <span className="ws-badge" style={{ width: size, height: size, background: ws.color + "2e", color: ws.color, fontSize: size * 0.5 }}>
      {ws.name.trim()[0]?.toUpperCase() ?? "W"}
    </span>
  );
}

/** Sidebar dropdown: switch, create, rename, recolor and delete workspaces. */
export function WorkspaceSwitcher() {
  const workspaces = useStore((s) => s.workspaces);
  const activeWs = useStore((s) => s.activeWs);
  const boards = useStore((s) => s.boards);
  const { openWorkspace, createWorkspace, renameWorkspace, recolorWorkspace, deleteWorkspace } = useStore.getState();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [name, setName] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useKeepOnScreen(menuRef, open);
  const ws = workspaces.find((w) => w.id === activeWs) ?? workspaces[0];

  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setEditing(null);
        setConfirm(null);
      }
    };
    window.addEventListener("pointerdown", h, true);
    return () => window.removeEventListener("pointerdown", h, true);
  }, [open]);

  if (!ws) return null;
  const count = (id: string) => Object.values(boards).filter((b) => b.workspace === id).length;
  const submit = () => {
    if (name.trim()) createWorkspace(name);
    setName("");
    setCreating(false);
    setOpen(false);
  };

  return (
    <div className="ws-switch" ref={ref}>
      <button className={"ws-current" + (open ? " on" : "")} onClick={() => setOpen((o) => !o)} aria-label="Switch workspace">
        <WsBadge ws={ws} />
        <span className="ws-name">{ws.name}</span>
        <ChevronsUpDown size={14} />
      </button>
      {open && (
        <div className="pop ws-menu" ref={menuRef}>
          <div className="menu-label">Workspaces</div>
          {workspaces.map((w) => (
            <div key={w.id} className={"ws-row" + (w.id === activeWs ? " on" : "")}>
              {editing === w.id ? (
                <div className="ws-edit">
                  <input
                    className="field"
                    autoFocus
                    defaultValue={w.name}
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => { renameWorkspace(w.id, e.target.value); setEditing(null); }}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                  />
                  <div className="ws-colors">
                    {WS_COLORS.map((c) => (
                      <button key={c} className={"dot-btn" + (w.color === c ? " on" : "")} style={{ background: c }} aria-label="Workspace color"
                        onPointerDown={(e) => e.preventDefault()} onClick={() => recolorWorkspace(w.id, c)} />
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <button className="ws-pick" onClick={() => { openWorkspace(w.id); setOpen(false); }}>
                    <WsBadge ws={w} size={20} />
                    <span className="ws-name">{w.name}</span>
                    <small>{count(w.id)}</small>
                    {w.id === activeWs && <Check size={13} />}
                  </button>
                  <button className="btn icon ws-act" title="Rename or recolor" onClick={() => setEditing(w.id)}><Pencil size={13} /></button>
                  {workspaces.length > 1 && (
                    confirm === w.id ? (
                      <button className="btn ws-act danger" title={`Boards move to ${workspaces.find((x) => x.id !== w.id)!.name}`} onClick={() => { deleteWorkspace(w.id); setConfirm(null); }}>Delete?</button>
                    ) : (
                      <button className="btn icon ws-act danger" title="Delete workspace (its boards are kept)" onClick={() => setConfirm(w.id)}><Trash2 size={13} /></button>
                    )
                  )}
                </>
              )}
            </div>
          ))}
          <hr />
          {creating ? (
            <div className="ws-edit">
              <input
                className="field"
                autoFocus
                placeholder="Name, like School or Work"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") submit(); if (e.key === "Escape") setCreating(false); }}
              />
            </div>
          ) : (
            <button className="ws-pick" onClick={() => setCreating(true)}><Plus size={14} />New workspace</button>
          )}
        </div>
      )}
    </div>
  );
}
