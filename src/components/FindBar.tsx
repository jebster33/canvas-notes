import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { ChevronRight, ChevronDown, ArrowUp, ArrowDown, X, CaseSensitive, WholeWord, Regex } from "lucide-react";
import { selectBoard, useStore } from "../lib/store";
import type { CardNode } from "../lib/types";
import { full } from "../lib/table";

export const useFind = create<{ open: boolean; replace: boolean; hits: string[]; current: string | null; set(p: Partial<{ open: boolean; replace: boolean; hits: string[]; current: string | null }>): void }>((set) => ({
  open: false,
  replace: false,
  hits: [],
  current: null,
  set: (p) => set(p),
}));

export const openFind = (replace = false) => useFind.getState().set({ open: true, replace });

interface Opts { caseSensitive: boolean; wholeWord: boolean; regex: boolean }

function makeRegex(q: string, o: Opts): RegExp | null {
  if (!q) return null;
  try {
    let src = o.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (o.wholeWord) src = `\\b${src}\\b`;
    return new RegExp(src, o.caseSensitive ? "g" : "gi");
  } catch {
    return null;
  }
}

const htmlText = (html: string) => {
  const d = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return d.body.textContent ?? "";
};

/** Every searchable piece of text on a card. */
function cardTexts(n: CardNode): string[] {
  const out = [n.title, htmlText(n.html)];
  if (n.table) out.push(...full(n.table).cells.flat().filter((c) => !c.startsWith("=")));
  if (n.code) out.push(n.code.text);
  if (n.task?.owner) out.push(n.task.owner);
  if (n.web) out.push(n.web.title, n.web.description);
  if (n.file) out.push(n.file.name);
  for (const c of n.comments) out.push(c.text);
  return out;
}

const countIn = (texts: string[], re: RegExp) => texts.reduce((sum, t) => sum + (t.match(re)?.length ?? 0), 0);

/** Replace inside HTML text nodes only, so tags and attributes are never touched. */
function replaceInHtml(html: string, re: RegExp, by: string) {
  const d = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const walker = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) node.nodeValue = (node.nodeValue ?? "").replace(re, by);
  return d.body.innerHTML;
}

function replaceInCard(n: CardNode, re: RegExp, by: string): Partial<CardNode> {
  const p: Partial<CardNode> = { title: n.title.replace(re, by), html: replaceInHtml(n.html, re, by) };
  if (n.table) {
    const t = full(n.table);
    p.table = { ...t, cells: t.cells.map((row) => row.map((c) => (c.startsWith("=") ? c : c.replace(re, by)))) };
  }
  if (n.code) p.code = { ...n.code, text: n.code.text.replace(re, by) };
  if (n.task) p.task = { ...n.task, owner: n.task.owner.replace(re, by) };
  return p;
}

