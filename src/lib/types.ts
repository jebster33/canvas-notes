export type CardType =
  | "note" | "task" | "table" | "image" | "sticky" | "link"
  | "frame" | "chart" | "web" | "code" | "file" | "voice";
export const CARD_TYPES: CardType[] = ["note", "task", "table", "sticky", "image", "frame", "chart", "web", "code", "file", "voice", "link"];

export type EdgeShape = "curved" | "straight" | "elbow";
export type Side = "top" | "right" | "bottom" | "left";

/** Visual properties a card can carry. Every field is optional at override level. */
export interface CardStyle {
  fontFamily: string;
  fontSize: number;
  titleSize: number;
  textColor: string;
  bg: string;
  border: string;
  accent: string;
  radius: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
  shadow: ShadowStyle;
  /** Outline thickness in px (0 = none). */
  borderWidth: number;
  borderStyle: "solid" | "dashed" | "dotted";
  /** Inner spacing in px. */
  padding: number;
  /** Where the colored accent strip sits. */
  accentBar: "top" | "left" | "none";
  /** Fill opacity 20-100; below 100 the card gets a frosted-glass blur. */
  opacity: number;
}

export type ShadowStyle = "none" | "soft" | "deep" | "glow";

export interface Theme {
  card: CardStyle;
  /** Per-type defaults layered on top of `card`. */
  types: Partial<Record<CardType, Partial<CardStyle>>>;
  canvasBg: string;
  grid: "dots" | "lines" | "none";
  gridColor: string;
  edgeShape: EdgeShape;
  edgeColor: string;
  edgeWidth: number;
  edgeArrow: boolean;
  snap: boolean;
  wheel: "zoom" | "pan";
}

export interface Comment {
  id: string;
  text: string;
  at: number;
  resolved: boolean;
}

/** Id of one of the board's lists (see Board.statuses). */
export type TaskStatus = string;

export interface StatusDef {
  id: string;
  label: string;
  color: string;
  /** Tasks in this list count as finished (no reminders, 100% progress). */
  done?: boolean;
}
export type Priority = "low" | "medium" | "high" | "critical";

export type Reminder = "none" | "due" | "15m" | "1h" | "1d";

export interface TaskData {
  status: TaskStatus;
  owner: string;
  /** YYYY-MM-DD */
  due: string;
  /** Optional HH:MM; without it reminders use the morning reminder time. */
  time?: string;
  /** Optional YYYY-MM-DD start, for the timeline. */
  start?: string;
  priority: Priority;
  progress: number;
  remind?: Reminder;
  /** Seconds logged with the focus timer. */
  spent?: number;
}

export type ChartKind = "bar" | "line" | "pie";
export interface ChartData {
  /** Id of a table card on the same board. */
  source: string;
  kind: ChartKind;
  /** Column index used for labels, and the column indexes plotted. */
  labelCol: number;
  valueCols: number[];
}

export interface WebData {
  url: string;
  title: string;
  description: string;
  image: string;
  site: string;
  /** YouTube video id when the link is a video. */
  youtube?: string;
}

export interface FileData {
  asset: string;
  name: string;
  size: number;
  mime: string;
}

/** Calculations offered by the "add column" and "calculate cell" wizards. */
export type CalcOp = "sum" | "sub" | "mul" | "div" | "pct" | "avg" | "share" | "min" | "max";
export type SummaryFn = "sum" | "avg" | "min" | "max" | "count";

export interface ColDef {
  id: string;
  kind: "text" | "number" | "checkbox" | "calc";
  /** For calc columns: the operation and the column ids it reads, in order. */
  calc?: { op: CalcOp; cols: string[] };
  /** Show values as plain numbers, percentages or money. */
  format?: "plain" | "percent" | "currency";
}

export interface RowDef {
  id: string;
  /** Row background color. */
  color?: string;
  /** Ticked in the optional checkbox column. */
  done?: boolean;
  /** A summary row (total, average…) computed from the data rows. */
  summary?: SummaryFn;
}

export interface TableData {
  cells: string[][];
  colWidths: number[];
  header: boolean;
  cols?: ColDef[];
  rows?: RowDef[];
  /** Per-cell background color, keyed "rowId:colId" so it survives inserts. */
  cellBg?: Record<string, string>;
  /** Per-cell number format for cells made with the calculate wizard. */
  cellFmt?: Record<string, "percent" | "currency">;
  /** Show a checkbox at the start of every row. */
  checks?: boolean;
}

export interface ImageData {
  asset: string;
  fit: "cover" | "contain";
}

export interface LinkData {
  boardId: string;
}

export interface CardNode {
  id: string;
  type: CardType;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  /** Tiptap HTML for note/sticky/task description/image caption. */
  html: string;
  style: Partial<CardStyle>;
  comments: Comment[];
  collapsed?: boolean;
  task?: TaskData;
  table?: TableData;
  image?: ImageData;
  link?: LinkData;
  chart?: ChartData;
  web?: WebData;
  code?: { lang: string; text: string };
  file?: FileData;
  voice?: { asset: string; duration: number };
  /** Frames: tinted area that groups the cards placed inside it. */
  frame?: { color: string };
  tags?: string[];
  /** Emoji shown before the title. */
  icon?: string;
  /** Banner across the top of the card: an image asset or a color. */
  cover?: { asset?: string; color?: string };
  /** Daily notes: the day (YYYY-MM-DD) this note belongs to. */
  daily?: string;
  z: number;
}

export interface Edge {
  id: string;
  from: string;
  to: string;
  fromSide?: Side;
  toSide?: Side;
  shape?: EdgeShape;
  color?: string;
  width?: number;
  dashed?: boolean;
  arrow?: boolean;
  /** Bend points the line passes through (world coords). */
  points?: { x: number; y: number }[];
  label: string;
}

export type DrawTool = "pen" | "highlighter" | "rect" | "ellipse" | "arrow" | "line";

export interface Stroke {
  id: string;
  tool: DrawTool;
  /** Flat [x0,y0,x1,y1,...] in world space. Shapes store 2 points. */
  pts: number[];
  color: string;
  width: number;
  fill?: string;
}

export interface Workspace {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface Board {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  theme: Theme;
  nodes: CardNode[];
  edges: Edge[];
  strokes: Stroke[];
  viewport: { x: number; y: number; zoom: number };
  order: number;
  /** Colors for tag names used on this board. */
  tagColors?: Record<string, string>;
  /** Workspace this board belongs to (missing = the first workspace). */
  workspace?: string;
  /** Task lists for the Board view, in order. Missing = the default four. */
  statuses?: StatusDef[];
}

export type Tool = "select" | "hand" | DrawTool | "eraser";

/** Portable export: board + every image it uses, inlined. */
export interface BoardExport {
  format: "canvas-notes/board";
  version: 1;
  exportedAt: number;
  board: Board;
  assets: Record<string, string>;
}

export interface ThemeExport {
  format: "canvas-notes/theme";
  version: 1;
  theme: Theme;
}
