import { useEffect, useState } from "react";
import {
  X, Type, LayoutGrid, Spline, Download, Upload, RotateCcw, FolderOpen, AlignLeft, AlignCenter, AlignRight, Minus, CornerDownRight, Square, Palette, Bell, Camera, History,
} from "lucide-react";
import { selectBoard, useStore } from "../lib/store";
import type { CardStyle, CardType, EdgeShape, Theme } from "../lib/types";
import { CARD_TYPES } from "../lib/types";
import { DEFAULT_THEME, FONTS, INKS, STICKY, SWATCHES, applyPreset, typeStyle } from "../lib/theme";
import { BoardPresetGrid, CardPresetGrid, MiniCard } from "./Presets";
import { AppSettings } from "./AppSettings";
import { openExport, openHistory } from "./Dialogs";
import { TYPE_META } from "../cards/Card";
import { exportBoard, exportTheme, importBoardFile, importTheme } from "../lib/transfer";
import { Seg, Swatches, Toggle } from "./ui";

type Tab = "themes" | "text" | "cards" | "canvas" | "lines" | "board" | "app";
type Scope = "all" | CardType;

function Range({ value, min, max, step = 1, onChange, unit = "" }: { value: number; min: number; max: number; step?: number; onChange(v: number): void; unit?: string }) {
  const { beginGesture, endGesture } = useStore.getState();
  return (
    <>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onPointerDown={beginGesture} onPointerUp={endGesture}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="val">{value}{unit}</span>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <label>{label}</label>
      <div className="ctl">{children}</div>
    </div>
  );
}

