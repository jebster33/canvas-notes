/**
 * Sync (preview): push and pull boards to a server *you* host — your own
 * Netlify site, a Docker box or any machine running server/node.mjs.
 * There is no Canvas Notes cloud. The server address lives in the vault
 * (sync.json); the token stays on this computer only (never in the vault,
 * so it isn't copied along if the vault folder is shared or backed up).
 */
import { create } from "zustand";
import type { Board } from "./types";
import { useStore } from "./store";
import { readVaultJson, saveBoard, writeVaultJson } from "./storage";

interface SyncFile { url: string; revs: Record<string, number> }
export interface RemoteBoard { id: string; rev: number; updatedAt: number; name: string }

const TOKEN_KEY = "cn.syncToken";

interface SyncState {
  url: string;
  token: string;
  revs: Record<string, number>;
  loaded: boolean;
  busy: boolean;
  remote: RemoteBoard[] | null;
  conflict: { local: Board; remote: Board; rev: number } | null;
  load(): Promise<void>;
  configure(url: string, token: string): Promise<void>;
}

export const useSync = create<SyncState>((set, get) => ({
  url: "",
  token: (() => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } })(),
  revs: {},
  loaded: false,
  busy: false,
  remote: null,
  conflict: null,
  async load() {
    const f = await readVaultJson<SyncFile>("sync.json", { url: "", revs: {} });
    set({ url: typeof f.url === "string" ? f.url : "", revs: f.revs && typeof f.revs === "object" ? f.revs : {}, loaded: true });
  },
  async configure(url, token) {
    const clean = url.trim().replace(/\/+$/, "");
    try { localStorage.setItem(TOKEN_KEY, token.trim()); } catch { /* ignore */ }
    set({ url: clean, token: token.trim(), remote: null });
    await persist();
  },
}));

const persist = () => { const s = useSync.getState(); return writeVaultJson("sync.json", { url: s.url, revs: s.revs }); };
const setRev = (id: string, rev: number | null) => {
  const revs = { ...useSync.getState().revs };
  if (rev === null) delete revs[id]; else revs[id] = rev;
  useSync.setState({ revs });
  persist();
};

function checkUrl(url: string) {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error("Enter the server address, like https://my-notes.netlify.app"); }
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) || u.hostname.endsWith(".local");
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) throw new Error("Use https:// (plain http only works for servers on your own network).");
  return u.origin + u.pathname.replace(/\/+$/, "");
}

async function api<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const { url, token } = useSync.getState();
  const base = checkUrl(url);
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => { throw new Error("Couldn't reach the server. Check the address and that it's running."); });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("The server refused the token.");
  if (res.status === 503) throw new Error((data as { error?: string }).error || "The server isn't set up yet.");
  return { status: res.status, data: data as T };
}

const busy = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
  useSync.setState({ busy: true });
  try { return await fn(); } catch (e) { useStore.getState().flash((e as Error).message); return undefined; } finally { useSync.setState({ busy: false }); }
};

/** Check the address and token. */
export const testConnection = () => busy(async () => {
  const h = await api<{ ok?: boolean; configured?: boolean; service?: string }>("GET", "/api/health");
  if (h.data.service !== "canvas-notes-sync") throw new Error("That address doesn't look like a Canvas Notes sync server.");
  if (!h.data.configured) throw new Error("The server is up but has no CANVAS_SYNC_TOKEN set yet.");
  const list = await api<{ boards: RemoteBoard[] }>("GET", "/api/boards");
  useSync.setState({ remote: list.data.boards ?? [] });
  useStore.getState().flash(`Connected. ${list.data.boards?.length ?? 0} board${list.data.boards?.length === 1 ? "" : "s"} on the server.`);
  return true;
});

export const refreshRemote = () => busy(async () => {
  const list = await api<{ boards: RemoteBoard[] }>("GET", "/api/boards");
  useSync.setState({ remote: list.data.boards ?? [] });
});

/** Upload a board. On a conflict, keeps both versions around for the user to choose. */
export const pushBoard = (board: Board, force = false) => busy(async () => {
  const s = useSync.getState();
  const baseRev = force ? s.conflict?.rev ?? s.revs[board.id] ?? null : s.revs[board.id] ?? null;
  const r = await api<{ rev?: number; board?: Board; error?: string }>("PUT", `/api/boards/${encodeURIComponent(board.id)}`, { board, baseRev });
  if (r.status === 409 && r.data.board && typeof r.data.rev === "number") {
    useSync.setState({ conflict: { local: board, remote: r.data.board, rev: r.data.rev } });
    useStore.getState().flash("The server has a newer version of this board. Choose which to keep.");
    return;
  }
  if (r.status === 409) { setRev(board.id, null); throw new Error("The board was removed on the server. Press upload again to put it back."); }
  if (r.status !== 200 || typeof r.data.rev !== "number") throw new Error(r.data.error || `Upload failed (${r.status})`);
  setRev(board.id, r.data.rev);
  useSync.setState({ conflict: null });
  useStore.getState().flash(`Uploaded "${board.name}"`);
  refreshRemote();
});

/** Replace (or add) the local board with the server's copy. */
export function adoptRemoteBoard(remote: Board, rev: number) {
  const st = useStore.getState();
  const prev = st.boards[remote.id];
  const b: Board = { ...remote, workspace: prev?.workspace ?? remote.workspace ?? st.activeWs, order: prev?.order ?? remote.order ?? 0 };
  if (st.activeId === b.id) st.mutate((d) => Object.assign(d, b));
  else { useStore.setState((s) => ({ boards: { ...s.boards, [b.id]: b } })); saveBoard(b); }
  setRev(b.id, rev);
  useSync.setState({ conflict: null });
}

export const pullBoard = (id: string) => busy(async () => {
  const r = await api<{ board?: Board; rev?: number; error?: string }>("GET", `/api/boards/${encodeURIComponent(id)}`);
  if (r.status !== 200 || !r.data.board || typeof r.data.rev !== "number") throw new Error(r.data.error || `Download failed (${r.status})`);
  if (!Array.isArray(r.data.board.nodes) || r.data.board.id !== id) throw new Error("The server sent a broken board.");
  adoptRemoteBoard(r.data.board, r.data.rev);
  useStore.getState().flash(`Downloaded "${r.data.board.name}"`);
});
