import {
  Bold, Italic, Underline, Strikethrough, Heading1, Heading2, List, ListOrdered, ListChecks, Quote, Code,
  AlignLeft, AlignCenter, AlignRight, MessageSquare, Copy, Trash2, Network, RotateCcw, Spline, Minus,
  CornerDownRight, ArrowRight, Type, ArrowLeftRight, Highlighter, Check, PaintBucket, Palette,
} from "lucide-react";
import { selectBoard, useStore } from "../lib/store";
import { useEditorBus } from "../lib/editorBus";
import { FONT_OPTIONS, fontValue, INKS, STICKY, SWATCHES, resolveStyle, typeStyle } from "../lib/theme";
import { CardPresetGrid } from "./Presets";
import { ArrangeButton, TagButton, FrameBar } from "./BarExtras";
import { edgeGeometry } from "./EdgeLayer";
import { strokeBounds } from "../lib/geometry";
import { canvasRect } from "../lib/viewport";
import type { Board, CardStyle, EdgeShape } from "../lib/types";
import { NumberField, PopButton, Select, Swatches } from "./ui";

const HIGHLIGHTS = ["#5c4d1a", "#4a2a3a", "#1f3d36", "#23334f", "#3b2f5c"];

function useScreenBox(board: Board) {
  const sel = useStore((s) => s.sel);
  const v = board.viewport;
  let box: { x: number; y: number; w: number; h: number } | null = null;
  const nodes = board.nodes.filter((n) => sel.nodes.includes(n.id));
  if (nodes.length) {
    const x0 = Math.min(...nodes.map((n) => n.x)), y0 = Math.min(...nodes.map((n) => n.y));
    const x1 = Math.max(...nodes.map((n) => n.x + n.w)), y1 = Math.max(...nodes.map((n) => n.y + n.h));
    box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  } else if (sel.strokes.length) {
    const pts = board.strokes.filter((s) => sel.strokes.includes(s.id)).flatMap((s) => s.pts);
    if (pts.length) box = strokeBounds(pts, 6);
  } else if (sel.edges.length) {
    const e = board.edges.find((e) => e.id === sel.edges[0]);
    const a = e && board.nodes.find((n) => n.id === e.from), b = e && board.nodes.find((n) => n.id === e.to);
    if (e && a && b) {
      const { mid } = edgeGeometry(e, a, b, board);
      box = { x: mid.x, y: mid.y - 14, w: 0, h: 28 };
    }
  }
  if (!box) return null;
  const left = box.x * v.zoom + v.x + (box.w * v.zoom) / 2;
  const top = box.y * v.zoom + v.y - 12;
  const below = top < 70;
  return { left, top: below ? (box.y + box.h) * v.zoom + v.y + 12 : top, below };
}

export function SelectionBar() {
  const board = useStore(selectBoard)!;
  const sel = useStore((s) => s.sel);
  const editingId = useStore((s) => s.editingId);
  const graphOpen = useStore((s) => s.graphOpen);
  const boxing = useStore((s) => s.boxing);
  const pos = useScreenBox(board);
  if (!pos || graphOpen || boxing) return null;
  const style: React.CSSProperties = {
    left: Math.max(250, Math.min(pos.left, canvasRect().width - 250)),
    top: pos.top,
    transform: pos.below ? "translate(-50%, 0)" : undefined,
  };
  const content = editingId ? <TextBar /> : sel.nodes.length ? <CardBar board={board} /> : sel.edges.length ? <EdgeBar board={board} /> : sel.strokes.length ? <StrokeBar board={board} /> : null;
  if (!content) return null;
  return (
    <div className="float-bar pop" style={style} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      {content}
    </div>
  );
}

/* ---------------- card styling (whole card) ---------------- */

