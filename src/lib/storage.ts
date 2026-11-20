/**
 * Storage bridge. Inside the Tauri app everything goes to the vault folder
 * through Rust commands; in a plain browser (vite dev preview) it falls back
 * to localStorage so the UI can be developed without the native shell.
 */
import type { Board } from "./types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

const LS_BOARDS = "cn.boards";
const LS_ASSET = "cn.asset.";

function lsBoards(): Record<string, Board> {
  try {
    return JSON.parse(localStorage.getItem(LS_BOARDS) || "{}");
  } catch {
    return {};
  }
}

export async function vaultPath(): Promise<string> {
  return isTauri ? invoke<string>("vault_path") : "Browser storage (dev preview)";
}

export async function chooseVault(): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const dir = await open({ directory: true, title: "Choose a vault folder" });
  if (!dir || Array.isArray(dir)) return null;
  return invoke<string>("set_vault", { path: dir });
}

export async function listBoards(): Promise<Board[]> {
  if (isTauri) return invoke<Board[]>("list_boards");
  return Object.values(lsBoards());
}

export async function saveBoard(board: Board): Promise<void> {
  if (isTauri) {
    await invoke("save_board", { id: board.id, data: JSON.stringify(board) });
    return;
  }
  const all = lsBoards();
  all[board.id] = board;
  localStorage.setItem(LS_BOARDS, JSON.stringify(all));
}

export async function deleteBoard(id: string): Promise<void> {
  if (isTauri) {
    await invoke("delete_board", { id });
    return;
  }
  const all = lsBoards();
  delete all[id];
  localStorage.setItem(LS_BOARDS, JSON.stringify(all));
}

const assetCache = new Map<string, string>();

/** Save a data URL as an asset, returns the asset file name. */
export async function saveAsset(name: string, dataUrl: string): Promise<string> {
  assetCache.set(name, dataUrl);
  if (isTauri) {
    const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return invoke<string>("save_asset", { name, dataB64: b64 });
  }
  try {
    localStorage.setItem(LS_ASSET + name, dataUrl);
  } catch {
    /* quota: image still shows this session from cache */
  }
  return name;
}

export async function readAsset(name: string): Promise<string> {
  const hit = assetCache.get(name);
  if (hit) return hit;
  const url = isTauri ? await invoke<string>("read_asset", { name }) : localStorage.getItem(LS_ASSET + name) || "";
  if (url) assetCache.set(name, url);
  return url;
}

/** Save text to a user-chosen file. Returns false when the user cancels. */
export async function saveTextFile(defaultName: string, ext: string, label: string, text: string): Promise<boolean> {
  if (isTauri) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: defaultName, filters: [{ name: label, extensions: [ext] }] });
    if (!path) return false;
    await invoke("export_file", { path, data: text });
    return true;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = defaultName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}

/** Let the user pick a file and return its text, or null when cancelled. */
export async function openTextFile(exts: string[], label: string): Promise<string | null> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, filters: [{ name: label, extensions: exts }] });
    if (!path || Array.isArray(path)) return null;
    return invoke<string>("import_file", { path });
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = exts.map((e) => "." + e).join(",");
    input.onchange = async () => resolve(input.files?.[0] ? await input.files[0].text() : null);
    input.click();
  });
}

/* ---------------- web, files, history ---------------- */

export interface LinkPreview { url: string; title: string; description: string; image: string; site: string }

/** Read a page's title/description/image. In the browser preview we only know the URL. */
export async function fetchPreview(url: string): Promise<LinkPreview> {
  if (isTauri) return invoke<LinkPreview>("fetch_preview", { url });
  const u = new URL(url);
  return { url, title: u.hostname + u.pathname, description: "", image: "", site: u.hostname.replace(/^www\./, "") };
}

export async function openUrl(url: string) {
  if (isTauri) return invoke("open_url", { url });
  window.open(url, "_blank", "noopener");
}

