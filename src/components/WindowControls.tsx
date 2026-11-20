import { useEffect, useState } from "react";
import { isTauri } from "../lib/storage";

type Win = Awaited<ReturnType<typeof getWin>>;
async function getWin() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

/** Minimize / maximize / close, drawn by the app so the title bar can be see-through. */
export function WindowControls() {
  const [win, setWin] = useState<Win | null>(null);
  const [max, setMax] = useState(false);

  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    getWin().then(async (w) => {
      setWin(w);
      setMax(await w.isMaximized());
      unlisten = await w.onResized(async () => setMax(await w.isMaximized()));
    });
    return () => unlisten?.();
  }, []);

  if (!isTauri) return null;
  return (
    <div className="win-ctl" onPointerDown={(e) => e.stopPropagation()}>
      <button aria-label="Minimize" title="Minimize" onClick={() => win?.minimize()}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" strokeWidth="1" /></svg>
      </button>
      <button aria-label={max ? "Restore" : "Maximize"} title={max ? "Restore" : "Maximize"} onClick={() => win?.toggleMaximize()}>
        {max ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="2.5" width="7" height="7" rx="1" />
            <path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9" rx="1.5" /></svg>
        )}
      </button>
      <button className="close" aria-label="Close" title="Close" onClick={() => win?.close()}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1.1" /></svg>
      </button>
    </div>
  );
}
