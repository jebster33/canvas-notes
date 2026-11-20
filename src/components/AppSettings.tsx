import { useEffect, useState } from "react";
import { Bell, Keyboard, MonitorUp, Power, RefreshCw, Download, ExternalLink } from "lucide-react";
import { useUpdates } from "../lib/updates";
import { openUrl } from "../lib/storage";
import { useReminders } from "../lib/reminders";
import { invokeSafe, isTauri } from "../lib/storage";
import { useStore } from "../lib/store";
import { Toggle } from "./ui";

/** Turn "CommandOrControl+Shift+Space" into "Ctrl + Shift + Space". */
const pretty = (s: string) => s.replace("CommandOrControl", "Ctrl").split("+").join(" + ");

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <>
      <div className="row">
        <label>{label}</label>
        <div className="ctl">{children}</div>
      </div>
      {hint && <p className="hint" style={{ margin: "-4px 0 10px", color: "var(--faint)", fontSize: 12 }}>{hint}</p>}
    </>
  );
}

export function AppSettings() {
  const { prefs, setPrefs } = useReminders();
  const flash = useStore((s) => s.flash);
  const [tray, setTray] = useState(true);
  const [autostart, setAutostart] = useState(false);
  const [shortcut, setShortcut] = useState("CommandOrControl+Shift+Space");
  const [recording, setRecording] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [version, setVersion] = useState("");
  const upd = useUpdates();

  useEffect(() => {
    invokeSafe<{ close_to_tray: boolean; capture_shortcut: string; auto_update: boolean; version: string }>("get_prefs").then((p) => {
      if (p) {
        setTray(p.close_to_tray);
        setShortcut(p.capture_shortcut);
        setAutoUpdate(p.auto_update);
        setVersion(p.version);
      }
    });
    if (isTauri) import("@tauri-apps/plugin-autostart").then((a) => a.isEnabled().then(setAutostart)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!recording) return;
    const k = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setRecording(false);
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      const mods = [e.ctrlKey && "CommandOrControl", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean) as string[];
      if (!mods.length) return flash("Use at least one of Ctrl, Alt or Shift");
      const key = e.code.startsWith("Key") ? e.code.slice(3) : e.code.startsWith("Digit") ? e.code.slice(5) : e.code;
      const combo = [...mods, key].join("+");
      setRecording(false);
      try {
        const saved = await invokeSafe<string>("set_capture_shortcut", { shortcut: combo });
        if (saved) setShortcut(saved);
        flash(`Quick capture is now ${pretty(combo)}`);
      } catch (err) {
        flash(String(err));
      }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [recording, flash]);

  const statusLine =
    upd.status === "checking" ? "Checking GitHub…"
    : upd.status === "installing" ? `Downloading ${upd.info?.latest}… the app will restart by itself`
    : upd.status === "available" ? `Version ${upd.info?.latest} is ready to install`
    : upd.status === "uptodate" ? "You're on the latest version"
    : upd.status === "error" ? upd.error
    : "Not checked yet";

  return (
    <>
      <div className="sp-group" style={{ paddingTop: 10 }}>
        <h4><RefreshCw size={14} />Updates</h4>
        <div className={"upd-card" + (upd.status === "available" ? " ready" : "") + (upd.status === "error" ? " bad" : "")}>
          <div className="upd-ver">
            <b>Canvas Notes {version || upd.info?.current || ""}</b>
            <small>{statusLine}</small>
          </div>
          {upd.status === "available" ? (
            <button className="btn solid" onClick={() => upd.install()}><Download size={14} />Install {upd.info?.latest}</button>
          ) : (
            <button className="btn outline" disabled={!isTauri || upd.status === "checking" || upd.status === "installing"} onClick={() => upd.check(true)}>
              <RefreshCw size={14} className={upd.status === "checking" ? "spin" : ""} />Check now
            </button>
          )}
        </div>
        {upd.info?.newer && upd.info.notes && <p className="upd-notes">{upd.info.notes}</p>}
        {upd.info?.page && (
          <button className="link-btn" onClick={() => openUrl(upd.info!.page)}><ExternalLink size={12} /> What's new on GitHub</button>
        )}
        {isTauri && (
          <Row label="Update automatically" hint="When on, new versions install by themselves when the app starts. When off, you're told and can install from here.">
            <Toggle label="Update automatically" on={autoUpdate} onChange={async (v) => { setAutoUpdate(v); await invokeSafe("set_auto_update", { on: v }); }} />
          </Row>
        )}
      </div>
      <div className="sp-group">
        <h4><Bell size={14} />Reminders</h4>
        <p className="hint">Applies to every board. Each task picks when to remind you from its own card.</p>
        <Row label="Due-date reminders"><Toggle label="Reminders" on={prefs.enabled} onChange={(v) => setPrefs({ enabled: v })} /></Row>
        <Row label="Desktop notifications"><Toggle label="Desktop notifications" on={prefs.desktop} onChange={(v) => setPrefs({ desktop: v })} /></Row>
        <Row label="Nudge when overdue"><Toggle label="Overdue nudge" on={prefs.overdue} onChange={(v) => setPrefs({ overdue: v })} /></Row>
        <Row label="Time for all-day tasks" hint="Tasks with a date but no time remind you at this time.">
          <input className="field" type="time" value={prefs.morning} onChange={(e) => setPrefs({ morning: e.target.value || "09:00" })} style={{ width: 110, colorScheme: "dark" }} />
        </Row>
      </div>
      {isTauri ? (
        <>
          <div className="sp-group">
            <h4><MonitorUp size={14} />Keep running</h4>
            <Row label="Close to the system tray" hint="Reminders and quick capture only work while the app runs. Quit from the tray icon.">
              <Toggle label="Close to tray" on={tray} onChange={async (v) => { setTray(v); await invokeSafe("set_close_to_tray", { on: v }); }} />
            </Row>
            <Row label="Start with Windows" hint="Starts quietly in the tray when you sign in.">
              <Toggle
                label="Start with Windows"
                on={autostart}
                onChange={async (v) => {
                  try {
                    const a = await import("@tauri-apps/plugin-autostart");
                    if (v) await a.enable(); else await a.disable();
                    setAutostart(await a.isEnabled());
                  } catch (e) {
                    flash("Couldn't change startup: " + e);
                  }
                }}
              />
            </Row>
          </div>
          <div className="sp-group">
            <h4><Keyboard size={14} />Quick capture</h4>
            <p className="hint">Press this anywhere in Windows to jot a note or task into your Inbox board.</p>
            <Row label="Shortcut">
              <button className={"btn outline" + (recording ? " on" : "")} onClick={() => setRecording(true)}>
                {recording ? "Press keys… (Esc cancels)" : pretty(shortcut)}
              </button>
            </Row>
          </div>
          <div className="sp-group">
            <h4><Power size={14} />Quit</h4>
            <button className="btn outline danger" onClick={() => invokeSafe("quit_app")}>Quit Canvas Notes</button>
          </div>
        </>
      ) : (
        <div className="sp-group"><p className="hint">Tray, startup and quick-capture settings appear in the desktop app.</p></div>
      )}
    </>
  );
}