export function SettingsPanel() {
  const board = useStore(selectBoard)!;
  const vault = useStore((s) => s.vault);
  const { setPanel, setTheme, setTypeStyle, applyThemeToAll, mutate, setVault, renameBoard, recolorBoard } = useStore.getState();
  const [tab, setTab] = useState<Tab>("themes");
  const [scope, setScope] = useState<Scope>("all");
  useEffect(() => {
    const h = (e: Event) => setTab((e as CustomEvent<Tab>).detail);
    window.addEventListener("cn:settings-tab", h);
    return () => window.removeEventListener("cn:settings-tab", h);
  }, []);
  const t = board.theme;

  const cur: CardStyle = scope === "all" ? t.card : typeStyle(t, scope);
  const setCard = (p: Partial<CardStyle>) => (scope === "all" ? setTheme({ card: p as CardStyle }) : setTypeStyle(scope, p));
  const set = (p: Partial<Theme>) => setTheme(p);

  const overridden = board.nodes.filter((n) => Object.keys(n.style).length && (scope === "all" || n.type === scope)).length;
  const edgeOverrides = board.edges.filter((e) => e.shape || e.color || e.width || e.arrow !== undefined).length;

  const tabs: { v: Tab; label: string; icon: React.ReactNode }[] = [
    { v: "themes", label: "Themes", icon: <Palette size={14} /> },
    { v: "text", label: "Text", icon: <Type size={14} /> },
    { v: "cards", label: "Cards", icon: <Square size={14} /> },
    { v: "canvas", label: "Canvas", icon: <LayoutGrid size={14} /> },
    { v: "lines", label: "Lines", icon: <Spline size={14} /> },
    { v: "board", label: "Board", icon: <Download size={14} /> },
    { v: "app", label: "App", icon: <Bell size={14} /> },
  ];

  const scopePicker = (
    <div className="sp-group" style={{ paddingTop: 10 }}>
      <Row label="Applies to">
        <select className="field" value={scope} onChange={(e) => setScope(e.target.value as Scope)} style={{ width: 160 }}>
          <option value="all">All cards</option>
          {CARD_TYPES.map((ct) => (
            <option key={ct} value={ct}>{TYPE_META[ct].label} cards</option>
          ))}
        </select>
      </Row>
      <MiniCard s={cur} className="type-preview" title={scope === "all" ? "Every card" : TYPE_META[scope].label + " card"}>
        <span style={{ fontSize: cur.fontSize }}>Preview of how cards look with these settings.</span>
      </MiniCard>
      {scope !== "all" && t.types[scope] && (
        <button className="btn outline" onClick={() => setTypeStyle(scope, null)}><RotateCcw size={14} />Use the "All cards" style for {TYPE_META[scope].label.toLowerCase()} cards</button>
      )}
    </div>
  );

  const applyGroup = (
    <div className="sp-group">
      <h4>Cards styled by hand</h4>
      <p className="hint">
        {overridden
          ? `${overridden} card${overridden === 1 ? " has" : "s have"} its own styling and ignores these settings.`
          : "No cards have their own styling. Everything follows these settings."}
      </p>
      <button className="btn outline" disabled={!overridden} onClick={() => applyThemeToAll(scope === "all" ? undefined : scope)}>
        <RotateCcw size={14} />Apply settings to {scope === "all" ? "all cards" : `all ${TYPE_META[scope].label.toLowerCase()} cards`}
      </button>
    </div>
  );

  return (
    <aside className="side-panel" aria-label="Sheet settings">
      <div className="sp-head" data-tauri-drag-region>
        <h3>Sheet settings</h3>
        <button className="btn icon" title="Close" onClick={() => setPanel("settings")}><X size={16} /></button>
      </div>
      <div className="sp-tabs">
        {tabs.map((x) => (
          <button key={x.v} className={"btn" + (tab === x.v ? " on" : "")} onClick={() => setTab(x.v)}>{x.icon}{x.label}</button>
        ))}
      </div>
      <div className="sp-body">
        {tab === "text" && (
          <>
            {scopePicker}
            <div className="sp-group">
              <h4>Font</h4>
              <Row label="Typeface">
                <select className="field" value={FONTS.find((f) => f.value === cur.fontFamily)?.value ?? cur.fontFamily} onChange={(e) => setCard({ fontFamily: e.target.value })} style={{ width: 160 }}>
                  {FONTS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
                </select>
              </Row>
              <Row label="Text size"><Range value={cur.fontSize} min={10} max={28} onChange={(v) => setCard({ fontSize: v })} /></Row>
              <Row label="Title size"><Range value={cur.titleSize} min={11} max={40} onChange={(v) => setCard({ titleSize: v })} /></Row>
            </div>
            <div className="sp-group">
              <h4>Style</h4>
              <Row label="Bold"><Toggle label="Bold" on={cur.bold} onChange={(v) => setCard({ bold: v })} /></Row>
              <Row label="Italic"><Toggle label="Italic" on={cur.italic} onChange={(v) => setCard({ italic: v })} /></Row>
              <Row label="Underline"><Toggle label="Underline" on={cur.underline} onChange={(v) => setCard({ underline: v })} /></Row>
              <Row label="Alignment">
                <Seg value={cur.align} onChange={(v) => setCard({ align: v })} options={[
                  { v: "left", label: <AlignLeft size={14} />, title: "Left" },
                  { v: "center", label: <AlignCenter size={14} />, title: "Center" },
                  { v: "right", label: <AlignRight size={14} />, title: "Right" },
                ]} />
              </Row>
            </div>
            <div className="sp-group">
              <h4>Text color</h4>
              <Swatches colors={scope === "sticky" ? ["#2A2414", "#1A1A22", ...INKS] : INKS} value={cur.textColor} onChange={(c) => c && setCard({ textColor: c })} />
            </div>
            {applyGroup}
          </>
        )}

        {tab === "themes" && (
          <>
            <div className="sp-group" style={{ paddingTop: 10 }}>
              <h4>Board themes</h4>
              <p className="hint">Restyles the whole board: canvas, cards, stickies and lines. Ctrl Z undoes it.</p>
              <BoardPresetGrid onPick={(p) => mutate((d) => void (d.theme = applyPreset(d.theme, p)))} />
            </div>
            <div className="sp-group">
              <h4>Card styles for every card</h4>
              <p className="hint">Layered on the board theme. To style one card, select it and use the palette button on its bar.</p>
              <CardPresetGrid
                base={typeStyle(t, "note")}
                onPick={(st) => (st ? setTheme({ card: st as CardStyle }) : setTheme({ card: { ...DEFAULT_THEME.card } }))}
              />
            </div>
          </>
        )}

        {tab === "cards" && (
          <>
            {scopePicker}
            <div className="sp-group">
              <h4>Quick styles</h4>
              <CardPresetGrid
                base={cur}
                onPick={(st) => {
                  if (st) setCard(st);
                  else if (scope === "all") setTheme({ card: { ...DEFAULT_THEME.card } });
                  else setTypeStyle(scope, null);
                }}
              />
            </div>
            <div className="sp-group">
              <h4>Colors</h4>
              <div className="stack">
                <label style={{ color: "var(--muted)" }}>Fill</label>
                <Swatches colors={scope === "sticky" ? STICKY : SWATCHES} value={cur.bg} onChange={(c) => c && setCard({ bg: c })} />
                <label style={{ color: "var(--muted)", marginTop: 8 }}>Accent</label>
                <Swatches colors={INKS.slice(2)} value={cur.accent} onChange={(c) => c && setCard({ accent: c })} />
              </div>
              <Row label="Transparency"><Range value={cur.opacity ?? 100} min={20} max={100} step={5} unit="%" onChange={(v) => setCard({ opacity: v })} /></Row>
            </div>
            <div className="sp-group">
              <h4>Outline</h4>
              <Row label="Thickness"><Range value={cur.borderWidth} min={0} max={4} step={0.5} unit="px" onChange={(v) => setCard({ borderWidth: v })} /></Row>
              <Row label="Line">
                <Seg value={cur.borderStyle} onChange={(v) => setCard({ borderStyle: v, borderWidth: cur.borderWidth || 1 })} options={[
                  { v: "solid", label: "Solid" }, { v: "dashed", label: "Dashed" }, { v: "dotted", label: "Dotted" },
                ]} />
              </Row>
              <div className="stack" style={{ marginTop: 4 }}>
                <label style={{ color: "var(--muted)" }}>Color</label>
                <Swatches colors={["#2C2D38", "#3A3B48", "#5A5C6A", "#8B7CF6", "#6EA8FE", "#5EC2B0", "#F2C66D", "#F28B82"]} value={cur.border} allowNone="Transparent" onChange={(c) => setCard({ border: c ?? "transparent" })} />
              </div>
            </div>
            <div className="sp-group">
              <h4>Shape</h4>
              <Row label="Corner size"><Range value={cur.radius} min={0} max={32} unit="px" onChange={(v) => setCard({ radius: v })} /></Row>
              <Row label="Inner spacing"><Range value={cur.padding} min={6} max={28} unit="px" onChange={(v) => setCard({ padding: v })} /></Row>
              <Row label="Shadow">
                <Seg value={cur.shadow} onChange={(v) => setCard({ shadow: v })} options={[
                  { v: "none", label: "None" }, { v: "soft", label: "Soft" }, { v: "deep", label: "Deep" }, { v: "glow", label: "Glow" },
                ]} />
              </Row>
              <Row label="Accent strip">
                <Seg value={cur.accentBar} onChange={(v) => setCard({ accentBar: v })} options={[
                  { v: "top", label: "Top" }, { v: "left", label: "Left" }, { v: "none", label: "Off" },
                ]} />
              </Row>
            </div>
            {applyGroup}
          </>
        )}

        {tab === "canvas" && (
          <>
            <div className="sp-group">
              <h4>Background</h4>
              <Swatches colors={["#0E0F13", "#08080A", "#121318", "#15131C", "#0F1614", "#17140F", "#1A1A1A"]} value={t.canvasBg} onChange={(c) => c && set({ canvasBg: c })} />
            </div>
            <div className="sp-group">
              <h4>Grid</h4>
              <Row label="Pattern">
                <Seg value={t.grid} onChange={(v) => set({ grid: v })} options={[{ v: "dots", label: "Dots" }, { v: "lines", label: "Lines" }, { v: "none", label: "None" }]} />
              </Row>
              <Row label="Grid color">
                <Swatches colors={["#1E1F26", "#2A2B33", "#383A45", "#2B2550"]} value={t.gridColor} onChange={(c) => c && set({ gridColor: c })} />
              </Row>
              <Row label="Snap cards to grid"><Toggle label="Snap to grid" on={t.snap} onChange={(v) => set({ snap: v })} /></Row>
            </div>
            <div className="sp-group">
              <h4>Navigation</h4>
              <Row label="Scroll wheel">
                <Seg value={t.wheel} onChange={(v) => set({ wheel: v })} options={[{ v: "zoom", label: "Zooms" }, { v: "pan", label: "Moves" }]} />
              </Row>
              <p className="hint" style={{ margin: 0, color: "var(--faint)", fontSize: 12 }}>Hold Ctrl to zoom and Space to drag the canvas, whichever you pick.</p>
            </div>
          </>
        )}

        {tab === "lines" && (
          <>
            <div className="sp-group">
              <h4>New and unstyled lines</h4>
              <Row label="Shape">
                <Seg<EdgeShape> value={t.edgeShape} onChange={(v) => set({ edgeShape: v })} options={[
                  { v: "curved", label: <Spline size={14} />, title: "Curved" },
                  { v: "straight", label: <Minus size={14} style={{ transform: "rotate(-35deg)" }} />, title: "Straight" },
                  { v: "elbow", label: <CornerDownRight size={14} />, title: "Elbow" },
                ]} />
              </Row>
              <Row label="Thickness"><Range value={t.edgeWidth} min={1} max={6} onChange={(v) => set({ edgeWidth: v })} unit="px" /></Row>
              <Row label="Arrowheads"><Toggle label="Arrowheads" on={t.edgeArrow} onChange={(v) => set({ edgeArrow: v })} /></Row>
              <div className="stack" style={{ marginTop: 6 }}>
                <label style={{ color: "var(--muted)" }}>Color</label>
                <Swatches colors={["#6B6E80", "#A5A7B4", ...INKS.slice(2)]} value={t.edgeColor} onChange={(c) => c && set({ edgeColor: c })} />
              </div>
            </div>
            <div className="sp-group">
              <h4>Lines styled by hand</h4>
              <p className="hint">{edgeOverrides ? `${edgeOverrides} line${edgeOverrides === 1 ? "" : "s"} use their own shape, color or thickness.` : "Every line follows these settings."}</p>
              <button className="btn outline" disabled={!edgeOverrides} onClick={() => mutate((d) => d.edges.forEach((e) => { delete e.shape; delete e.color; delete e.width; delete e.arrow; }))}>
                <RotateCcw size={14} />Apply settings to all lines
              </button>
            </div>
          </>
        )}

        {tab === "board" && (
          <>
            <div className="sp-group">
              <h4>This board</h4>
              <Row label="Name">
                <input className="field" defaultValue={board.name} key={board.id} onBlur={(e) => e.target.value.trim() && renameBoard(board.id, e.target.value.trim())} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ width: 170 }} />
              </Row>
              <div className="stack">
                <label style={{ color: "var(--muted)" }}>Color in sidebar and graph</label>
                <Swatches colors={INKS.slice(2)} value={board.color} onChange={(c) => c && recolorBoard(board.id, c)} />
              </div>
              <p className="hint" style={{ marginTop: 12, color: "var(--faint)", fontSize: 12 }}>
                {board.nodes.length} cards, {board.edges.length} lines, {board.strokes.length} drawings, {board.nodes.reduce((a, n) => a + n.comments.length, 0)} comments
              </p>
            </div>
            <div className="sp-group">
              <h4>Export</h4>
              <p className="hint">One file with every card, line, drawing, comment, image and these settings. Open it on any computer with Import board.</p>
              <div className="stack">
                <button className="btn solid" onClick={() => exportBoard(board)}><Download size={14} />Export board</button>
                <button className="btn outline" onClick={() => exportTheme(board)}><Download size={14} />Export settings only</button>
                <button className="btn outline" onClick={openExport}><Camera size={14} />Export as image or PDF</button>
              </div>
            </div>
            <div className="sp-group">
              <h4>Version history</h4>
              <p className="hint">Snapshots are saved automatically every 10 minutes. Roll back or open an old version as a copy.</p>
              <button className="btn outline" onClick={openHistory}><History size={14} />Open version history</button>
            </div>
            <div className="sp-group">
              <h4>Import</h4>
              <div className="stack">
                <button className="btn outline" onClick={importBoardFile}><Upload size={14} />Import board as a new board</button>
                <button className="btn outline" onClick={importTheme}><Upload size={14} />Import settings into this board</button>
              </div>
            </div>
            <div className="sp-group">
              <h4>Reset</h4>
              <button className="btn outline danger" onClick={() => mutate((d) => void (d.theme = structuredClone(DEFAULT_THEME)))}>
                <RotateCcw size={14} />Reset all sheet settings
              </button>
              <p className="hint" style={{ marginTop: 8, color: "var(--faint)", fontSize: 12 }}>Ctrl Z undoes this.</p>
            </div>
            <div className="sp-group">
              <h4>Vault folder</h4>
              <p className="hint" style={{ wordBreak: "break-all", userSelect: "text" }}>{vault}</p>
              <button className="btn outline" onClick={setVault}><FolderOpen size={14} />Open another vault folder</button>
            </div>
          </>
        )}
        {tab === "app" && <AppSettings />}
      </div>
    </aside>
  );
}
