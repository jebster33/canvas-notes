/**
 * App-wide look: light / dark / system chrome, and fonts the user adds themselves.
 */
import { create } from "zustand";
import { FONTS } from "./theme";
import { readAsset, readVaultJson, writeVaultJson, saveFileBlob, isTauri, assetName, invokeSafe } from "./storage";

export type AppTheme = "dark" | "light" | "system";
const KEY = "cn.appTheme";

const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: light)") : null;
const resolve = (t: AppTheme) => (t === "system" ? (media?.matches ? "light" : "dark") : t);

function apply(t: AppTheme) {
  document.documentElement.dataset.theme = resolve(t);
}

interface CustomFont { family: string; asset: string }

interface LookState {
  theme: AppTheme;
  fonts: CustomFont[];
  setTheme(t: AppTheme): void;
  loadFonts(): Promise<void>;
  addFont(): Promise<void>;
  removeFont(family: string): void;
}

const stored = (() => { try { return (localStorage.getItem(KEY) as AppTheme) || "dark"; } catch { return "dark" as AppTheme; } })();

export const useLook = create<LookState>((set, get) => ({
  theme: stored,
  fonts: [],
  setTheme(theme) {
    try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
    apply(theme);
    set({ theme });
  },
  async loadFonts() {
    const list = await readVaultJson<CustomFont[]>("fonts.json", []);
    const ok: CustomFont[] = [];
    for (const f of Array.isArray(list) ? list : []) {
      if (typeof f?.family !== "string" || typeof f?.asset !== "string") continue;
      if (await register(f)) ok.push(f);
    }
    set({ fonts: ok });
  },
  async addFont() {
    const f = await pickFont();
    if (!f) return;
    if (get().fonts.some((x) => x.family === f.family)) return;
    if (!(await register(f))) throw new Error("That file isn't a font this app can read");
    const fonts = [...get().fonts, f];
    set({ fonts });
    await writeVaultJson("fonts.json", fonts);
  },
  removeFont(family) {
    const fonts = get().fonts.filter((f) => f.family !== family);
    const i = FONTS.findIndex((x) => x.label === family && x.custom);
    if (i >= 0) FONTS.splice(i, 1);
    set({ fonts });
    writeVaultJson("fonts.json", fonts);
  },
}));

/** Load the font file into the page and list it in every font picker. */
async function register(f: CustomFont) {
  try {
    const url = await readAsset(f.asset);
    if (!url) return false;
    const face = new FontFace(f.family, `url(${url})`);
    await face.load();
    document.fonts.add(face);
    const value = `'${f.family.replace(/'/g, "")}', system-ui, sans-serif`;
    if (!FONTS.some((x) => x.value === value)) FONTS.push({ label: f.family, value, custom: true });
    return true;
  } catch (e) {
    console.warn("font failed", f.family, e);
    return false;
  }
}

const FONT_EXTS = ["ttf", "otf", "woff", "woff2"];

async function pickFont(): Promise<CustomFont | null> {
  const familyOf = (file: string) => file.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b(regular|variable|vf)\b/gi, "").trim() || "Custom font";
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, title: "Add a font", filters: [{ name: "Fonts", extensions: FONT_EXTS }] });
    if (!path || Array.isArray(path)) return null;
    const original = path.split(/[\\/]/).pop() || "font.ttf";
    const asset = assetName("font", original);
    await invokeSafe<number>("import_asset_path", { path, name: asset });
    return { family: familyOf(original), asset };
  }
  return new Promise((res) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = FONT_EXTS.map((e) => "." + e).join(",");
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return res(null);
      const { asset } = await saveFileBlob(file, "font");
      res({ family: familyOf(file.name), asset });
    };
    input.click();
  });
}

/** Call once at startup (both windows). */
export function initAppearance() {
  apply(useLook.getState().theme);
  media?.addEventListener("change", () => useLook.getState().theme === "system" && apply("system"));
}
