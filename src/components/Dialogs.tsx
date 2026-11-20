import { useEffect, useState } from "react";
import { create } from "zustand";
import { X, Download, History, RotateCcw, Copy, Camera, Image as ImageIcon, FileText } from "lucide-react";
import { toPng } from "html-to-image";
import { selectBoard, useStore } from "../lib/store";
import type { Board } from "../lib/types";
import { listHistory, readHistory, saveBinaryFile, snapshotNow, type SnapshotInfo } from "../lib/storage";
import { strokeBounds } from "../lib/geometry";
import { Seg, Toggle } from "./ui";

type Dialog = "export" | "history" | null;
export const useDialog = create<{ open: Dialog; set(d: Dialog): void }>((set) => ({ open: null, set: (open) => set({ open }) }));
export const openExport = () => useDialog.getState().set("export");
export const openHistory = () => useDialog.getState().set("history");

function Shell({ title, icon, onClose, children, width = 440 }: { title: string; icon: React.ReactNode; onClose(): void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  return (
    <div className="scrim" onPointerDown={onClose}>
      <div className="pop dialog" style={{ width }} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="wiz-head"><b>{icon}{title}</b><button className="btn icon" onClick={onClose} aria-label="Close"><X size={15} /></button></div>
        {children}
      </div>
    </div>
  );
}

export function Dialogs() {
  const open = useDialog((s) => s.open);
  const close = () => useDialog.getState().set(null);
  if (open === "export") return <ExportDialog onClose={close} />;
  if (open === "history") return <HistoryDialog onClose={close} />;
  return null;
}

/* ---------------- export as image / PDF ---------------- */

const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const slug = (s: string) => s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "board";

async function renderPng(board: Board, ids: string[] | null, scale: number, background: boolean) {
  const world = document.querySelector<HTMLElement>(".world");
  if (!world) throw new Error("open the board on the canvas first");
  const nodes = ids ? board.nodes.filter((n) => ids.includes(n.id)) : board.nodes;
  if (!nodes.length && !board.strokes.length) throw new Error("there is nothing to export yet");
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (r: { x: number; y: number; w: number; h: number }) => {
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  };
  nodes.forEach(grow);
  if (!ids) board.strokes.forEach((s) => grow(strokeBounds(s.pts, s.width)));
  const pad = 40;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const w = Math.ceil(x1 - x0), h = Math.ceil(y1 - y0);
  // Cap the output at ~16k px on the long side (browser canvas limit).
  const ratio = Math.min(scale, 16000 / Math.max(w, h));
  const keep = ids ? new Set(ids) : null;
  // While capturing, hide scrollbars and hover-only bits (styles are read from the live page).
  world.classList.add("exporting");
  try {
    return await capture(world, w, h, x0, y0, ratio, background, board, keep);
  } finally {
    world.classList.remove("exporting");
  }
}

async function capture(world: HTMLElement, w: number, h: number, x0: number, y0: number, ratio: number, background: boolean, board: Board, keep: Set<string> | null) {
  const dataUrl = await toPng(world, {
    width: w,
    height: h,
    pixelRatio: ratio,
    backgroundColor: background ? board.theme.canvasBg : undefined,
    imagePlaceholder: PIXEL,
    cacheBust: false,
    style: { transform: `translate(${-x0}px, ${-y0}px)`, transformOrigin: "0 0", left: "0", top: "0" },
    filter: (el) => {
      if (!(el instanceof Element)) return true;
      if (el.classList.contains("handle") || el.classList.contains("rz") || el.classList.contains("marquee")) return false;
      if (!keep) return true;
      const id = el.getAttribute("data-node");
      if (id) return keep.has(id);
      const from = el.getAttribute("data-edge-from");
      if (from) return keep.has(from) && keep.has(el.getAttribute("data-edge-to") ?? "");
      if (el.hasAttribute("data-stroke")) return false;
      return true;
    },
  });
  return { dataUrl, w, h };
}

function ExportDialog({ onClose }: { onClose(): void }) {
  const board = useStore(selectBoard)!;
  const selCount = useStore((s) => s.sel.nodes.length);
  const [what, setWhat] = useState<"board" | "selection">(selCount ? "selection" : "board");
  const [format, setFormat] = useState<"png" | "pdf">("png");
  const [scale, setScale] = useState<"1" | "2" | "3">("2");
  const [bg, setBg] = useState(true);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const st = useStore.getState();
    const ids = what === "selection" ? st.sel.nodes : null;
    const saved = { sel: st.sel, editing: st.editingId };
    setBusy(true);
    // Hide selection outlines and toolbars while drawing the picture.
    useStore.setState({ sel: { nodes: [], edges: [], strokes: [] }, editingId: null, renderAll: true });
    await new Promise((r) => setTimeout(r, 120));
    try {
      const { dataUrl, w, h } = await renderPng(board, ids, Number(scale), bg);
      const name = `${slug(board.name)}${ids ? "-selection" : ""}`;
      let ok: boolean;
      if (format === "png") {
        ok = await saveBinaryFile(`${name}.png`, "png", "PNG image", dataUrl.split(",")[1]);
      } else {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: w >= h ? "landscape" : "portrait", unit: "px", format: [w, h], hotfixes: ["px_scaling"] });
        pdf.addImage(dataUrl, "PNG", 0, 0, w, h, undefined, "FAST");
        ok = await saveBinaryFile(`${name}.pdf`, "pdf", "PDF document", pdf.output("datauristring").split(",")[1]);
      }
      if (ok) {
        st.flash(`Exported ${format.toUpperCase()}`);
        onClose();
      }
    } catch (e) {
      st.flash("Export failed: " + (e as Error).message);
    } finally {
      useStore.setState({ sel: saved.sel, editingId: saved.editing, renderAll: false });
      setBusy(false);
    }
  };

  return (
    <Shell title="Export as image or PDF" icon={<Camera size={15} />} onClose={onClose}>
      <div className="row"><label>What</label><div className="ctl">
        <Seg<"board" | "selection"> value={what} onChange={setWhat} options={[{ v: "board", label: "Whole board" }, { v: "selection", label: selCount ? `Selected (${selCount})` : "Selected" }]} />
      </div></div>
      <div className="row"><label>Format</label><div className="ctl">
        <Seg<"png" | "pdf"> value={format} onChange={setFormat} options={[{ v: "png", label: <><ImageIcon size={13} />PNG</> }, { v: "pdf", label: <><FileText size={13} />PDF</> }]} />
      </div></div>
      <div className="row"><label>Sharpness</label><div className="ctl">
        <Seg<"1" | "2" | "3"> value={scale} onChange={setScale} options={[{ v: "1", label: "1×" }, { v: "2", label: "2×" }, { v: "3", label: "3×" }]} />
      </div></div>
      <div className="row"><label>Canvas background</label><div className="ctl"><Toggle label="Background" on={bg} onChange={setBg} /></div></div>
      <p className="hint-sm">Videos and PDF previews show as blank areas in the picture.</p>
      <div className="wiz-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn solid" disabled={busy || (what === "selection" && !selCount)} onClick={run}>
          <Download size={14} />{busy ? "Exporting…" : `Export ${format.toUpperCase()}`}
        </button>
      </div>
    </Shell>
  );
}

