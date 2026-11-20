import type { CardNode, CardStyle, CardType, ShadowStyle, Theme } from "./types";

export const FONTS: { label: string; value: string }[] = [
  { label: "Inter", value: "'Inter Variable', Inter, system-ui, sans-serif" },
  { label: "Segoe UI", value: "'Segoe UI', system-ui, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Cambria", value: "Cambria, Georgia, serif" },
  { label: "Cascadia Code", value: "'Cascadia Code', Consolas, monospace" },
  { label: "Consolas", value: "Consolas, monospace" },
  { label: "Trebuchet", value: "'Trebuchet MS', sans-serif" },
  { label: "Comic Sans", value: "'Comic Sans MS', 'Comic Neue', cursive" },
];

/** Card color swatches tuned to stay legible on the graphite canvas. */
export const SWATCHES = [
  "#1B1C23", "#24252E", "#2B2340", "#1F2A3D", "#1E3330", "#33291C", "#3A2228", "#2E2E1C",
];
export const INKS = [
  "#E8E8EF", "#A5A7B4", "#8B7CF6", "#6EA8FE", "#5EC2B0", "#F2C66D", "#F28B82", "#F5A3D0",
];
export const STICKY = ["#F2C66D", "#F5A3D0", "#8BD8BD", "#9BC1FF", "#C3B1FF", "#FFB38A"];

export const DEFAULT_THEME: Theme = {
  card: {
    fontFamily: FONTS[0].value,
    fontSize: 14,
    titleSize: 16,
    textColor: "#E8E8EF",
    bg: "#1B1C23",
    border: "#2C2D38",
    accent: "#8B7CF6",
    radius: 12,
    bold: false,
    italic: false,
    underline: false,
    align: "left",
    shadow: "soft",
    borderWidth: 1,
    borderStyle: "solid",
    padding: 12,
    accentBar: "top",
    opacity: 100,
  },
  types: {
    task: { accent: "#6EA8FE" },
    table: { accent: "#5EC2B0" },
    sticky: { bg: "#F2C66D", textColor: "#2A2414", border: "transparent", radius: 4 },
    link: { accent: "#F5A3D0" },
  },
  canvasBg: "#0E0F13",
  grid: "dots",
  gridColor: "#2A2B33",
  edgeShape: "curved",
  edgeColor: "#6B6E80",
  edgeWidth: 2,
  edgeArrow: true,
  snap: false,
  wheel: "zoom",
};

export function mergeTheme(t: Partial<Theme> | undefined): Theme {
  const base = structuredClone(DEFAULT_THEME);
  if (!t) return base;
  return {
    ...base,
    ...t,
    card: { ...base.card, ...(t.card ?? {}) },
    types: { ...base.types, ...(t.types ?? {}) },
  };
}

/** Boards saved before shadow styles existed stored shadow as true/false. */
function fixLegacy(s: CardStyle): CardStyle {
  const sh = s.shadow as ShadowStyle | boolean;
  if (sh === true) s.shadow = "soft";
  else if (sh === false) s.shadow = "none";
  return s;
}

export function resolveStyle(theme: Theme, node: Pick<CardNode, "type" | "style">): CardStyle {
  return fixLegacy({ ...theme.card, ...(theme.types[node.type] ?? {}), ...node.style });
}

export function typeStyle(theme: Theme, type: CardType): CardStyle {
  return fixLegacy({ ...theme.card, ...(theme.types[type] ?? {}) });
}

