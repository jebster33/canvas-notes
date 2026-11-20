import { useState } from "react";
import { X, Check, Trash2, MessageSquare, CornerDownLeft } from "lucide-react";
import { selectBoard, useStore } from "../lib/store";
import { TYPE_META } from "../cards/Card";

function when(t: number) {
  const d = Date.now() - t;
  if (d < 60e3) return "just now";
  if (d < 3600e3) return `${Math.floor(d / 60e3)} min ago`;
  if (d < 86400e3) return `${Math.floor(d / 3600e3)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: d > 300 * 86400e3 ? "numeric" : undefined });
}

export function CommentsPanel() {
  const board = useStore(selectBoard)!;
  const sel = useStore((s) => s.sel);
  const { setPanel, addComment, patchComment, removeComment } = useStore.getState();
  const [text, setText] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const node = sel.nodes.length === 1 ? board.nodes.find((n) => n.id === sel.nodes[0]) : undefined;

  const send = () => {
    if (!node || !text.trim()) return;
    addComment(node.id, text.trim());
    setText("");
  };

  const withComments = board.nodes.filter((n) => n.comments.length);

  return (
    <aside className="side-panel" aria-label="Comments">
      <div className="sp-head" data-tauri-drag-region>
        <h3>Comments</h3>
        <button className="btn icon" title="Close" onClick={() => setPanel("comments")}><X size={16} /></button>
      </div>
      {node ? (
        <>
          <div className="c-target">
            {(() => {
              const I = TYPE_META[node.type].icon;
              return <I size={15} />;
            })()}
            <b>{node.title || TYPE_META[node.type].label}</b>
            {node.comments.some((c) => c.resolved) && (
              <button className="btn" style={{ marginLeft: "auto", height: 24 }} onClick={() => setShowResolved((v) => !v)}>
                {showResolved ? "Hide resolved" : "Show resolved"}
              </button>
            )}
          </div>
          <div className="sp-body" style={{ paddingTop: 12 }}>
            {node.comments.filter((c) => showResolved || !c.resolved).length === 0 && (
              <div className="comments-empty">
                <MessageSquare size={22} style={{ opacity: 0.5 }} />
                <p>No comments on this card yet. Add one below.</p>
              </div>
            )}
            {node.comments
              .filter((c) => showResolved || !c.resolved)
              .map((c) => (
                <div key={c.id} className={"comment" + (c.resolved ? " resolved" : "")}>
                  <div className="c-head">
                    <span>{when(c.at)}</span>
                    <button className={"btn icon" + (c.resolved ? " on" : "")} title={c.resolved ? "Reopen" : "Resolve"} onClick={() => patchComment(node.id, c.id, { resolved: !c.resolved })}>
                      <Check size={13} />
                    </button>
                    <button className="btn icon danger" title="Delete comment" onClick={() => removeComment(node.id, c.id)}><Trash2 size={13} /></button>
                  </div>
                  <div className="c-text">{c.text}</div>
                </div>
              ))}
          </div>
          <div className="c-compose">
            <textarea
              className="field"
              placeholder="Write a comment…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && (e.ctrlKey || !e.shiftKey)) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className="btn solid" style={{ alignSelf: "flex-end" }} disabled={!text.trim()} onClick={send}>
              Comment <CornerDownLeft size={13} />
            </button>
          </div>
        </>
      ) : (
        <div className="sp-body" style={{ paddingTop: 12 }}>
          {withComments.length ? (
            <>
              <p style={{ color: "var(--faint)", margin: "4px 0 12px" }}>Select a card to see or add its comments.</p>
              {withComments.map((n) => {
                const open = n.comments.filter((c) => !c.resolved).length;
                return (
                  <button
                    key={n.id}
                    className="comment"
                    style={{ width: "100%", textAlign: "left", cursor: "pointer", display: "block" }}
                    onClick={() => useStore.setState({ focus: n.id })}
                  >
                    <div className="c-head">
                      <span style={{ color: "var(--text)", fontWeight: 600 }}>{n.title || TYPE_META[n.type].label}</span>
                      {open ? `${open} open` : "all resolved"}
                    </div>
                    <div className="c-text" style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {n.comments[n.comments.length - 1].text}
                    </div>
                  </button>
                );
              })}
            </>
          ) : (
            <div className="comments-empty">
              <MessageSquare size={22} style={{ opacity: 0.5 }} />
              <p>Select a card to add a comment. Comments stay off the canvas so your board stays clean.</p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