function CardBar({ board }: { board: Board }) {
  const sel = useStore((s) => s.sel);
  const { styleNodes, duplicateSelection, deleteSelection, setPanel, arrangeTree, setEditing } = useStore.getState();
  const nodes = board.nodes.filter((n) => sel.nodes.includes(n.id));
  const first = nodes[0];
  if (!first) return null;
  const s = resolveStyle(board.theme, first);
  const set = (p: Partial<CardStyle>) => styleNodes(sel.nodes, p);
  const allSticky = nodes.every((n) => n.type === "sticky");
  const overridden = nodes.some((n) => Object.keys(n.style).length);
  const hasKids = nodes.length === 1 && board.edges.some((e) => e.from === first.id);
  const AlignIcon = s.align === "center" ? AlignCenter : s.align === "right" ? AlignRight : AlignLeft;

  if (nodes.every((n) => n.type === "frame")) return <FrameBar board={board} />;

  return (
    <>
      {nodes.length > 1 && (
        <>
          <ArrangeButton ids={sel.nodes} />
          <div className="sep" />
        </>
      )}
      <Select compact className="bar-sel" value={fontValue(s.fontFamily)} options={FONT_OPTIONS()} onChange={(v) => set({ fontFamily: v })} title="Font" minWidth={170} />
      <NumberField className="field size-input" value={s.fontSize} min={8} max={72} onChange={(v) => set({ fontSize: v, titleSize: Math.max(v, Math.round(v * 1.15)) })} />
      <div className="sep" />
      <button className={"btn icon" + (s.bold ? " on" : "")} title="Bold (whole card)" onClick={() => set({ bold: !s.bold })}><Bold size={15} /></button>
      <button className={"btn icon" + (s.italic ? " on" : "")} title="Italic (whole card)" onClick={() => set({ italic: !s.italic })}><Italic size={15} /></button>
      <button className={"btn icon" + (s.underline ? " on" : "")} title="Underline (whole card)" onClick={() => set({ underline: !s.underline })}><Underline size={15} /></button>
      <PopButton title="Alignment" label={<AlignIcon size={15} />}>
        {(close) => (
          <div style={{ display: "flex", gap: 2 }}>
            {(["left", "center", "right"] as const).map((a) => {
              const I = a === "center" ? AlignCenter : a === "right" ? AlignRight : AlignLeft;
              return <button key={a} className={"btn icon" + (s.align === a ? " on" : "")} onClick={() => (set({ align: a }), close())} title={a}><I size={15} /></button>;
            })}
          </div>
        )}
      </PopButton>
      <div className="sep" />
      <PopButton title="Text color" label={<span className="ink-ic">A<i style={{ background: s.textColor }} /></span>}>
        <h4>Text</h4>
        <Swatches colors={allSticky ? ["#2A2414", "#1A1A22", ...INKS.slice(0, 4)] : INKS} value={s.textColor} onChange={(c) => set({ textColor: c })} />
      </PopButton>
      <PopButton title="Card color" label={<span className="color-chip" style={{ background: s.bg }} />}>
        <h4>Fill</h4>
        <Swatches colors={allSticky ? STICKY : SWATCHES} value={s.bg} onChange={(c) => set({ bg: c })} />
        <h4>Accent</h4>
        <Swatches colors={INKS.slice(2)} value={s.accent} onChange={(c) => set({ accent: c })} />
        <h4>Border</h4>
        <Swatches colors={["#2C2D38", "#3A3B48", "#8B7CF6", "#5EC2B0", "#F2C66D", "#F28B82"]} value={s.border} onChange={(c) => set({ border: c ?? "transparent" })} allowNone="No border" />
        <h4>Outline</h4>
        <div className="seg" style={{ marginBottom: 12 }}>
          {[0, 1, 2, 3].map((w) => (
            <button key={w} className={s.borderWidth === w ? "on" : ""} onClick={() => set({ borderWidth: w })}>{w === 0 ? "None" : w + "px"}</button>
          ))}
          {(["dashed", "dotted"] as const).map((st) => (
            <button key={st} className={s.borderStyle === st ? "on" : ""} onClick={() => set({ borderStyle: s.borderStyle === st ? "solid" : st, borderWidth: s.borderWidth || 1 })}>{st === "dashed" ? "Dash" : "Dot"}</button>
          ))}
        </div>
        <h4>Corners</h4>
        <div className="seg">
          {[0, 6, 12, 20, 28].map((r) => (
            <button key={r} className={s.radius === r ? "on" : ""} onClick={() => set({ radius: r })}>{r}</button>
          ))}
        </div>
      </PopButton>
      <PopButton title="Card styles" label={<Palette size={15} />}>
        {(close) => (
          <div className="style-pop">
            <h4>Card styles</h4>
            <CardPresetGrid
              base={typeStyle(board.theme, first.type)}
              onPick={(st) => {
                // A preset replaces the card's own styling rather than stacking on it.
                useStore.getState().mutate((d) => {
                  for (const n of d.nodes) if (sel.nodes.includes(n.id)) n.style = st ? { ...st } : {};
                });
                close();
              }}
            />
          </div>
        )}
      </PopButton>
      <div className="sep" />
      {nodes.length === 1 && (
        <button className="btn icon" title="Comments" onClick={() => setPanel("comments")}><MessageSquare size={15} /></button>
      )}
      {hasKids && (
        <button className="btn icon" title="Arrange connected cards as a tree" onClick={() => arrangeTree(first.id)}><Network size={15} /></button>
      )}
      {nodes.length === 1 && (first.type === "note" || first.type === "sticky" || first.type === "task") && (
        <button className="btn icon" title="Edit text (Enter)" onClick={() => setEditing(first.id)}><Type size={15} /></button>
      )}
      <TagButton board={board} ids={sel.nodes} />
      <button className="btn icon" title="Duplicate (Ctrl D)" onClick={duplicateSelection}><Copy size={15} /></button>
      {overridden && (
        <button className="btn icon" title="Reset to sheet settings" onClick={() => styleNodes(sel.nodes, null)}><RotateCcw size={15} /></button>
      )}
      <button className="btn icon danger" title="Delete (Del)" onClick={deleteSelection}><Trash2 size={15} /></button>
    </>
  );
}

