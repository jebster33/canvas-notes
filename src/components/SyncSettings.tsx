import { useEffect, useState } from "react";
import { Cloud, Upload, Download, RefreshCw, ExternalLink, Plug } from "lucide-react";
import { useStore } from "../lib/store";
import { pullBoard, pushBoard, refreshRemote, testConnection, adoptRemoteBoard, useSync } from "../lib/sync";
import { openUrl } from "../lib/storage";

const DOCS = "https://github.com/jebster33/canvas-notes/blob/main/docs/SYNC.md";

/** App settings section: connect to a sync server the user hosts themselves. */
export function SyncSettings() {
  const sync = useSync();
  const boards = useStore((s) => s.boards);
  const active = useStore((s) => s.activeId);
  const [url, setUrl] = useState(sync.url);
  const [token, setToken] = useState(sync.token);
  useEffect(() => { if (!sync.loaded) sync.load(); }, [sync]);
  useEffect(() => setUrl(sync.url), [sync.url]);
  const dirty = url.trim().replace(/\/+$/, "") !== sync.url || token.trim() !== sync.token;
  const board = active ? boards[active] : null;
  const connected = !!sync.url && !!sync.token;

  return (
    <div className="sp-group">
      <h4><Cloud size={14} />Sync <span className="pill-beta">preview</span></h4>
      <p className="hint">Keep boards on a server <b>you</b> run (your own Netlify site, a Docker container or any computer with Node). There's no Canvas Notes cloud, so nobody else has your notes.</p>
      <button className="link-btn" onClick={() => openUrl(DOCS)}><ExternalLink size={12} /> How to set up your own server</button>
      <div className="sync-form">
        <input className="field" placeholder="https://your-notes.netlify.app" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.stopPropagation()} spellCheck={false} />
        <input className="field" type="password" placeholder="Token (CANVAS_SYNC_TOKEN)" value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.stopPropagation()} autoComplete="off" />
        <div className="sync-btns">
          <button className="btn outline" disabled={sync.busy || !url.trim() || !token.trim()} onClick={async () => { await sync.configure(url, token); testConnection(); }}>
            <Plug size={14} />{dirty ? "Save and test" : "Test connection"}
          </button>
        </div>
        <p className="hint-sm">The token stays on this computer; it's not written into your vault.</p>
      </div>

      {connected && !dirty && (
        <>
          {board && (
            <div className="sync-row">
              <span>This board: <b>{board.name}</b>{sync.revs[board.id] ? <small> · version {sync.revs[board.id]} on server</small> : <small> · not uploaded yet</small>}</span>
              <span className="sync-btns">
                <button className="btn outline" disabled={sync.busy} onClick={() => pushBoard(board)}><Upload size={14} />Upload</button>
                {sync.revs[board.id] && <button className="btn outline" disabled={sync.busy} onClick={() => pullBoard(board.id)}><Download size={14} />Download</button>}
              </span>
            </div>
          )}
          {sync.conflict && (
            <div className="sync-conflict">
              <b>Both copies changed.</b> The server has version {sync.conflict.rev} of "{sync.conflict.remote.name}".
              <div className="sync-btns">
                <button className="btn solid" onClick={() => pushBoard(sync.conflict!.local, true)}>Keep mine (upload)</button>
                <button className="btn outline" onClick={() => adoptRemoteBoard(sync.conflict!.remote, sync.conflict!.rev)}>Use the server's</button>
              </div>
              <p className="hint-sm">Tip: version history (in the board menu) keeps your older copies either way.</p>
            </div>
          )}
          <div className="sync-head">
            <span>On the server</span>
            <button className="btn icon" title="Refresh" disabled={sync.busy} onClick={() => refreshRemote()}><RefreshCw size={13} className={sync.busy ? "spin" : ""} /></button>
          </div>
          {sync.remote === null ? (
            <p className="hint-sm">Press Test connection to list the server's boards.</p>
          ) : sync.remote.length === 0 ? (
            <p className="hint-sm">Nothing uploaded yet.</p>
          ) : (
            sync.remote.map((r) => {
              const local = boards[r.id];
              const state = !local ? "Only on the server" : sync.revs[r.id] === r.rev ? (local.updatedAt > r.updatedAt ? "Changed here" : "Up to date") : "Newer on the server";
              return (
                <div key={r.id} className="sync-row">
                  <span>{r.name || "Untitled"} <small>· {state}</small></span>
                  <button className="btn icon" title="Download this board" disabled={sync.busy} onClick={() => pullBoard(r.id)}><Download size={14} /></button>
                </div>
              );
            })
          )}
          <p className="hint-sm">Automatic background sync and live editing together are planned. For now, upload and download by hand.</p>
        </>
      )}
    </div>
  );
}