/* ---------------- version history ---------------- */

function HistoryDialog({ onClose }: { onClose(): void }) {
  const board = useStore(selectBoard)!;
  const [list, setList] = useState<SnapshotInfo[] | null>(null);
  const [pick, setPick] = useState<{ ts: number; b: Board } | null>(null);
  const reload = () => listHistory(board.id).then(setList).catch(() => setList([]));
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [board.id]);

  const choose = async (ts: number) => {
    try {
      const b = JSON.parse(await readHistory(board.id, ts)) as Board;
      setPick({ ts, b });
    } catch {
      useStore.getState().flash("That snapshot couldn't be read");
    }
  };
  const restore = async () => {
    if (!pick) return;
    const st = useStore.getState();
    await snapshotNow(board); // so the restore itself can be undone from history
    st.mutate((d) => {
      d.nodes = pick.b.nodes ?? [];
      d.edges = pick.b.edges ?? [];
      d.strokes = pick.b.strokes ?? [];
      d.theme = pick.b.theme ?? d.theme;
      d.tagColors = pick.b.tagColors;
    });
    st.flash("Restored. Ctrl Z undoes it.");
    onClose();
  };
  const copy = () => {
    if (!pick) return;
    useStore.getState().importBoard({ ...pick.b, name: `${board.name} (${new Date(pick.ts).toLocaleString()})` });
    onClose();
  };
  const fmt = (ts: number) => {
    const d = new Date(ts);
    const today = new Date().toDateString() === d.toDateString();
    return today ? `Today ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Shell title={`Version history · ${board.name}`} icon={<History size={15} />} onClose={onClose} width={520}>
      <p className="hint-sm">A snapshot is saved automatically every 10 minutes while you work (the last 60 are kept).</p>
      <div className="hist">
        <div className="hist-list">
          {list === null && <p className="hint-sm">Loading…</p>}
          {list?.length === 0 && <p className="hint-sm">No snapshots yet. Keep working, or save one now.</p>}
          {list?.map((s) => (
            <button key={s.ts} className={"hist-item" + (pick?.ts === s.ts ? " on" : "")} onClick={() => choose(s.ts)}>
              <b>{fmt(s.ts)}</b>
              <small>{(s.size / 1024).toFixed(0)} KB</small>
            </button>
          ))}
        </div>
        <div className="hist-detail">
          {pick ? (
            <>
              <b>{fmt(pick.ts)}</b>
              <ul>
                <li>{pick.b.nodes?.length ?? 0} cards (now {board.nodes.length})</li>
                <li>{pick.b.edges?.length ?? 0} lines (now {board.edges.length})</li>
                <li>{pick.b.strokes?.length ?? 0} drawings (now {board.strokes.length})</li>
              </ul>
              <div className="stack">
                <button className="btn solid" onClick={restore}><RotateCcw size={14} />Restore this version</button>
                <button className="btn outline" onClick={copy}><Copy size={14} />Open it as a new board</button>
              </div>
            </>
          ) : (
            <p className="hint-sm">Pick a snapshot to see what's in it.</p>
          )}
        </div>
      </div>
      <div className="wiz-actions">
        <button className="btn" onClick={async () => { await snapshotNow(board); reload(); useStore.getState().flash("Snapshot saved"); }}>Save a snapshot now</button>
        <button className="btn" onClick={onClose}>Close</button>
      </div>
    </Shell>
  );
}
