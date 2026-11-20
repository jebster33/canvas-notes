import { useEffect, useRef, useState } from "react";
import { ImagePlus, ArrowUpRight } from "lucide-react";
import type { CardNode } from "../lib/types";
import { selectBoard, useStore } from "../lib/store";
import { readAsset } from "../lib/storage";
import { ingestImage } from "../lib/transfer";
import { RichText } from "./RichText";

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function ImageBody({ node, editing }: { node: CardNode; editing: boolean }) {
  const patchNode = useStore((s) => s.patchNode);
  const [src, setSrc] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const img = node.image!;

  useEffect(() => {
    let live = true;
    if (img.asset) readAsset(img.asset).then((u) => live && setSrc(u)).catch(() => live && setSrc(""));
    else setSrc("");
    return () => void (live = false);
  }, [img.asset]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const { asset, w, h } = await ingestImage(file);
    const width = Math.min(480, Math.max(160, w));
    patchNode(node.id, { image: { ...img, asset }, w: width, h: Math.round((width * h) / w) + (node.html ? 40 : 0) });
  };

  return (
    <>
      <div className="img-wrap">
        {src ? (
          <img src={src} alt={node.title || "Image"} style={{ objectFit: img.fit }} draggable={false} />
        ) : (
          <div className="img-empty">
            <ImagePlus size={22} />
            <span>Paste, drop or</span>
            <button className="btn outline" onPointerDown={stop} onClick={() => input.current?.click()}>Choose image</button>
            <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </div>
        )}
      </div>
      {(editing || (node.html && node.html !== "<p></p>")) && (
        <div className="img-caption">
          <RichText nodeId={node.id} html={node.html} editing={editing} placeholder="Caption" onChange={(html) => patchNode(node.id, { html })} />
        </div>
      )}
    </>
  );
}

export function LinkBody({ node }: { node: CardNode }) {
  const boards = useStore((s) => s.boards);
  const current = useStore(selectBoard);
  const { patchNode, openBoard } = useStore.getState();
  const target = node.link?.boardId ? boards[node.link.boardId] : undefined;
  const others = Object.values(boards).filter((b) => b.id !== current?.id).sort((a, b) => a.order - b.order);

  return (
    <div className="link-body" onPointerDown={stop}>
      {target ? (
        <div className="link-target" onClick={() => openBoard(target.id)} title="Open board">
          <i className="dot" style={{ background: target.color }} />
          <span>{target.name}</span>
          <ArrowUpRight size={14} style={{ marginLeft: "auto", flex: "none" }} />
        </div>
      ) : null}
      <select
        className="field"
        value={node.link?.boardId ?? ""}
        onChange={(e) => {
          const b = boards[e.target.value];
          patchNode(node.id, { link: { boardId: e.target.value }, title: b ? b.name : node.title });
        }}
        style={{ flex: target ? "0 0 32px" : 1, padding: target ? "0 4px" : undefined }}
        title="Choose which board this links to"
      >
        <option value="">{target ? "" : "Link to a board…"}</option>
        {others.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </div>
  );
}
