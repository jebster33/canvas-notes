import { useEffect, useMemo, useState } from "react";
import { X, Sparkles, ListChecks, Network, MessageCircleQuestion, FileText, Plus, Copy, FolderOpen, Loader2, Lightbulb } from "lucide-react";
import { useStore } from "../lib/store";
import { ACTIONS, answerText, answerToNote, applyPlan, parsePlan, runAssistant, useAi, type AiAction } from "../lib/assistant";
import { Select } from "./ui";
import { invokeSafe, isTauri, openUrl } from "../lib/storage";
import { mdToHtml } from "../lib/markdown";
import DOMPurify from "dompurify";

const ICONS: Record<AiAction, typeof Sparkles> = { summarize: FileText, brainstorm: Lightbulb, tasks: ListChecks, mindmap: Network, ask: MessageCircleQuestion };

export function AssistantPanel() {
  const ai = useAi();
  const setPanel = useStore((s) => s.setPanel);
  const selCount = useStore((s) => s.sel.nodes.length);
  const flash = useStore((s) => s.flash);
  const [action, setAction] = useState<AiAction>("summarize");
  const [extra, setExtra] = useState("");

  useEffect(() => { if (!ai.detected) ai.detect(); }, [ai]);

  const plan = useMemo(() => (ai.answer ? parsePlan(ai.answer) : null), [ai.answer]);
  const text = ai.answer ? answerText(ai.answer) : "";
  const html = useMemo(() => (text ? DOMPurify.sanitize(mdToHtml(text)) : ""), [text]);
  const meta = ACTIONS.find((a) => a.id === action)!;
  const run = () => runAssistant(action, extra);

  return (
    <aside className="side-panel ai-panel" aria-label="Assistant">
      <div className="sp-head" data-tauri-drag-region>
        <h3><Sparkles size={15} style={{ marginRight: 6, verticalAlign: -2, color: "var(--accent-2)" }} />Assistant</h3>
        <button className="btn icon" title="Close" onClick={() => setPanel("assistant")}><X size={16} /></button>
      </div>
      <div className="sp-body" style={{ paddingTop: 10 }}>
        {!isTauri ? (
          <p className="hint">The assistant runs AI tools installed on your computer, so it works in the desktop app only.</p>
        ) : ai.detected && !ai.tools.length ? (
          <NoTools />
        ) : (
          <>
            <div className="ai-row">
              <label>Use</label>
              <Select className="field" value={ai.tool} options={ai.tools.map((t) => ({ value: t.id, label: t.name }))} onChange={ai.setTool} title="AI tool" />
            </div>
            <div className="ai-row">
              <label>Model</label>
              <input className="field" style={{ flex: 1 }} placeholder="Default from the tool's own settings" value={ai.models[ai.tool] ?? ""}
                onChange={(e) => ai.setModel(ai.tool, e.target.value)} onKeyDown={(e) => e.stopPropagation()} title="Optional. Leave empty to use the tool's default model." />
            </div>
            <p className="hint-sm">Runs on your own {ai.tools.find((t) => t.id === ai.tool)?.name ?? "AI"} sign-in. No API keys, and nothing goes through Canvas Notes servers (there are none).</p>
            <div className="ai-actions">
              {ACTIONS.map((a) => {
                const I = ICONS[a.id];
                return (
                  <button key={a.id} className={"ai-act" + (action === a.id ? " on" : "")} onClick={() => setAction(a.id)} title={a.hint}>
                    <I size={15} />{a.label}
                  </button>
                );
              })}
            </div>
            <p className="hint-sm">{meta.hint}. Working on: <b>{selCount ? `${selCount} selected card${selCount === 1 ? "" : "s"}` : "the whole board"}</b>.</p>
            <textarea
              className="field ai-input"
              rows={action === "ask" ? 4 : 2}
              placeholder={action === "ask" ? "What do you want to know?" : "Extra instructions (optional)"}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run(); }}
            />
            <button className="btn solid ai-go" disabled={ai.busy || !ai.tool} onClick={run}>
              {ai.busy ? <><Loader2 size={14} className="spin" />Thinking… (can take a minute)</> : <><Sparkles size={14} />Run</>}
            </button>
            {ai.error && <div className="ai-err">{ai.error}</div>}
            {ai.answer && (
              <div className="ai-answer">
                {html && <div className="rt" dangerouslySetInnerHTML={{ __html: html }} />}
                {plan && <div className="ai-plan">{plan.cards.length} card{plan.cards.length === 1 ? "" : "s"} ready: {plan.cards.slice(0, 6).map((c) => c.title).filter(Boolean).join(", ")}{plan.cards.length > 6 ? "…" : ""}</div>}
                <div className="ai-btns">
                  {plan && <button className="btn solid" onClick={() => applyPlan(plan)}><Plus size={14} />Add {plan.cards.length} cards</button>}
                  {text && <button className="btn outline" onClick={() => answerToNote(text, meta.label)}><FileText size={14} />Add as note</button>}
                  <button className="btn outline" onClick={() => { navigator.clipboard.writeText(ai.answer); flash("Copied"); }}><Copy size={14} />Copy</button>
                </div>
              </div>
            )}
            <SkillHint />
          </>
        )}
      </div>
    </aside>
  );
}

function NoTools() {
  const detect = useAi((s) => s.detect);
  return (
    <div className="ai-none">
      <p>No AI tool found on this computer. Install one you already pay for, sign in once in a terminal, then check again:</p>
      <ul>
        <li><button className="link-btn" onClick={() => openUrl("https://docs.anthropic.com/en/docs/claude-code")}>Claude Code</button> (<code>claude</code>)</li>
        <li><button className="link-btn" onClick={() => openUrl("https://github.com/openai/codex")}>Codex</button> (<code>codex</code>)</li>
        <li><button className="link-btn" onClick={() => openUrl("https://github.com/google-gemini/gemini-cli")}>Gemini CLI</button> (<code>gemini</code>)</li>
        <li><button className="link-btn" onClick={() => openUrl("https://github.com/superagent-ai/grok-cli")}>Grok CLI</button> (<code>grok</code>)</li>
      </ul>
      <button className="btn outline" onClick={() => detect()}>Check again</button>
    </div>
  );
}

function SkillHint() {
  const flash = useStore((s) => s.flash);
  return (
    <div className="ai-skill">
      <b>Use it from your terminal too</b>
      <p className="hint-sm">Your vault has an <code>.ai</code> folder with instructions (AGENTS.md, CLAUDE.md, GEMINI.md and a Claude skill) so any of these tools understands your boards. Start the tool in that folder.</p>
      <button className="btn outline" onClick={async () => {
        const dir = await invokeSafe<string>("ai_prepare");
        if (dir) { navigator.clipboard.writeText(dir); flash("Folder path copied: " + dir); }
      }}><FolderOpen size={14} />Copy the .ai folder path</button>
    </div>
  );
}