/** "#rrggbb" + opacity 0-100 → rgba(); other color strings pass through. */
export function withOpacity(color: string, opacity: number) {
  if (opacity >= 100 || !/^#[0-9a-f]{6}$/i.test(color)) return color;
  const n = parseInt(color.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity / 100})`;
}

/* ---------------- premade looks ---------------- */

export interface BoardPreset {
  id: string;
  name: string;
  /** Colors shown in the preset tile: canvas, card, accent, second accent. */
  preview: [string, string, string, string];
  theme: Omit<Partial<Theme>, "card"> & { card?: Partial<CardStyle> };
}

export const BOARD_PRESETS: BoardPreset[] = [
  { id: "graphite", name: "Graphite", preview: ["#0E0F13", "#1B1C23", "#8B7CF6", "#5EC2B0"], theme: {} },
  {
    id: "midnight", name: "Midnight", preview: ["#0A0F1E", "#121A2E", "#6EA8FE", "#9BC1FF"],
    theme: {
      canvasBg: "#0A0F1E", gridColor: "#1C2540", edgeColor: "#4B5E8A",
      card: { bg: "#121A2E", border: "#22304F", accent: "#6EA8FE", textColor: "#E4EAF7" },
      types: { task: { accent: "#9BC1FF" }, table: { accent: "#5EC2B0" }, sticky: { bg: "#9BC1FF", textColor: "#0D1730", border: "transparent", radius: 4 }, link: { accent: "#C3B1FF" } },
    },
  },
  {
    id: "forest", name: "Forest", preview: ["#0B1210", "#131C19", "#5EC2B0", "#A3D977"],
    theme: {
      canvasBg: "#0B1210", gridColor: "#1C2A25", edgeColor: "#4F7A6C",
      card: { bg: "#131C19", border: "#22332D", accent: "#5EC2B0", textColor: "#E3EFEA" },
      types: { task: { accent: "#A3D977" }, table: { accent: "#5EC2B0" }, sticky: { bg: "#8BD8BD", textColor: "#0F241D", border: "transparent", radius: 4 }, link: { accent: "#E7C66B" } },
    },
  },
  {
    id: "ember", name: "Ember", preview: ["#120E0B", "#1C1612", "#F2A65A", "#F28B82"],
    theme: {
      canvasBg: "#120E0B", gridColor: "#2A211A", edgeColor: "#8A6A4D",
      card: { bg: "#1C1612", border: "#33281F", accent: "#F2A65A", textColor: "#F3E9DF" },
      types: { task: { accent: "#F28B82" }, table: { accent: "#F2C66D" }, sticky: { bg: "#FFB38A", textColor: "#2B160A", border: "transparent", radius: 4 }, link: { accent: "#F5A3D0" } },
    },
  },
  {
    id: "neon", name: "Neon", preview: ["#07070B", "#0E0E18", "#22D3EE", "#F472B6"],
    theme: {
      canvasBg: "#07070B", gridColor: "#16162A", edgeColor: "#7C5CFF",
      card: { bg: "#0E0E18", border: "#2A1F4D", accent: "#22D3EE", textColor: "#EDEBFF", shadow: "glow" },
      types: { task: { accent: "#F472B6" }, table: { accent: "#A3E635" }, sticky: { bg: "#F472B6", textColor: "#1A0B14", border: "transparent", radius: 4 }, link: { accent: "#FACC15" } },
    },
  },
  {
    id: "glass", name: "Glass", preview: ["#0D0E14", "#2A2C3A", "#A597FF", "#6EA8FE"],
    theme: {
      canvasBg: "#0D0E14", grid: "lines", gridColor: "#181A26", edgeColor: "#7A7D96",
      card: { bg: "#2A2C3A", border: "#3E4156", accent: "#A597FF", opacity: 55, radius: 16, shadow: "deep" },
      types: { sticky: { bg: "#C3B1FF", textColor: "#1C1530", border: "transparent", radius: 12, opacity: 80 }, task: { accent: "#6EA8FE" }, table: { accent: "#5EC2B0" }, link: { accent: "#F5A3D0" } },
    },
  },
  {
    id: "mono", name: "Mono outline", preview: ["#000000", "#000000", "#F5F5F5", "#8A8A8A"],
    theme: {
      canvasBg: "#000000", gridColor: "#1A1A1A", edgeColor: "#8A8A8A",
      card: { bg: "#000000", border: "#4A4A4A", borderWidth: 1.5, accent: "#F5F5F5", textColor: "#F5F5F5", radius: 4, shadow: "none", accentBar: "none" },
      types: { sticky: { bg: "#F5F5F5", textColor: "#111111", border: "transparent", radius: 2 }, task: { accent: "#F5F5F5" }, table: { accent: "#F5F5F5" }, link: { accent: "#F5F5F5" } },
    },
  },
  {
    id: "paper", name: "Paper", preview: ["#161616", "#1F1F1F", "#D4B483", "#E9E4DA"],
    theme: {
      canvasBg: "#161616", gridColor: "#262626", edgeColor: "#6B655C",
      card: { bg: "#1F1F1F", border: "#2E2E2E", accent: "#D4B483", textColor: "#E9E4DA", radius: 6, shadow: "none", accentBar: "left", fontFamily: FONTS[2].value, padding: 14 },
      types: { sticky: { bg: "#E9E4DA", textColor: "#1E1B16", border: "transparent", radius: 2 }, task: { accent: "#A8C49A" }, table: { accent: "#9DB4C8" }, link: { accent: "#C99A9A" } },
    },
  },
  {
    id: "pastel", name: "Pastel", preview: ["#121217", "#2B2340", "#C3B1FF", "#8BD8BD"],
    theme: {
      canvasBg: "#121217", gridColor: "#24242E", edgeColor: "#7A7A90",
      card: { bg: "#2B2340", border: "transparent", accent: "#C3B1FF", radius: 18, padding: 14, accentBar: "none" },
      types: { task: { bg: "#1F2A3D", accent: "#9BC1FF" }, table: { bg: "#1E3330", accent: "#8BD8BD" }, sticky: { bg: "#F5A3D0", textColor: "#2A1020", border: "transparent", radius: 18 }, link: { bg: "#33291C", accent: "#F2C66D" } },
    },
  },
];

/** Build a full theme from a preset, keeping the board's behavior settings. */
export function applyPreset(current: Theme, p: BoardPreset): Theme {
  const b = structuredClone(DEFAULT_THEME);
  return {
    ...b,
    ...p.theme,
    card: { ...b.card, ...(p.theme.card ?? {}) },
    types: p.theme.types ? structuredClone(p.theme.types) : b.types,
    snap: current.snap,
    wheel: current.wheel,
  };
}

export interface CardPreset {
  id: string;
  name: string;
  /** null = remove the card's own styling. */
  style: Partial<CardStyle> | null;
}

export const CARD_PRESETS: CardPreset[] = [
  { id: "theme", name: "Sheet default", style: null },
  { id: "violet", name: "Violet", style: { textColor: "#E8E8EF", bg: "#2B2340", border: "#4A3D75", accent: "#A597FF" } },
  { id: "blue", name: "Blue", style: { textColor: "#E8E8EF", bg: "#1F2A3D", border: "#34507A", accent: "#6EA8FE" } },
  { id: "green", name: "Green", style: { textColor: "#E8E8EF", bg: "#1E3330", border: "#2F5B52", accent: "#5EC2B0" } },
  { id: "amber", name: "Amber", style: { textColor: "#E8E8EF", bg: "#33291C", border: "#5E4A2B", accent: "#F2C66D" } },
  { id: "red", name: "Red", style: { textColor: "#E8E8EF", bg: "#3A2228", border: "#6A3540", accent: "#F28B82" } },
  { id: "pink", name: "Pink", style: { textColor: "#E8E8EF", bg: "#38213A", border: "#663D69", accent: "#F5A3D0" } },
  { id: "outline", name: "Outline", style: { textColor: "#E8E8EF", bg: "#111217", border: "#8B7CF6", borderWidth: 2, shadow: "none", accentBar: "none" } },
  { id: "dashed", name: "Dashed", style: { textColor: "#E8E8EF", bg: "#14151B", border: "#5A5C6A", borderWidth: 1.5, borderStyle: "dashed", shadow: "none", accentBar: "none" } },
  { id: "glass", name: "Glass", style: { textColor: "#E8E8EF", bg: "#2A2C3A", border: "#4A4D63", opacity: 50, radius: 16, shadow: "deep" } },
  { id: "glow", name: "Glow", style: { border: "#8B7CF6", accent: "#8B7CF6", shadow: "glow" } },
  { id: "minimal", name: "Minimal", style: { textColor: "#E8E8EF", bg: "#16171D", borderWidth: 0, shadow: "none", accentBar: "none" } },
  { id: "headline", name: "Headline", style: { bold: true, titleSize: 22, accentBar: "left", padding: 16 } },
  { id: "paper", name: "Paper", style: { bg: "#E9E4DA", textColor: "#1E1B16", border: "#D2C9B8", accent: "#B08850", shadow: "soft" } },
  { id: "rounded", name: "Rounded", style: { radius: 28, padding: 18, accentBar: "none" } },
];


export function hasOverrides(node: CardNode) {
  return Object.keys(node.style).length > 0;
}

/** Pick black or white text for a background, used for sticky notes & pills. */
export function contrastText(hex: string) {
  const h = hex.replace("#", "");
  if (h.length < 6) return "#E8E8EF";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? "#1A1A22" : "#F2F2F7";
}