export async function openAsset(name: string) {
  if (isTauri) return invoke("open_asset", { name });
  const url = await readAsset(name);
  window.open(url, "_blank");
}

/** Make a vault-safe file name that keeps the original extension. */
export function assetName(prefix: string, original: string) {
  const ext = (original.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? "bin").toLowerCase();
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
}

/** Let the user pick any file and copy it into the vault. */
export async function pickFileAsset(): Promise<{ asset: string; name: string; size: number } | null> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, title: "Attach a file" });
    if (!path || Array.isArray(path)) return null;
    const original = path.split(/[\/]/).pop() || "file";
    const asset = assetName("file", original);
    const size = await invoke<number>("import_asset_path", { path, name: asset });
    return { asset, name: original, size };
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? await saveFileBlob(f) : null);
    };
    input.click();
  });
}

export async function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

/** Store a dropped/recorded blob as an asset. */
export async function saveFileBlob(f: File | Blob, prefix = "file", original = (f as File).name || "file.bin") {
  const asset = assetName(prefix, original);
  await saveAsset(asset, await blobToDataUrl(f));
  return { asset, name: original, size: f.size };
}

export async function saveAssetCopy(asset: string, suggested: string) {
  if (isTauri) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: suggested });
    if (!path) return false;
    await invoke("copy_asset_to", { name: asset, path });
    return true;
  }
  const a = document.createElement("a");
  a.href = await readAsset(asset);
  a.download = suggested;
  a.click();
  return true;
}

export async function saveBinaryFile(defaultName: string, ext: string, label: string, b64: string): Promise<boolean> {
  if (isTauri) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: defaultName, filters: [{ name: label, extensions: [ext] }] });
    if (!path) return false;
    await invoke("export_binary", { path, dataB64: b64 });
    return true;
  }
  const a = document.createElement("a");
  a.href = `data:application/octet-stream;base64,${b64}`;
  a.download = defaultName;
  a.click();
  return true;
}

export interface SnapshotInfo { ts: number; size: number }
const LS_HIST = "cn.hist.";

export async function listHistory(id: string): Promise<SnapshotInfo[]> {
  if (isTauri) return invoke<SnapshotInfo[]>("list_history", { id });
  try {
    const all: Record<string, string> = JSON.parse(localStorage.getItem(LS_HIST + id) || "{}");
    return Object.keys(all).map(Number).sort((a, b) => b - a).map((ts) => ({ ts, size: all[ts].length }));
  } catch {
    return [];
  }
}

export async function readHistory(id: string, ts: number): Promise<string> {
  if (isTauri) return invoke<string>("read_history", { id, ts });
  return JSON.parse(localStorage.getItem(LS_HIST + id) || "{}")[ts] ?? "";
}

export async function snapshotNow(board: Board) {
  const data = JSON.stringify(board);
  if (isTauri) return invoke("snapshot_now", { id: board.id, data });
  try {
    const all: Record<string, string> = JSON.parse(localStorage.getItem(LS_HIST + board.id) || "{}");
    all[Date.now()] = data;
    const keys = Object.keys(all).sort();
    while (keys.length > 15) delete all[keys.shift()!];
    localStorage.setItem(LS_HIST + board.id, JSON.stringify(all));
  } catch {
    /* quota */
  }
}

export async function invokeSafe<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri) return null;
  return invoke<T>(cmd, args);
}

/* ---------------- workspaces (vault-level) ---------------- */

export interface VaultMeta { workspaces: import("./types").Workspace[]; active?: string }
const LS_META = "cn.meta";

export async function loadMeta(): Promise<VaultMeta | null> {
  try {
    const raw = isTauri ? await invoke<string>("read_meta") : localStorage.getItem(LS_META) || "";
    return raw ? (JSON.parse(raw) as VaultMeta) : null;
  } catch {
    return null;
  }
}

export async function saveMeta(meta: VaultMeta) {
  const data = JSON.stringify(meta, null, 1);
  if (isTauri) return invoke("write_meta", { data });
  localStorage.setItem(LS_META, data);
}