/** Find & replace across the current board, styled after a code editor's find widget. */
export function FindBar() {
  const { open, replace, set } = useFind();
  const board = useStore(selectBoard);
  const [q, setQ] = useState("");
  const [by, setBy] = useState("");
  const [opts, setOpts] = useState<Opts>({ caseSensitive: false, wholeWord: false, regex: false });
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const re = useMemo(() => makeRegex(q, opts), [q, opts]);
  // One entry per occurrence, in reading order (top-to-bottom, left-to-right).
  const matches = useMemo(() => {
    if (!board || !re) return [] as string[];
    const nodes = [...board.nodes].filter((n) => n.type !== "frame").sort((a, b) => (Math.abs(a.y - b.y) > 40 ? a.y - b.y : a.x - b.x));
    const out: string[] = [];
    for (const n of nodes) {
      const c = countIn(cardTexts(n), re);
      for (let i = 0; i < c; i++) out.push(n.id);
    }
    return out;
  }, [board, re]);

  useEffect(() => {
    if (open) setTimeout(() => (input.current?.focus(), input.current?.select()), 20);
  }, [open, replace]);
  useEffect(() => setIdx(0), [q, opts]);
  useEffect(() => {
    const current = matches[Math.min(idx, matches.length - 1)] ?? null;
    set({ hits: open ? [...new Set(matches)] : [], current: open ? current : null });
  }, [matches, idx, open, set]);

  if (!open || !board) return null;
  const total = matches.length;
  const cur = total ? Math.min(idx, total - 1) : 0;
  const go = (d: number) => {
    if (!total) return;
    const next = (cur + d + total) % total;
    setIdx(next);
    const st = useStore.getState();
    if (st.view !== "canvas") st.setView("canvas");
    useStore.setState({ focus: matches[next] });
  };
  const close = () => {
    set({ open: false, hits: [], current: null });
  };
  const replaceCurrent = () => {
    if (!re || !total) return;
    const id = matches[cur];
    useStore.getState().mutate((d) => {
      const i = d.nodes.findIndex((n) => n.id === id);
      if (i >= 0) d.nodes[i] = { ...d.nodes[i], ...replaceInCard(d.nodes[i], new RegExp(re.source, re.flags), by) };
    });
  };
  const replaceAll = () => {
    if (!re || !total) return;
    const ids = new Set(matches);
    useStore.getState().mutate((d) => {
      d.nodes = d.nodes.map((n) => (ids.has(n.id) ? { ...n, ...replaceInCard(n, new RegExp(re.source, re.flags), by) } : n));
    });
    useStore.getState().flash(`Replaced ${total} match${total === 1 ? "" : "es"}`);
  };
  const toggle = (k: keyof Opts) => setOpts((o) => ({ ...o, [k]: !o[k] }));
  const bad = q && !re;

  return (
    <div className="findbar pop" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") close(); }} role="search">
      <button className="fb-expand" onClick={() => set({ replace: !replace })} title={replace ? "Hide replace" : "Show replace (Ctrl H)"} aria-label="Toggle replace">
        {replace ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      <div className="fb-rows">
        <div className="fb-row">
          <div className={"fb-input" + (bad ? " bad" : "")}>
            <input
              ref={input}
              value={q}
              placeholder="Find"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
                if (e.key === "h" && e.ctrlKey) { e.preventDefault(); set({ replace: true }); }
              }}
            />
            <button className={"fb-opt" + (opts.caseSensitive ? " on" : "")} title="Match case" onClick={() => toggle("caseSensitive")}><CaseSensitive size={15} /></button>
            <button className={"fb-opt" + (opts.wholeWord ? " on" : "")} title="Match whole word" onClick={() => toggle("wholeWord")}><WholeWord size={15} /></button>
            <button className={"fb-opt" + (opts.regex ? " on" : "")} title="Use regular expression" onClick={() => toggle("regex")}><Regex size={14} /></button>
          </div>
          <span className={"fb-count" + (q && !total ? " none" : "")}>{bad ? "Bad pattern" : !q ? "" : total ? `${cur + 1} of ${total}` : "No results"}</span>
          <button className="fb-btn" disabled={!total} onClick={() => go(-1)} title="Previous (Shift Enter)"><ArrowUp size={14} /></button>
          <button className="fb-btn" disabled={!total} onClick={() => go(1)} title="Next (Enter)"><ArrowDown size={14} /></button>
          <button className="fb-btn" onClick={close} title="Close (Esc)"><X size={14} /></button>
        </div>
        {replace && (
          <div className="fb-row">
            <div className="fb-input">
              <input value={by} placeholder="Replace" onChange={(e) => setBy(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.ctrlKey ? replaceAll() : replaceCurrent(); } }} />
            </div>
            <button className="fb-text" disabled={!total} onClick={replaceCurrent} title="Replace in the current card (Enter)">Replace</button>
            <button className="fb-text" disabled={!total} onClick={replaceAll} title="Replace everywhere on this board (Ctrl Enter)">Replace all</button>
          </div>
        )}
      </div>
    </div>
  );
}
