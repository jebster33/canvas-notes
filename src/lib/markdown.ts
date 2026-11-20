import { marked } from "marked";
import TurndownService from "turndown";
import DOMPurify from "dompurify";
import type { Board, CardNode } from "./types";
import { evaluateTable } from "./formula";
import { full, dataRows } from "./table";
import { statusMeta } from "./status";
import { useStore } from "./store";
import { openTextFile, saveTextFile } from "./storage";
import { viewCenter } from "./viewport";

/* ---------------- Markdown → note HTML ---------------- */

/** Markdown → HTML in the editor's format (GFM task lists become checklists). */
export function mdToHtml(md: string): string {
  const raw = marked.parse(md, { gfm: true, breaks: false, async: false }) as string;
  const doc = new DOMParser().parseFromString(`<body>${DOMPurify.sanitize(raw)}</body>`, "text/html");
  for (const li of doc.querySelectorAll("li")) {
    const box = li.querySelector(":scope > input[type=checkbox], :scope > p > input[type=checkbox]");
    if (!box) continue;
    const checked = (box as HTMLInputElement).hasAttribute("checked");
    box.remove();
    const text = li.innerHTML.trim();
    li.setAttribute("data-type", "taskItem");
    li.setAttribute("data-checked", String(checked));
    li.innerHTML = `<label><input type="checkbox"${checked ? ' checked="checked"' : ""}><span></span></label><div>${text.startsWith("<p>") ? text : `<p>${text}</p>`}</div>`;
    li.parentElement?.setAttribute("data-type", "taskList");
  }
  return doc.body.innerHTML;
}

export const looksLikeMarkdown = (t: string) => /^(#{1,6}\s|\s*[-*+]\s\[[ xX]\]\s|\s*[-*+]\s|\d+\.\s|>\s|```)/m.test(t) || /\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)/.test(t);

/* ---------------- note HTML → Markdown ---------------- */

const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });
td.addRule("taskItem", {
  filter: (n) => n.nodeName === "LI" && (n as HTMLElement).getAttribute("data-type") === "taskItem",
  replacement: (content, n) => {
    const done = (n as HTMLElement).getAttribute("data-checked") === "true";
    return `- [${done ? "x" : " "}] ${content.replace(/^\s+|\s+$/g, "").replace(/\n+/g, " ")}\n`;
  },
});
td.addRule("taskCheckbox", { filter: (n) => n.nodeName === "LABEL" && !!(n as HTMLElement).querySelector("input[type=checkbox]"), replacement: () => "" });

export const htmlToMd = (html: string) => (html ? td.turndown(html).trim() : "");

function cardToMd(n: CardNode, b: Board): string {
  const title = n.title || (n.type === "sticky" ? "Sticky note" : n.type[0].toUpperCase() + n.type.slice(1));
  const lines: string[] = [`## ${title}`];
  if (n.tags?.length) lines.push(n.tags.map((t) => `#${t.replace(/\s+/g, "-")}`).join(" "));
  if (n.task) {
    const t = n.task;
    const st = statusMeta(b, t.status);
    lines.push(`- [${st.done ? "x" : " "}] **${st.label}**${t.due ? ` · due ${t.due}${t.time ? " " + t.time : ""}` : ""} · ${t.priority} priority${t.owner ? ` · ${t.owner}` : ""} · ${t.progress}%`);
  }
  if (n.table) {
    const t = full(n.table);
    const vals = evaluateTable(t.cells);
    const rows = t.header ? [0, ...dataRows(t), ...t.rows.map((r, i) => (r.summary ? i : -1)).filter((i) => i >= 0)] : vals.map((_, i) => i);
    const esc = (s: string) => s.replace(/\|/g, "\\|");
    const head = t.header ? vals[0] : t.cols.map((_, i) => `Column ${i + 1}`);
    lines.push(`| ${head.map(esc).join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`);
    for (const r of rows.slice(t.header ? 1 : 0)) lines.push(`| ${vals[r].map(esc).join(" | ")} |`);
  }
  if (n.code?.text) lines.push("```" + n.code.lang, n.code.text, "```");
  if (n.web?.url) lines.push(`[${n.web.title || n.web.url}](${n.web.url})${n.web.description ? `\n\n${n.web.description}` : ""}`);
  if (n.file) lines.push(`Attachment: ${n.file.name}`);
  if (n.link?.boardId) lines.push(`Board link: [[${useStore.getState().boards[n.link.boardId]?.name ?? "board"}]]`);
  const body = htmlToMd(n.html);
  if (body) lines.push(body);
  for (const c of n.comments) lines.push(`> Comment: ${c.text}`);
  return lines.join("\n\n");
}

