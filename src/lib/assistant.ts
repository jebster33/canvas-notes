/**
 * The AI assistant: builds a prompt from the board, runs one of the user's
 * own AI command-line tools (no API keys), and turns the answer into cards.
 */
import { create } from "zustand";
import type { Board, CardNode, Priority } from "./types";
import { useStore, defaultNode, uid } from "./store";
import { invokeSafe, isTauri } from "./storage";
import { boardToMarkdown, htmlToMd, mdToHtml } from "./markdown";
import { viewCenter } from "./viewport";
import { isoDay } from "./taskops";

export interface AiTool { id: string; name: string; path: string }

export type AiAction = "summarize" | "brainstorm" | "tasks" | "mindmap" | "ask";

export const ACTIONS: { id: AiAction; label: string; hint: string; cards: boolean }[] = [
  { id: "summarize", label: "Summarize", hint: "A short summary of the selection or the whole board", cards: false },
  { id: "brainstorm", label: "Brainstorm", hint: "New idea cards connected to the selected card", cards: true },
  { id: "tasks", label: "Make tasks", hint: "Turn notes into task cards with due dates", cards: true },
  { id: "mindmap", label: "Mind map", hint: "Branch the selected topic into a small mind map", cards: true },
  { id: "ask", label: "Ask", hint: "Ask anything about this board", cards: false },
];

interface AiState {
  tools: AiTool[];
  detected: boolean;
  tool: string;
  busy: boolean;
  answer: string;
  error: string;
  /** Optional model per tool, e.g. a cheaper or newer one. */
  models: Record<string, string>;
  detect(): Promise<void>;
  setTool(id: string): void;
  setModel(tool: string, model: string): void;
}

export const useAi = create<AiState>((set, get) => ({
  tools: [],
  detected: false,
  tool: localStorage.getItem("cn.aiTool") || "",
  busy: false,
  answer: "",
  error: "",
  models: (() => { try { return JSON.parse(localStorage.getItem("cn.aiModels") || "{}"); } catch { return {}; } })(),
  async detect() {
    const tools = (await invokeSafe<AiTool[]>("ai_detect")) ?? [];
    const keep = tools.some((t) => t.id === get().tool) ? get().tool : tools[0]?.id ?? "";
    set({ tools, detected: true, tool: keep });
  },
  setModel(tool, model) {
    const models = { ...get().models, [tool]: model };
    try { localStorage.setItem("cn.aiModels", JSON.stringify(models)); } catch { /* ignore */ }
    set({ models });
  },
  setTool(tool) {
    try { localStorage.setItem("cn.aiTool", tool); } catch { /* ignore */ }
    set({ tool });
  },
}));

const CARD_FORMAT = `Reply with a one-sentence intro, then ONE fenced json block exactly like:
\`\`\`json
{"cards":[{"type":"note","title":"Short title","body":"Markdown"}],"links":[[-1,0]]}
\`\`\`
"type" is note, task or sticky. Tasks may add "due":"YYYY-MM-DD" and "priority":"low|medium|high|critical".
"links" pairs are card indexes; -1 is the selected card.`;

function context(board: Board, selected: CardNode[]) {
  const md = selected.length
    ? selected.map((n) => `## ${n.title || n.type}\n\n${htmlToMd(n.html)}${n.task ? `\n\n(task, due ${n.task.due || "none"})` : ""}`).join("\n\n")
    : boardToMarkdown(board);
  return md.length > 24000 ? md.slice(0, 24000) + "\n\n…(cut short)" : md;
}

export function buildPrompt(action: AiAction, board: Board, selected: CardNode[], extra: string) {
  const subject = selected.length ? `the ${selected.length === 1 ? "selected card" : `${selected.length} selected cards`}` : `the board "${board.name}"`;
  const head = `You are the assistant inside Canvas Notes, a canvas notes app. Today is ${isoDay(new Date())}. Work only from the content below; don't use tools or edit files.`;
  const ask: Record<AiAction, string> = {
    summarize: `Summarize ${subject} in a few short bullet points, then one line on what to do next. Plain Markdown, no json.`,
    brainstorm: `Brainstorm 6 to 8 fresh, specific ideas that build on ${subject}. ${CARD_FORMAT} Link every idea to the selected card with [-1, i].`,
    tasks: `Turn ${subject} into concrete, actionable tasks (3 to 10). Pick sensible due dates from today and priorities. ${CARD_FORMAT} Use type "task"; no links needed.`,
    mindmap: `Make a small mind map for ${subject}: 4 to 6 main branches, each with 1 to 3 sub-ideas. ${CARD_FORMAT} Link each main branch to -1 and each sub-idea to its branch.`,
    ask: `Answer this about ${subject}: ${extra || "What stands out?"}\nIf the user asks for cards, use this format: ${CARD_FORMAT}`,
  };
  const more = extra && action !== "ask" ? `\nExtra instructions from the user: ${extra}` : "";
  return `${head}\n\n${ask[action]}${more}\n\n---- CONTENT ----\n${context(board, selected)}\n---- END ----\n`;
}

