import { useState } from "react";
import {
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalSpaceAround, AlignVerticalSpaceAround, LayoutGrid, Tag, Plus, Check, Presentation, Trash2, Copy, LayoutPanelTop,
} from "lucide-react";
import { useStore, type ArrangeMode } from "../lib/store";
import type { Board } from "../lib/types";
import { boardTags, tagColor, TAG_PALETTE } from "../lib/tags";
import { framesInOrder } from "./Presenter";
import { PopButton } from "./ui";

const ARRANGE: { m: ArrangeMode; icon: typeof LayoutGrid; label: string }[] = [
  { m: "left", icon: AlignStartVertical, label: "Align left edges" },
  { m: "hcenter", icon: AlignCenterVertical, label: "Align centers" },
  { m: "right", icon: AlignEndVertical, label: "Align right edges" },
  { m: "top", icon: AlignStartHorizontal, label: "Align tops" },
  { m: "vcenter", icon: AlignCenterHorizontal, label: "Align middles" },
  { m: "bottom", icon: AlignEndHorizontal, label: "Align bottoms" },
  { m: "hspace", icon: AlignHorizontalSpaceAround, label: "Space evenly side to side" },
  { m: "vspace", icon: AlignVerticalSpaceAround, label: "Space evenly top to bottom" },
  { m: "grid", icon: LayoutGrid, label: "Tidy into a grid" },
];

export function ArrangeButton({ ids }: { ids: string[] }) {
  const arrange = useStore((s) => s.arrange);
  return (
    <PopButton title="Align and arrange" label={<LayoutPanelTop size={15} />}>
      <h4>Align</h4>
      <div className="arrange-grid">
        {ARRANGE.slice(0, 6).map(({ m, icon: I, label }) => (
          <button key={m} className="btn icon" title={label} aria-label={label} onClick={() => arrange(ids, m)}><I size={16} /></button>
        ))}
      </div>
      <h4>Arrange</h4>
      <div className="stack">
        {ARRANGE.slice(6).map(({ m, icon: I, label }) => (
          <button key={m} className="btn" onClick={() => arrange(ids, m)}><I size={15} />{label}</button>
        ))}
      </div>
    </PopButton>
  );
}

export function TagButton({ board, ids }: { board: Board; ids: string[] }) {
  const { toggleTag, setTagColor } = useStore.getState();
  const [name, setName] = useState("");
  const all = boardTags(board);
  const nodes = board.nodes.filter((n) => ids.includes(n.id));
  const has = (t: string) => nodes.every((n) => n.tags?.includes(t));
  const add = () => {
    const t = name.trim().replace(/^#/, "");
    if (!t) return;
    toggleTag(ids, t, true);
    setName("");
  };
  return (
    <PopButton title="Tags" label={<Tag size={15} />}>
      <div className="tag-pop">
        <h4>Tags</h4>
        <div className="tag-new">
          <input
            className="field"
            placeholder="New tag, like urgent"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") add();
            }}
          />
          <button className="btn icon" onClick={add} aria-label="Add tag"><Plus size={15} /></button>
        </div>
        {all.length === 0 && <p className="hint-sm">Tags group cards across the board. Filter by them from the top bar.</p>}
        <div className="tag-list">
          {all.map((t) => {
            const c = tagColor(board.tagColors, t);
            const on = has(t);
            return (
              <div key={t} className="tag-row">
                <button className={"tag-toggle" + (on ? " on" : "")} onClick={() => toggleTag(ids, t, !on)}>
                  <span className="tag-check">{on && <Check size={11} />}</span>
                  <span className="tag-chip" style={{ background: c + "26", color: c, borderColor: c + "55" }}>{t}</span>
                </button>
                <div className="tag-colors">
                  {TAG_PALETTE.slice(0, 6).map((col) => (
                    <button key={col} className={"dot-btn" + (c === col ? " on" : "")} style={{ background: col }} aria-label={`Color ${t}`} onClick={() => setTagColor(t, col)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PopButton>
  );
}

const FRAME_COLORS = ["#8B7CF6", "#6EA8FE", "#5EC2B0", "#A3D977", "#F2C66D", "#F28B82", "#F5A3D0", "#A5A7B4"];

export function FrameBar({ board }: { board: Board }) {
  const sel = useStore((s) => s.sel);
  const { mutate, deleteSelection, duplicateSelection, setPresenting, setEditing } = useStore.getState();
  const frames = board.nodes.filter((n) => sel.nodes.includes(n.id));
  const color = frames[0]?.frame?.color ?? "#8B7CF6";
  const order = framesInOrder(board.nodes);
  return (
    <>
      <div className="frame-colors">
        {FRAME_COLORS.map((c) => (
          <button
            key={c}
            className={"dot-btn" + (c === color ? " on" : "")}
            style={{ background: c }}
            aria-label="Frame color"
            onClick={() => mutate((d) => { for (const n of d.nodes) if (sel.nodes.includes(n.id)) n.frame = { color: c }; })}
          />
        ))}
      </div>
      <div className="sep" />
      {frames.length === 1 && <button className="btn" onClick={() => setEditing(frames[0].id)}>Rename</button>}
      <button className="btn" onClick={() => setPresenting(Math.max(0, order.findIndex((f) => f.id === frames[0].id)))}>
        <Presentation size={15} />Present from here
      </button>
      <div className="sep" />
      <button className="btn icon" title="Duplicate frame" onClick={duplicateSelection}><Copy size={15} /></button>
      <button className="btn icon danger" title="Delete frame (cards inside stay)" onClick={deleteSelection}><Trash2 size={15} /></button>
    </>
  );
}
