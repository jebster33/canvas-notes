import { useEffect, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import type { CardNode } from "../lib/types";
import { readAsset, saveFileBlob } from "../lib/storage";
import { useStore } from "../lib/store";

/** Banner across the top of a card: a color, gradient or image. */
export function CardCover({ cover }: { cover: NonNullable<CardNode["cover"]> }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    if (cover.asset) readAsset(cover.asset).then((u) => live && setSrc(u)).catch(() => live && setSrc(""));
    else setSrc("");
    return () => { live = false; };
  }, [cover.asset]);
  return (
    <div className="card-cover" style={{ background: cover.asset ? undefined : cover.color }}>
      {src && <img src={src} alt="" draggable={false} />}
    </div>
  );
}

export const COVER_COLORS = [
  "#8B7CF6", "#6EA8FE", "#5EC2B0", "#F2C66D", "#F28B82", "#F5A3D0",
  "linear-gradient(135deg,#8B7CF6,#6EA8FE)", "linear-gradient(135deg,#5EC2B0,#A3D977)",
  "linear-gradient(135deg,#F2A65A,#F28B82)", "linear-gradient(135deg,#F5A3D0,#C3B1FF)",
  "linear-gradient(135deg,#22D3EE,#7C5CFF)", "linear-gradient(135deg,#2B2340,#1F2A3D)",
];

export const ICONS = [
  "📌", "⭐", "🔥", "💡", "✅", "📅", "📝", "📚", "🎯", "🚀", "🧠", "💬",
  "🐛", "🔧", "⚙️", "📈", "💰", "🛒", "🎨", "🎵", "🎮", "📷", "✈️", "🏠",
  "❤️", "⚠️", "❓", "🔒", "🌱", "☕", "🍕", "🏆", "👀", "🤝", "🗂️", "🧪",
];

/** Popover content for picking a card's icon and cover. */
export function CoverIconPicker({ ids, close }: { ids: string[]; close(): void }) {
  const st = useStore.getState();
  const first = st.board()?.nodes.find((n) => n.id === ids[0]);
  const [custom, setCustom] = useState("");
  const patchAll = (p: Partial<CardNode>) => st.mutate((d) => { for (const n of d.nodes) if (ids.includes(n.id)) Object.assign(n, p); });
  const pickImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const { asset } = await saveFileBlob(f, "cover");
      patchAll({ cover: { asset } });
      close();
    };
    input.click();
  };
  return (
    <div className="cover-pick">
      <h4>Icon</h4>
      <div className="icon-grid">
        {ICONS.map((i) => (
          <button key={i} className={first?.icon === i ? "on" : ""} onClick={() => patchAll({ icon: i })}>{i}</button>
        ))}
      </div>
      <div className="cover-row">
        <input className="field" placeholder="Any emoji or symbol" maxLength={8} value={custom} onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && custom.trim()) patchAll({ icon: custom.trim() }); }} />
        <button className="btn outline" onClick={() => patchAll({ icon: undefined })}><X size={13} />No icon</button>
      </div>
      <h4>Cover</h4>
      <div className="cover-grid">
        {COVER_COLORS.map((c) => (
          <button key={c} style={{ background: c }} className={first?.cover?.color === c ? "on" : ""} aria-label="Cover color" onClick={() => patchAll({ cover: { color: c } })} />
        ))}
      </div>
      <div className="cover-row">
        <button className="btn outline" onClick={pickImage}><ImagePlus size={14} />Image…</button>
        <button className="btn outline" onClick={() => patchAll({ cover: undefined })}><X size={13} />No cover</button>
      </div>
    </div>
  );
}
