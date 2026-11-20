import type { Board } from "./types";

export const TAG_PALETTE = ["#8B7CF6", "#6EA8FE", "#5EC2B0", "#A3D977", "#F2C66D", "#F2A65A", "#F28B82", "#F5A3D0", "#A5A7B4"];

/** A tag's color: the board's chosen color, or a stable pick from the palette. */
export function tagColor(colors: Board["tagColors"], tag: string) {
  const set = colors?.[tag];
  if (set) return set;
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

/** Every tag used on a board, most used first. */
export function boardTags(b: Board): string[] {
  const count = new Map<string, number>();
  for (const n of b.nodes) for (const t of n.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1);
  for (const t of Object.keys(b.tagColors ?? {})) if (!count.has(t)) count.set(t, 0);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}
