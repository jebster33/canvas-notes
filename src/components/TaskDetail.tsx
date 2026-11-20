import { useEffect, useState } from "react";
import { X, LayoutDashboard, Trash2, Bell, Calendar, User, Flag, Tag, MessageSquare, AlignLeft, Plus, Check } from "lucide-react";
import { useStore } from "../lib/store";
import type { Priority, Reminder, TaskData } from "../lib/types";
import { PRIORITY, StatusPicker, ProgressBar } from "../cards/TaskBody";
import { RichText } from "../cards/RichText";
import { statusMeta, withProgress, withStatus } from "../lib/status";
import { patchNodeIn, deleteNodeIn } from "../lib/taskops";
import { describeDue } from "../lib/reminders";
import { boardTags, tagColor } from "../lib/tags";
import { openCard } from "./NotificationCenter";

function when(t: number) {
  const d = Date.now() - t;
  if (d < 60e3) return "just now";
  if (d < 3600e3) return `${Math.floor(d / 60e3)} min ago`;
  if (d < 86400e3) return `${Math.floor(d / 3600e3)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Trello-style card detail shown over the Board / Calendar / Timeline views. */
export function TaskDetail() {
  const ref = useStore((s) => s.taskDetail);
  const board = useStore((s) => (ref ? s.boards[ref.boardId] : undefined));
  const node = board?.nodes.find((n) => n.id === ref?.nodeId);
  const close = useStore((s) => s.closeTask);
  const [editDesc, setEditDesc] = useState(false);
  const [comment, setComment] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    setEditDesc(false);
    setConfirmDel(false);
  }, [ref?.nodeId]);
  useEffect(() => {
    if (!ref) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editDesc) { e.stopPropagation(); close(); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [ref, close, editDesc]);

  if (!ref || !board || !node?.task) return null;
  const t = node.task;
  const st = statusMeta(board, t.status);
  const setTask = (p: Partial<TaskData>) => patchNodeIn(board.id, node.id, (n) => ({ task: { ...n.task!, ...p } }));
  const setNode = (p: Parameters<typeof patchNodeIn>[2]) => patchNodeIn(board.id, node.id, p);
  const overdue = !!t.due && !st.done && new Date(`${t.due}T${t.time || "23:59"}`) < new Date();
  const tags = node.tags ?? [];
  const allTags = boardTags(board).filter((x) => !tags.includes(x));
  const addTag = (name: string) => {
    const v = name.trim().replace(/^#/, "");
    if (v) setNode((n) => ({ tags: [...new Set([...(n.tags ?? []), v])] }));
    setTagDraft("");
  };
  const addComment = () => {
    const v = comment.trim();
    if (!v) return;
    setNode((n) => ({ comments: [...n.comments, { id: Math.random().toString(36).slice(2, 10), text: v, at: Date.now(), resolved: false }] }));
    setComment("");
  };

  return (
    <div className="scrim td-scrim" onPointerDown={close}>
      <div className="pop td" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="dialog" aria-label={node.title || "Task"}>
        <i className="td-stripe" style={{ background: st.color }} />
        <div className="td-top">
          <StatusPicker board={board} value={t.status} onChange={(id) => setTask(withStatus(board, t.progress, id))} />
          <span className="td-where"><i style={{ background: board.color }} />{board.name}</span>
          <button className="btn icon" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>
        <input
          className="td-title"
          value={node.title}
          placeholder="Task name"
          onChange={(e) => patchNodeIn(board.id, node.id, { title: e.target.value })}
          onFocus={() => board.id === useStore.getState().activeId && useStore.getState().beginGesture()}
          onBlur={() => useStore.getState().endGesture()}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        {t.due && <div className={"td-due" + (overdue ? " hot" : "")}><Bell size={12} />{describeDue(node)}</div>}

        <div className="td-body">
          <div className="td-main">
            <div className="td-progress">
              <ProgressBar value={t.progress} color={st.color} onChange={(p) => setTask(withProgress(board, t.status, p))} />
            </div>

            <div className="td-section"><AlignLeft size={14} />Description</div>
            <div className={"td-desc" + (editDesc ? " editing" : "")} onClick={() => !editDesc && setEditDesc(true)}>
              <RichText nodeId={node.id} html={node.html} editing={editDesc} placeholder="Add more detail…" onChange={(html) => setNode({ html })} />
            </div>
            {editDesc && <button className="btn solid td-save" onClick={() => setEditDesc(false)}><Check size={14} />Done</button>}

            <div className="td-section"><MessageSquare size={14} />Comments</div>
            <div className="td-compose">
              <textarea
                className="field"
                placeholder="Write a comment…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
              />
              {comment.trim() && <button className="btn solid" onClick={addComment}>Comment</button>}
            </div>
            {[...node.comments].reverse().map((c) => (
              <div key={c.id} className={"comment" + (c.resolved ? " resolved" : "")}>
                <div className="c-head">
                  <span>{when(c.at)}</span>
                  <button className={"btn icon" + (c.resolved ? " on" : "")} title={c.resolved ? "Reopen" : "Resolve"}
                    onClick={() => setNode((n) => ({ comments: n.comments.map((x) => (x.id === c.id ? { ...x, resolved: !x.resolved } : x)) }))}><Check size={13} /></button>
                  <button className="btn icon danger" title="Delete comment"
                    onClick={() => setNode((n) => ({ comments: n.comments.filter((x) => x.id !== c.id) }))}><Trash2 size={13} /></button>
                </div>
                <div className="c-text">{c.text}</div>
              </div>
            ))}
          </div>

          <aside className="td-side">
            <label><User size={13} />Owner</label>
            <input className="field" value={t.owner} placeholder="Unassigned" onChange={(e) => setTask({ owner: e.target.value })} />

            <label><Calendar size={13} />Due</label>
            <div className="td-row">
              <input className="field" type="date" value={t.due} onChange={(e) => setTask({ due: e.target.value })} />
              <input className="field" type="time" value={t.time ?? ""} disabled={!t.due} onChange={(e) => setTask({ time: e.target.value || undefined })} />
            </div>

            <label><Bell size={13} />Reminder</label>
            <select className="field" value={t.remind ?? "due"} disabled={!t.due} onChange={(e) => setTask({ remind: e.target.value as Reminder })}>
              <option value="none">No reminder</option>
              <option value="due">{t.time ? "At due time" : "On the day"}</option>
              <option value="15m">15 minutes before</option>
              <option value="1h">1 hour before</option>
              <option value="1d">1 day before</option>
            </select>

            <label><Calendar size={13} />Start</label>
            <input className="field" type="date" value={t.start ?? ""} onChange={(e) => setTask({ start: e.target.value || undefined })} />

            <label><Flag size={13} />Priority</label>
            <select className="field" value={t.priority} onChange={(e) => setTask({ priority: e.target.value as Priority })} style={{ color: PRIORITY[t.priority].color, fontWeight: 600 }}>
              {(Object.keys(PRIORITY) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
            </select>

            <label><Tag size={13} />Tags</label>
            <div className="td-tags">
              {tags.map((x) => {
                const c = tagColor(board.tagColors, x);
                return (
                  <button key={x} className="tag-chip" style={{ background: c + "26", color: c, borderColor: c + "55", cursor: "pointer" }}
                    title="Remove tag" onClick={() => setNode((n) => ({ tags: (n.tags ?? []).filter((y) => y !== x) }))}>{x} ×</button>
                );
              })}
            </div>
            <div className="td-row">
              <input className="field" list="td-tags" placeholder="Add a tag" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag(tagDraft)} />
              <button className="btn icon" onClick={() => addTag(tagDraft)} aria-label="Add tag"><Plus size={14} /></button>
              <datalist id="td-tags">{allTags.map((x) => <option key={x} value={x} />)}</datalist>
            </div>

            <div className="td-actions">
              <button className="btn solid" onClick={() => { close(); openCard(board.id, node.id); }}><LayoutDashboard size={14} />Go to canvas</button>
              {confirmDel ? (
                <button className="btn outline danger" onClick={() => { deleteNodeIn(board.id, node.id); close(); }}><Trash2 size={14} />Delete for good</button>
              ) : (
                <button className="btn danger" onClick={() => setConfirmDel(true)}><Trash2 size={14} />Delete task</button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