/* ---------------- rich text formatting (while editing) ---------------- */

function TextBar() {
  const editor = useEditorBus((s) => s.editor);
  useEditorBus((s) => s.tick);
  const setEditing = useStore((s) => s.setEditing);
  if (!editor) return <button className="btn" onClick={() => setEditing(null)}><Check size={15} />Done</button>;
  const c = () => editor.chain().focus();
  const B = ({ on, title, onClick, children }: { on: boolean; title: string; onClick(): void; children: React.ReactNode }) => (
    <button className={"btn icon" + (on ? " on" : "")} title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{children}</button>
  );
  const color = editor.getAttributes("textStyle").color as string | undefined;
  return (
    <>
      <B on={editor.isActive("bold")} title="Bold (Ctrl B)" onClick={() => c().toggleBold().run()}><Bold size={15} /></B>
      <B on={editor.isActive("italic")} title="Italic (Ctrl I)" onClick={() => c().toggleItalic().run()}><Italic size={15} /></B>
      <B on={editor.isActive("underline")} title="Underline (Ctrl U)" onClick={() => c().toggleUnderline().run()}><Underline size={15} /></B>
      <B on={editor.isActive("strike")} title="Strikethrough" onClick={() => c().toggleStrike().run()}><Strikethrough size={15} /></B>
      <div className="sep" />
      <B on={editor.isActive("heading", { level: 1 })} title="Heading" onClick={() => c().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></B>
      <B on={editor.isActive("heading", { level: 2 })} title="Subheading" onClick={() => c().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></B>
      <B on={editor.isActive("bulletList")} title="Bullet list" onClick={() => c().toggleBulletList().run()}><List size={15} /></B>
      <B on={editor.isActive("orderedList")} title="Numbered list" onClick={() => c().toggleOrderedList().run()}><ListOrdered size={15} /></B>
      <B on={editor.isActive("taskList")} title="Checklist" onClick={() => c().toggleTaskList().run()}><ListChecks size={15} /></B>
      <B on={editor.isActive("blockquote")} title="Quote" onClick={() => c().toggleBlockquote().run()}><Quote size={15} /></B>
      <B on={editor.isActive("code")} title="Code" onClick={() => c().toggleCode().run()}><Code size={15} /></B>
      <div className="sep" />
      <PopButton title="Text color" label={<span className="ink-ic">A<i style={{ background: color ?? "currentColor" }} /></span>}>
        {(close) => (
          <>
            <h4>Selected text color</h4>
            <Swatches colors={INKS} value={color} allowNone="Default" onChange={(v) => { (v ? c().setColor(v) : c().unsetColor()).run(); close(); }} />
          </>
        )}
      </PopButton>
      <PopButton title="Highlight" label={<Highlighter size={15} />}>
        {(close) => (
          <>
            <h4>Highlight</h4>
            <Swatches colors={HIGHLIGHTS} value={editor.getAttributes("highlight").color} allowNone="None"
              onChange={(v) => { (v ? c().setHighlight({ color: v }) : c().unsetHighlight()).run(); close(); }} />
          </>
        )}
      </PopButton>
      <div className="sep" />
      <button className="btn" onClick={() => setEditing(null)} title="Done (Esc)"><Check size={15} />Done</button>
    </>
  );
}

/* ---------------- connectors ---------------- */

function EdgeBar({ board }: { board: Board }) {
  const sel = useStore((s) => s.sel);
  const { mutate, deleteSelection } = useStore.getState();
  const edges = board.edges.filter((e) => sel.edges.includes(e.id));
  const e = edges[0];
  if (!e) return null;
  const t = board.theme;
  const shape = e.shape ?? t.edgeShape, width = e.width ?? t.edgeWidth, arrow = e.arrow ?? t.edgeArrow;
  const set = (p: Partial<typeof e>) =>
    mutate((d) => {
      for (const x of d.edges) if (sel.edges.includes(x.id)) Object.assign(x, p);
    });
  const shapes: { v: EdgeShape; icon: React.ReactNode; title: string }[] = [
    { v: "curved", icon: <Spline size={15} />, title: "Curved" },
    { v: "straight", icon: <Minus size={15} style={{ transform: "rotate(-35deg)" }} />, title: "Straight" },
    { v: "elbow", icon: <CornerDownRight size={15} />, title: "Elbow" },
  ];
  return (
    <>
      {shapes.map((s) => (
        <button key={s.v} className={"btn icon" + (shape === s.v ? " on" : "")} title={s.title} onClick={() => set({ shape: s.v })}>{s.icon}</button>
      ))}
      <div className="sep" />
      <PopButton title="Line color" label={<span className="color-chip" style={{ background: e.color ?? t.edgeColor, borderRadius: 9 }} />}>
        <h4>Line color</h4>
        <Swatches colors={["#6B6E80", ...INKS.slice(1)]} value={e.color ?? t.edgeColor} onChange={(c) => set({ color: c })} />
        <h4>Thickness</h4>
        <div className="seg">
          {[1, 2, 3, 5].map((w) => (
            <button key={w} className={width === w ? "on" : ""} onClick={() => set({ width: w })}>{w}px</button>
          ))}
        </div>
      </PopButton>
      <button className={"btn icon" + (e.dashed ? " on" : "")} title="Dashed" onClick={() => set({ dashed: !e.dashed })}>
        <svg width="15" height="15" viewBox="0 0 15 15"><path d="M1 7.5h3M6 7.5h3M11 7.5h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
      <button className={"btn icon" + (arrow ? " on" : "")} title="Arrowhead" onClick={() => set({ arrow: !arrow })}><ArrowRight size={15} /></button>
      <button className="btn icon" title="Reverse direction" onClick={() => set({ from: e.to, to: e.from })}><ArrowLeftRight size={15} /></button>
      <button className="btn" title="Add or edit label" onClick={() => window.dispatchEvent(new CustomEvent("cn:edit-edge-label", { detail: e.id }))}>
        <Type size={15} />Label
      </button>
      <div className="sep" />
      {(e.shape || e.color || e.width || e.arrow !== undefined) && (
        <button className="btn icon" title="Reset to sheet settings" onClick={() => set({ shape: undefined, color: undefined, width: undefined, arrow: undefined })}><RotateCcw size={15} /></button>
      )}
      <button className="btn icon danger" title="Delete line" onClick={deleteSelection}><Trash2 size={15} /></button>
    </>
  );
}

/* ---------------- drawings ---------------- */

function StrokeBar({ board }: { board: Board }) {
  const sel = useStore((s) => s.sel);
  const { mutate, deleteSelection } = useStore.getState();
  const strokes = board.strokes.filter((s) => sel.strokes.includes(s.id));
  const s = strokes[0];
  if (!s) return null;
  const set = (p: Partial<typeof s>) =>
    mutate((d) => {
      for (const x of d.strokes) if (sel.strokes.includes(x.id)) Object.assign(x, p);
    });
  const shapes = strokes.some((x) => x.tool === "rect" || x.tool === "ellipse");
  return (
    <>
      <PopButton title="Color" label={<span className="color-chip" style={{ background: s.color, borderRadius: 9 }} />}>
        <h4>Stroke</h4>
        <Swatches colors={INKS} value={s.color} onChange={(c) => set({ color: c })} />
        <h4>Thickness</h4>
        <div className="seg">
          {[2, 3, 5, 8, 12].map((w) => (
            <button key={w} className={s.width === w ? "on" : ""} onClick={() => set({ width: w })}>{w}</button>
          ))}
        </div>
      </PopButton>
      {shapes && (
        <PopButton title="Fill" label={<PaintBucket size={15} />}>
          <h4>Fill</h4>
          <Swatches colors={["#2B2340", "#1F2A3D", "#1E3330", "#33291C", "#3A2228"]} value={s.fill} allowNone="No fill" onChange={(c) => set({ fill: c })} />
        </PopButton>
      )}
      <div className="sep" />
      <button className="btn icon danger" title="Delete drawing" onClick={deleteSelection}><Trash2 size={15} /></button>
    </>
  );
}
