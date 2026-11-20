import { useRef } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { Heading1, Heading2, Heading3, List, ListOrdered, ListChecks, Quote, Code, Minus, CalendarDays, Link2, Pilcrow } from "lucide-react";
import { useKeepOnScreen } from "../components/ui";

export interface SlashState {
  /** Document position of the "/" character. */
  from: number;
  query: string;
  x: number;
  y: number;
  index: number;
}

interface SlashCommand {
  id: string;
  label: string;
  hint: string;
  keywords: string;
  icon: typeof List;
  run(e: Editor, range: { from: number; to: number }): void;
}

const today = () => new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "text", label: "Text", hint: "Plain paragraph", keywords: "paragraph normal", icon: Pilcrow, run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { id: "h1", label: "Heading 1", hint: "Big section title", keywords: "title h1 heading", icon: Heading1, run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run() },
  { id: "h2", label: "Heading 2", hint: "Medium heading", keywords: "subtitle h2 heading", icon: Heading2, run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
  { id: "h3", label: "Heading 3", hint: "Small heading", keywords: "h3 heading", icon: Heading3, run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
  { id: "bullets", label: "Bullet list", hint: "Simple list", keywords: "ul unordered list dots", icon: List, run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { id: "numbers", label: "Numbered list", hint: "1, 2, 3…", keywords: "ol ordered list numbers", icon: ListOrdered, run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { id: "todo", label: "Checklist", hint: "Tick boxes", keywords: "todo task checkbox check list", icon: ListChecks, run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { id: "quote", label: "Quote", hint: "Indented quote", keywords: "blockquote citation", icon: Quote, run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { id: "code", label: "Code block", hint: "Monospace block", keywords: "pre snippet code", icon: Code, run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { id: "divider", label: "Divider", hint: "Horizontal line", keywords: "hr line separator rule", icon: Minus, run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
  { id: "date", label: "Today's date", hint: today(), keywords: "date today now time", icon: CalendarDays, run: (e, r) => e.chain().focus().deleteRange(r).insertContent(today() + " ").run() },
  { id: "link", label: "Link to card", hint: "Type [[name]]", keywords: "wiki link card board reference", icon: Link2, run: (e, r) => e.chain().focus().deleteRange(r).insertContent("[[]]").setTextSelection(r.from + 2).run() },
];

export function filterSlash(q: string) {
  const s = q.toLowerCase();
  if (!s) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => c.label.toLowerCase().includes(s) || c.keywords.includes(s));
}

/** Read the "/query" right before the cursor, if any. */
export function readSlash(editor: Editor): Omit<SlashState, "index"> | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;
  const $from = selection.$from;
  if ($from.parent.type.name === "codeBlock") return null;
  const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 40), $from.parentOffset, undefined, "￼");
  const m = /(?:^|\s)\/([\w-]{0,20})$/.exec(before);
  if (!m) return null;
  const from = $from.pos - m[1].length - 1;
  const c = editor.view.coordsAtPos($from.pos);
  return { from, query: m[1], x: c.left, y: c.bottom + 4 };
}

export function SlashMenu({ state, onPick }: { state: SlashState; onPick(cmd: SlashCommand): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useKeepOnScreen(ref);
  const items = filterSlash(state.query);
  if (!items.length) return null;
  return createPortal(
    <div ref={ref} className="pop slash-menu" style={{ left: state.x, top: state.y }} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <div className="menu-label">Insert</div>
      {items.map((c, i) => (
        <button key={c.id} className={"slash-item" + (i === state.index % items.length ? " on" : "")} onClick={() => onPick(c)}>
          <span className="slash-ic"><c.icon size={15} /></span>
          <span><b>{c.label}</b><small>{c.hint}</small></span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
