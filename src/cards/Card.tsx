import { createContext, memo, useContext } from "react";
import {
  FileText, CheckSquare, Table2, Image as ImageIcon, StickyNote, Link2, MessageSquare, Frame, BarChart3, Globe, Code2, Paperclip, Mic,
} from "lucide-react";
import type { Board, CardNode, CardType, Side, Theme } from "../lib/types";
import { resolveStyle, hasOverrides, withOpacity } from "../lib/theme";
import { useStore } from "../lib/store";
import { RichText } from "./RichText";
import { TaskBody } from "./TaskBody";
import { TableBody } from "./TableBody";
import { ImageBody, LinkBody } from "./MediaBodies";
import { ChartBody } from "./ChartBody";
import { WebBody, CodeBody, FileBody, VoiceBody } from "./ExtraBodies";
import { tagColor } from "../lib/tags";

export const TYPE_META: Record<CardType, { label: string; icon: typeof FileText; hint: string; key: string }> = {
  note: { label: "Note", icon: FileText, hint: "Rich text with headings and checklists", key: "N" },
  task: { label: "Task", icon: CheckSquare, hint: "Status, due date, reminders", key: "T" },
  table: { label: "Table", icon: Table2, hint: "Spreadsheet with easy calculations", key: "B" },
  image: { label: "Image", icon: ImageIcon, hint: "Paste, drop or choose a picture", key: "I" },
  sticky: { label: "Sticky", icon: StickyNote, hint: "Quick colored note", key: "S" },
  link: { label: "Board link", icon: Link2, hint: "Jump to another board", key: "K" },
  frame: { label: "Frame", icon: Frame, hint: "Group cards in an area, present it", key: "F" },
  chart: { label: "Chart", icon: BarChart3, hint: "Bar, line or pie from a table", key: "C" },
  web: { label: "Web link", icon: Globe, hint: "Preview of a page or YouTube video", key: "W" },
  code: { label: "Code", icon: Code2, hint: "Code with color highlighting", key: "X" },
  file: { label: "File", icon: Paperclip, hint: "Attach a PDF or any file", key: "U" },
  voice: { label: "Voice note", icon: Mic, hint: "Record and play back audio", key: "Y" },
};

/** Card types whose body draws its own header. */
const NO_HEAD: CardType[] = ["sticky", "image", "web", "file", "voice"];

export type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const RESIZE_DIRS: ResizeDir[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

export interface CanvasApi {
  startDrag(e: React.PointerEvent, node: CardNode): void;
  startResize(e: React.PointerEvent, node: CardNode, dir: ResizeDir): void;
  startConnect(e: React.PointerEvent, node: CardNode, side: Side): void;
}
export const CanvasCtx = createContext<CanvasApi>(null!);

const SIDES: Side[] = ["top", "right", "bottom", "left"];
const handlePos: Record<Side, React.CSSProperties> = {
  top: { left: "50%", top: 0 },
  right: { left: "100%", top: "50%" },
  bottom: { left: "50%", top: "100%" },
  left: { left: 0, top: "50%" },
};

interface Props {
  node: CardNode;
  theme: Theme;
  tagColors: Board["tagColors"];
  selected: boolean;
  editing: boolean;
  dropTarget: boolean;
  dimmed: boolean;
}

function ResizeZones({ node }: { node: CardNode }) {
  const api = useContext(CanvasCtx);
  return (
    <>
      {RESIZE_DIRS.map((d) => (
        <div
          key={d}
          className={"rz rz-" + d}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            api.startResize(e, node, d);
          }}
        />
      ))}
    </>
  );
}

/** Frames: a tinted area with a name tag; dragging the tag moves everything inside. */
const FrameCard = memo(function FrameCard({ node, selected, editing, dimmed }: Pick<Props, "node" | "selected" | "editing" | "dimmed">) {
  const api = useContext(CanvasCtx);
  const { patchNode, setEditing, setSel } = useStore.getState();
  const color = node.frame?.color ?? "#8B7CF6";
  return (
    <div
      data-node={node.id}
      className={"frame" + (selected ? " sel" : "") + (dimmed ? " dimmed" : "")}
      style={{
        left: node.x, top: node.y, width: node.w, height: node.h, zIndex: 1 + Math.min(node.z, 8) / 10,
        background: withOpacity(color, 7), borderColor: withOpacity(color, selected ? 90 : 40),
      }}
    >
      <div
        className="frame-label"
        style={{ color }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          if (!editing) api.startDrag(e, node);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setSel({ nodes: [node.id] });
          setEditing(node.id);
        }}
      >
        <Frame size={12} />
        {editing ? (
          <input
            autoFocus
            defaultValue={node.title}
            onFocus={(e) => e.target.select()}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => {
              patchNode(node.id, { title: e.target.value.trim() || "Frame" });
              setEditing(null);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          <span>{node.title || "Frame"}</span>
        )}
      </div>
      <ResizeZones node={node} />
    </div>
  );
});

