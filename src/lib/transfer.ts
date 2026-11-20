import type { Board, BoardExport, ThemeExport } from "./types";
import { mergeTheme } from "./theme";
import { openTextFile, readAsset, saveAsset, saveTextFile } from "./storage";
import { useStore } from "./store";

const slug = (s: string) => s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "board";

/** Export the board with every image inlined, so the single file is fully portable. */
export async function exportBoard(board: Board) {
  const assets: Record<string, string> = {};
  for (const n of board.nodes) {
    const a = n.image?.asset;
    if (a && !assets[a]) {
      try {
        assets[a] = await readAsset(a);
      } catch {
        /* missing image: export the rest */
      }
    }
  }
  const data: BoardExport = { format: "canvas-notes/board", version: 1, exportedAt: Date.now(), board, assets };
  const ok = await saveTextFile(`${slug(board.name)}.canvasboard`, "canvasboard", "Canvas Notes board", JSON.stringify(data, null, 1));
  if (ok) useStore.getState().flash(`Exported "${board.name}"`);
}

export async function importBoardFile() {
  const text = await openTextFile(["canvasboard", "json"], "Canvas Notes board");
  if (text == null) return;
  const { flash, importBoard } = useStore.getState();
  try {
    const data = JSON.parse(text) as BoardExport;
    if (data.format !== "canvas-notes/board" || !data.board) throw new Error("not a Canvas Notes board file");
    for (const [name, url] of Object.entries(data.assets ?? {})) await saveAsset(name, url);
    importBoard({ ...data.board, name: data.board.name });
    flash(`Imported "${data.board.name}"`);
  } catch (e) {
    flash("Import failed: " + (e as Error).message);
  }
}

export async function exportTheme(board: Board) {
  const data: ThemeExport = { format: "canvas-notes/theme", version: 1, theme: board.theme };
  const ok = await saveTextFile(`${slug(board.name)}-settings.canvastheme`, "canvastheme", "Canvas Notes settings", JSON.stringify(data, null, 2));
  if (ok) useStore.getState().flash("Settings exported");
}

export async function importTheme() {
  const text = await openTextFile(["canvastheme", "json"], "Canvas Notes settings");
  if (text == null) return;
  const { flash, mutate } = useStore.getState();
  try {
    const data = JSON.parse(text) as ThemeExport;
    if (data.format !== "canvas-notes/theme" || !data.theme) throw new Error("not a settings file");
    mutate((d) => void (d.theme = mergeTheme(data.theme)));
    flash("Settings applied to this board");
  } catch (e) {
    flash("Import failed: " + (e as Error).message);
  }
}

/** Read an image File and store it in the vault, returning the asset name. */
export async function ingestImage(file: Blob): Promise<{ asset: string; w: number; h: number }> {
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
  const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
  const name = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const dims = await new Promise<{ w: number; h: number }>((res) => {
    const im = new Image();
    im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => res({ w: 400, h: 300 });
    im.src = dataUrl;
  });
  const asset = await saveAsset(name, dataUrl);
  return { asset, ...dims };
}