/** Whole board as Markdown: frames become sections, then loose cards, then connections. */
export function boardToMarkdown(b: Board): string {
  const order = (a: CardNode, c: CardNode) => (Math.abs(a.y - c.y) > 40 ? a.y - c.y : a.x - c.x);
  const frames = b.nodes.filter((n) => n.type === "frame").sort(order);
  const cards = b.nodes.filter((n) => n.type !== "frame").sort(order);
  const inside = (f: CardNode, n: CardNode) => n.x >= f.x && n.y >= f.y && n.x + n.w <= f.x + f.w && n.y + n.h <= f.y + f.h;
  const used = new Set<string>();
  const out: string[] = [`# ${b.name}`];
  for (const f of frames) {
    const kids = cards.filter((n) => !used.has(n.id) && inside(f, n));
    kids.forEach((n) => used.add(n.id));
    out.push(`# ${f.title || "Frame"}`, ...kids.map((n) => cardToMd(n, b)));
  }
  const rest = cards.filter((n) => !used.has(n.id));
  if (frames.length && rest.length) out.push("# Other cards");
  out.push(...rest.map((n) => cardToMd(n, b)));
  const byId = new Map(b.nodes.map((n) => [n.id, n]));
  const conns = b.edges.map((e) => {
    const a = byId.get(e.from), c = byId.get(e.to);
    return a && c ? `- ${a.title || a.type} → ${c.title || c.type}${e.label ? ` (${e.label})` : ""}` : "";
  }).filter(Boolean);
  if (conns.length) out.push("## Connections", conns.join("\n"));
  return out.join("\n\n") + "\n";
}

export async function exportMarkdown(b: Board) {
  const name = (b.name.replace(/[^\w\- ]+/g, "").trim() || "board") + ".md";
  if (await saveTextFile(name, "md", "Markdown", boardToMarkdown(b))) useStore.getState().flash("Exported Markdown");
}

/** Import a Markdown file: each ## section becomes a note card (or one card if there are none). */
export async function importMarkdown() {
  const text = await openTextFile(["md", "markdown", "txt"], "Markdown");
  if (text == null) return;
  const st = useStore.getState();
  const level = /^## /m.test(text) ? "## " : /^# /m.test(text) ? "# " : null;
  const sections: { title: string; body: string }[] = [];
  if (level) {
    const parts = text.split(new RegExp(`^${level.trim()} `, "m"));
    if (parts[0].trim()) sections.push({ title: "Intro", body: parts[0] });
    for (const p of parts.slice(1)) {
      const nl = p.indexOf("\n");
      sections.push({ title: (nl < 0 ? p : p.slice(0, nl)).trim(), body: nl < 0 ? "" : p.slice(nl + 1) });
    }
  } else sections.push({ title: "Imported note", body: text });
  const c = viewCenter();
  const cols = Math.min(4, Math.ceil(Math.sqrt(sections.length)));
  const ids: string[] = [];
  sections.slice(0, 200).forEach((s, i) => {
    const x = c.x + (i % cols) * 340 - (cols - 1) * 170;
    const y = c.y + Math.floor(i / cols) * 300;
    ids.push(st.addNode("note", x, y, { title: s.title.slice(0, 120), html: mdToHtml(s.body), w: 300, h: 260 }));
  });
  st.setEditing(null);
  st.setSel({ nodes: ids });
  st.flash(`Imported ${sections.length} note${sections.length === 1 ? "" : "s"}`);
}
