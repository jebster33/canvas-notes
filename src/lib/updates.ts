import { create } from "zustand";
import { invokeSafe, isTauri } from "./storage";
import { useStore } from "./store";

export interface UpdateInfo {
  current: string;
  latest: string;
  newer: boolean;
  notes: string;
  page: string;
  asset_url: string | null;
  asset_sha256: string | null;
  asset_size: number;
}

type Status = "idle" | "checking" | "uptodate" | "available" | "installing" | "error";

interface UpdState {
  status: Status;
  info: UpdateInfo | null;
  error: string;
  checkedAt: number;
  check(manual?: boolean): Promise<UpdateInfo | null>;
  install(): Promise<void>;
}

export const useUpdates = create<UpdState>((set, get) => ({
  status: "idle",
  info: null,
  error: "",
  checkedAt: 0,

  async check(manual = false) {
    if (!isTauri) {
      set({ status: "error", error: "Updates work in the desktop app." });
      return null;
    }
    set({ status: "checking", error: "" });
    try {
      const info = await invokeSafe<UpdateInfo>("check_update");
      if (!info) return null;
      set({ info, status: info.newer ? "available" : "uptodate", checkedAt: Date.now() });
      if (manual && !info.newer) useStore.getState().flash(`You're on the latest version (${info.current})`);
      return info;
    } catch (e) {
      set({ status: "error", error: String(e) });
      if (manual) useStore.getState().flash("Update check failed: " + e);
      return null;
    }
  },

  async install() {
    const info = get().info;
    if (!info?.asset_url) {
      set({ status: "error", error: "This release has no app file to install. Download it from the GitHub page." });
      return;
    }
    set({ status: "installing", error: "" });
    try {
      // On success the app closes and the new version starts by itself.
      await invokeSafe("install_update", { url: info.asset_url, sha256: info.asset_sha256 });
    } catch (e) {
      set({ status: "error", error: String(e) });
      useStore.getState().flash("Update failed: " + e);
    }
  },
}));

/** On startup: check GitHub, and install straight away if automatic updates are on. */
export async function startupUpdateCheck() {
  if (!isTauri) return;
  const prefs = await invokeSafe<{ auto_update: boolean }>("get_prefs").catch(() => null);
  const info = await useUpdates.getState().check(false);
  if (!info?.newer) return;
  if (prefs?.auto_update && info.asset_url) {
    useStore.getState().flash(`Updating to ${info.latest}… the app will restart`);
    setTimeout(() => useUpdates.getState().install(), 2500);
  } else {
    useStore.getState().flash(`Version ${info.latest} is available. Open App settings to update.`);
  }
}
