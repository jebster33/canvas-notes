import { useEffect } from "react";
import { create } from "zustand";
import { X, Settings } from "lucide-react";
import { AppSettings } from "./AppSettings";

export const useAppSettingsDialog = create<{ open: boolean; set(v: boolean): void }>((set) => ({ open: false, set: (open) => set({ open }) }));

/** App-wide settings (updates, reminders, tray, quick capture) in a window of their own. */
export function AppSettingsDialog() {
  const open = useAppSettingsDialog((s) => s.open);
  const setOpen = useAppSettingsDialog((s) => s.set);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [open, setOpen]);
  if (!open) return null;
  return (
    <div className="scrim app-settings-scrim" onPointerDown={() => setOpen(false)}>
      <div className="pop app-settings" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="dialog" aria-label="App settings">
        <div className="sp-head">
          <h3><Settings size={15} />App settings</h3>
          <button className="btn icon" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="sp-body"><AppSettings /></div>
      </div>
    </div>
  );
}