export async function runAssistant(action: AiAction, extra: string) {
  const st = useStore.getState();
  const board = st.board();
  const ai = useAi.getState();
  if (!board) return;
  if (!isTauri) { useAi.setState({ error: "The assistant runs your local AI tools, so it only works in the desktop app." }); return; }
  if (!ai.tool) { useAi.setState({ error: "No AI tool found. Install Claude Code, Codex, Gemini CLI or Grok CLI and sign in once." }); return; }
  const selected = board.nodes.filter((n) => st.sel.nodes.includes(n.id));
  useAi.setState({ busy: true, answer: "", error: "" });
  try {
    const answer = await import("@tauri-apps/api/core").then(({ invoke }) => invoke<string>("ai_run", { tool: ai.tool, model: ai.models[ai.tool]?.trim() || null, prompt: buildPrompt(action, board, selected, extra) }));
    useAi.setState({ answer });
  } catch (e) {
    useAi.setState({ error: String(e) });
  } finally {
    useAi.setState({ busy: false });
  }
}

/* ---------------- answer → cards ---------------- */

interface CardSpec { type?: string; title?: string; body?: string; due?: string; priority?: string }
export interface CardPlan { cards: CardSpec[]; links: [number, number][] }

/** Find the json block in an answer, if there is one. */
export function parsePlan(answer: string): CardPlan | null {
  const fenced = answer.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced ?? answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1);
  if (!raw.trim()) return null;
  try {
    const j = JSON.parse(raw);
    if (!Array.isArray(j?.cards) || !j.cards.length) return null;
    const links = Array.isArray(j.links) ? j.links.filter((l: unknown) => Array.isArray(l) && l.length === 2 && l.every((x) => Number.isInteger(x))) : [];
    return { cards: j.cards.slice(0, 40), links };
  } catch {
    return null;
  }
}

/** Text outside the json block (shown to the user). */
export const answerText = (answer: string) => answer.replace(/```(?:json)?[\s\S]*?```/gi, "").trim();

const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];

export function applyPlan(plan: CardPlan) {
  const st = useStore.getState();
  const board = st.board();
  if (!board) return;
  const anchor = board.nodes.find((n) => n.id === st.sel.nodes[0]);
  const z0 = Math.max(0, ...board.nodes.map((n) => n.z)) + 1;
  const made: CardNode[] = [];
  // Ring around the selected card, or a grid at the view center.
  const center = anchor ? { x: anchor.x + anchor.w / 2, y: anchor.y + anchor.h / 2 } : viewCenter();
  const n = plan.cards.length;
  plan.cards.forEach((c, i) => {
    const type = c.type === "task" ? "task" : c.type === "sticky" ? "sticky" : "note";
    const node = defaultNode(type, 0, 0, z0 + i);
    node.title = String(c.title ?? "").slice(0, 120);
    node.html = c.body ? mdToHtml(String(c.body).slice(0, 8000)) : "";
    if (type === "task" && node.task) {
      if (typeof c.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.due)) node.task.due = c.due;
      if (PRIORITIES.includes(c.priority as Priority)) node.task.priority = c.priority as Priority;
    }
    if (anchor) {
      const r = Math.max(anchor.w, anchor.h) / 2 + 260 + (n > 8 ? 120 : 0);
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      node.x = Math.round(center.x + Math.cos(a) * r - node.w / 2);
      node.y = Math.round(center.y + Math.sin(a) * r - node.h / 2);
    } else {
      const cols = Math.min(4, Math.ceil(Math.sqrt(n)));
      node.x = Math.round(center.x + (i % cols) * (node.w + 40) - (cols * (node.w + 40)) / 2);
      node.y = Math.round(center.y + Math.floor(i / cols) * (node.h + 40) - 100);
    }
    made.push(node);
  });
  const idOf = (i: number) => (i === -1 ? anchor?.id : made[i]?.id);
  st.mutate((d) => {
    d.nodes.push(...made);
    for (const [a, b] of plan.links) {
      const from = idOf(a), to = idOf(b);
      if (from && to && from !== to) d.edges.push({ id: uid(), from, to, label: "" });
    }
  });
  st.setSel({ nodes: made.map((m) => m.id) });
  st.flash(`Added ${made.length} card${made.length === 1 ? "" : "s"}`);
}

/** Put a plain answer on the board as one note. */
export function answerToNote(text: string, title = "Assistant") {
  const st = useStore.getState();
  const c = viewCenter();
  st.addNode("note", c.x - 160, c.y - 120, { title, html: mdToHtml(text), w: 340, h: 300 });
  st.setEditing(null);
}
