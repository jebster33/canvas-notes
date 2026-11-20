import { useEffect, useRef, useState } from "react";
import { FileText, CheckSquare, CornerDownLeft, Inbox } from "lucide-react";

export interface CapturePayload {
  text: string;
  kind: "note" | "task";
  due?: string;
}

async function win() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

/** The quick-capture window: type, Enter, gone. Sends the text to the main window. */
export function CaptureApp() {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"note" | "task">("note");
  const [due, setDue] = useState("");
  const [saved, setSaved] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    document.body.classList.add("capture-body");
    let off: (() => void) | undefined;
    win().then(async (w) => {
      off = await w.onFocusChanged(({ payload: focused }) => {
        if (focused) {
          setSaved(false);
          setTimeout(() => input.current?.focus(), 30);
        } else {
          w.hide();
        }
      });
    });
    return () => off?.();
  }, []);

  const hide = async () => (await win()).hide();
  const submit = async () => {
    const t = text.trim();
    if (!t) return hide();
    const { emitTo } = await import("@tauri-apps/api/event");
    await emitTo("main", "quick-capture", { text: t, kind, due: kind === "task" && due ? due : undefined } satisfies CapturePayload);
    setSaved(true);
    setText("");
    setDue("");
    setTimeout(hide, 450);
  };

  return (
    <div className="capture" data-tauri-drag-region>
      <div className="capture-head" data-tauri-drag-region>
        <Inbox size={14} />
        <span data-tauri-drag-region>{saved ? "Saved to Inbox" : "Quick capture"}</span>
        <div className="seg">
          <button className={kind === "note" ? "on" : ""} onClick={() => setKind("note")}><FileText size={13} />Note</button>
          <button className={kind === "task" ? "on" : ""} onClick={() => setKind("task")}><CheckSquare size={13} />Task</button>
        </div>
      </div>
      <textarea
        ref={input}
        autoFocus
        value={text}
        placeholder={kind === "task" ? "What needs doing?" : "What's on your mind?"}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); hide(); }
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          if (e.key === "Tab") { e.preventDefault(); setKind((k) => (k === "note" ? "task" : "note")); }
        }}
      />
      <div className="capture-foot">
        {kind === "task" && (
          <label className="capture-due">Due <input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        )}
        <span className="capture-hint">Tab switches note/task · Shift Enter new line · Esc closes</span>
        <button className="btn solid" onClick={submit}>Save <CornerDownLeft size={13} /></button>
      </div>
    </div>
  );
}