export const Card = memo(function Card({ node, theme, tagColors, selected, editing, dropTarget, dimmed }: Props) {
  const api = useContext(CanvasCtx);
  const { patchNode, setEditing, styleNodes, setSel, setPanel } = useStore.getState();
  if (node.type === "frame") return <FrameCard node={node} selected={selected} editing={editing} dimmed={dimmed} />;

  const s = resolveStyle(theme, node);
  const Icon = TYPE_META[node.type].icon;
  const showHead = !NO_HEAD.includes(node.type);
  const openComments = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSel({ nodes: [node.id] });
    if (useStore.getState().panel !== "comments") setPanel("comments");
  };
  const open = node.comments.filter((c) => !c.resolved).length;

  const badges = (node.comments.length > 0 || hasOverrides(node)) && (
    <>
      {node.comments.length > 0 && (
        <button className="badge" onPointerDown={(e) => e.stopPropagation()} onClick={openComments} title="Comments">
          <MessageSquare size={11} />
          {open || node.comments.length}
        </button>
      )}
      {hasOverrides(node) && (
        <button
          className="override-dot"
          title="Styled by hand. Click to reset to sheet settings."
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => styleNodes([node.id], null)}
        />
      )}
    </>
  );

  return (
    <div
      data-node={node.id}
      className={[
        "card", "type-" + node.type, "shadow-" + s.shadow, s.opacity < 100 ? "glass" : "", selected ? "sel" : "",
        editing ? "editing" : "", dropTarget ? "drop-target" : "", dimmed ? "dimmed" : "",
      ].join(" ")}
      style={{
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        zIndex: 10 + node.z,
        background: withOpacity(s.bg, s.opacity ?? 100),
        border: s.borderWidth > 0 ? `${s.borderWidth}px ${s.borderStyle} ${s.border}` : "none",
        ["--pad" as string]: `${s.padding}px`,
        ["--card-accent" as string]: s.accent,
        borderRadius: s.radius,
        color: s.textColor,
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        fontWeight: s.bold ? 650 : undefined,
        fontStyle: s.italic ? "italic" : undefined,
        textDecoration: s.underline ? "underline" : undefined,
        textAlign: s.align,
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        if (editing && (e.target as HTMLElement).closest(".card-body, .img-caption")) return;
        api.startDrag(e, node);
      }}
      onDoubleClick={(e) => {
        const title = (e.target as HTMLElement).closest<HTMLInputElement>(".card-title");
        if (!title && ["table", "link", "chart", "file", "voice"].includes(node.type)) return;
        e.stopPropagation();
        setSel({ nodes: [node.id] });
        setEditing(node.id);
        if (title) setTimeout(() => (title.focus(), title.select()), 40);
      }}
    >
      {showHead && s.accentBar !== "none" && <div className={"accent-bar " + s.accentBar} style={{ background: s.accent }} />}
      <div className="card-inner">
        {showHead && (
          <div className="card-head">
            <Icon size={15} className="type-ic" color={s.accent} />
            <input
              className="card-title"
              value={node.title}
              placeholder="Untitled"
              readOnly={!editing}
              tabIndex={editing ? 0 : -1}
              style={{ fontSize: s.titleSize, textAlign: s.align }}
              onChange={(e) => patchNode(node.id, { title: e.target.value }, false)}
              onFocus={() => useStore.getState().beginGesture()}
              onBlur={() => useStore.getState().endGesture()}
              onPointerDown={(e) => editing && e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
              }}
            />
            <div className="card-badges">{badges}</div>
          </div>
        )}
        {!showHead && badges && <div className="card-badges floating">{badges}</div>}
        {node.tags && node.tags.length > 0 && (
          <div className="card-tags">
            {node.tags.map((t) => {
              const c = tagColor(tagColors, t);
              return <span key={t} className="tag-chip" style={{ background: c + "26", color: c, borderColor: c + "55" }}>{t}</span>;
            })}
          </div>
        )}
        {node.type === "image" ? (
          <ImageBody node={node} editing={editing} />
        ) : (
          <div className="card-body" style={node.type === "sticky" ? { paddingTop: s.padding + 2, fontSize: s.fontSize + 1 } : undefined}>
            {(node.type === "note" || node.type === "sticky") && (
              <RichText
                nodeId={node.id}
                html={node.html}
                editing={editing}
                placeholder={node.type === "sticky" ? "Quick thought…" : "Write something…  Use [[name]] to link"}
                onChange={(html) => patchNode(node.id, { html })}
              />
            )}
            {node.type === "task" && <TaskBody node={node} editing={editing} />}
            {node.type === "table" && <TableBody node={node} selected={selected} />}
            {node.type === "link" && <LinkBody node={node} />}
            {node.type === "chart" && <ChartBody node={node} selected={selected} />}
            {node.type === "web" && <WebBody node={node} selected={selected} />}
            {node.type === "code" && <CodeBody node={node} editing={editing} />}
            {node.type === "file" && <FileBody node={node} />}
            {node.type === "voice" && <VoiceBody node={node} />}
          </div>
        )}
      </div>
      {!editing &&
        SIDES.map((side) => (
          <div
            key={side}
            className="handle"
            style={handlePos[side]}
            title="Drag to connect"
            onPointerDown={(e) => {
              e.stopPropagation();
              api.startConnect(e, node, side);
            }}
          />
        ))}
      <ResizeZones node={node} />
    </div>
  );
});
