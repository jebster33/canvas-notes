import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { SlashMenu, SLASH_COMMANDS, filterSlash, readSlash, type SlashState } from "./SlashMenu";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import DOMPurify from "dompurify";
import { useEditorBus } from "../lib/editorBus";
import { openWikiLink } from "../lib/wiki";

const extensions = (placeholder: string) => [
  StarterKit,
  Underline,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TaskList,
  TaskItem.configure({ nested: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Placeholder.configure({ placeholder }),
];

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Render [[wiki links]] in stored HTML as clickable spans (text nodes only). */
function withWikiLinks(html: string) {
  return html.replace(/(>[^<]*)/g, (seg) =>
    seg.replace(/\[\[([^\]\n]{1,120})\]\]/g, (_, name: string) => `<span class="wikilink" data-wiki="${escapeAttr(name)}">${name}</span>`),
  );
}

interface Props {
  nodeId: string;
  html: string;
  editing: boolean;
  placeholder?: string;
  onChange(html: string): void;
  className?: string;
}

export function RichText({ nodeId, html, editing, placeholder = "Write something…", onChange, className = "" }: Props) {
  if (editing) return <LiveEditor html={html} onChange={onChange} placeholder={placeholder} className={className} />;
  return <StaticHtml nodeId={nodeId} html={html} onChange={onChange} placeholder={placeholder} className={className} />;
}

function StaticHtml({ nodeId, html, onChange, placeholder, className }: { nodeId: string; html: string; onChange(h: string): void; placeholder: string; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Sanitize: board files can be shared, so stored HTML must never run scripts or event handlers.
  const rendered = useMemo(() => DOMPurify.sanitize(withWikiLinks(html), { FORBID_TAGS: ["style", "form", "iframe", "object", "embed"], FORBID_ATTR: ["srcdoc"] }), [html]);
  const empty = !html || html === "<p></p>";
  return (
    <div
      ref={ref}
      className={"rt " + className}
      onPointerDown={(e) => {
        // Checkboxes and wiki links act immediately without entering edit mode.
        const t = e.target as HTMLElement;
        if (t.matches('input[type="checkbox"]') || t.closest(".wikilink")) e.stopPropagation();
      }}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        const wiki = t.closest<HTMLElement>(".wikilink");
        if (wiki) {
          e.stopPropagation();
          openWikiLink(wiki.dataset.wiki!, nodeId);
          return;
        }
        if (t.matches('input[type="checkbox"]')) {
          e.preventDefault();
          e.stopPropagation();
          const li = t.closest("li[data-checked]");
          if (!li || !ref.current) return;
          const on = li.getAttribute("data-checked") !== "true";
          li.setAttribute("data-checked", String(on));
          const box = t as HTMLInputElement;
          if (on) box.setAttribute("checked", "checked");
          else box.removeAttribute("checked");
          // Strip wiki-link spans back to [[text]] before saving.
          const clone = ref.current.cloneNode(true) as HTMLElement;
          clone.querySelectorAll<HTMLElement>(".wikilink").forEach((s) => s.replaceWith(`[[${s.dataset.wiki}]]`));
          onChange(clone.innerHTML);
        }
      }}
      {...(empty
        ? { children: <p style={{ opacity: 0.35, margin: 0 }}>{placeholder}</p> }
        : { dangerouslySetInnerHTML: { __html: rendered } })}
    />
  );
}

function LiveEditor({ html, onChange, placeholder, className }: { html: string; onChange(h: string): void; placeholder: string; className: string }) {
  const setBus = useEditorBus((s) => s.set);
  const bump = useEditorBus((s) => s.bump);
  const latest = useRef(html);
  const [slash, setSlash] = useState<SlashState | null>(null);
  const slashRef = useRef<SlashState | null>(null);
  slashRef.current = slash;
  const editorRef = useRef<Editor | null>(null);
  const pickSlash = (cmd: (typeof SLASH_COMMANDS)[number]) => {
    const ed = editorRef.current, st = slashRef.current;
    if (!ed || !st) return;
    cmd.run(ed, { from: st.from, to: ed.state.selection.from });
    setSlash(null);
  };
  const syncSlash = (ed: Editor) => {
    const found = readSlash(ed);
    setSlash((prev) => (found ? { ...found, index: prev && prev.from === found.from ? prev.index : 0 } : null));
  };
  const editor = useEditor({
    extensions: extensions(placeholder),
    content: html,
    autofocus: "end",
    editorProps: {
      attributes: { class: "rt " + className, spellcheck: "true" },
      // While the "/" menu is open, arrows/Enter/Tab/Esc drive the menu instead of the text.
      handleKeyDown: (_view, e) => {
        const st = slashRef.current;
        if (!st) return false;
        const items = filterSlash(st.query);
        if (!items.length) return false;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          const d = e.key === "ArrowDown" ? 1 : -1;
          setSlash({ ...st, index: (st.index + d + items.length) % items.length });
          return true;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          pickSlash(items[st.index % items.length]);
          return true;
        }
        if (e.key === "Escape") {
          setSlash(null);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      latest.current = editor.getHTML();
      syncSlash(editor);
      bump();
    },
    onSelectionUpdate: ({ editor }) => {
      syncSlash(editor);
      bump();
    },
  });
  editorRef.current = editor;

  useEffect(() => {
    if (!editor) return;
    setBus(editor);
    return () => {
      setBus(null);
    };
  }, [editor, setBus]);

  // Commit on unmount (leaving edit mode) and periodically while typing.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const committed = useRef(html);
  useEffect(() => {
    const commit = () => {
      if (latest.current === committed.current) return;
      committed.current = latest.current;
      onChangeRef.current(latest.current);
    };
    const t = window.setInterval(commit, 1200);
    return () => {
      clearInterval(t);
      commit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !slashRef.current) return;
        e.stopPropagation();
      }}
      style={{ height: "100%", userSelect: "text" }}
    >
      <EditorContent editor={editor} />
      {slash && <SlashMenu state={slash} onPick={pickSlash} />}
    </div>
  );
}
