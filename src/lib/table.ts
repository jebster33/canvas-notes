/**
 * Table card model helpers.
 *
 * Calculated columns and summary rows are stored as ordinary formulas in the
 * cells (regenerated after every structural change), so the formula engine
 * evaluates everything and other cells can reference them.
 */
import { nanoid } from "nanoid";
import type { CalcOp, ColDef, RowDef, SummaryFn, TableData } from "./types";
import { colName } from "./formula";

export type FullTable = TableData & { cols: ColDef[]; rows: RowDef[]; cellBg: Record<string, string>; cellFmt: Record<string, "percent" | "currency"> };

const id = () => nanoid(8);

export const CALC_META: Record<CalcOp, { label: string; hint: string; min: number; max: number; percent?: boolean; name: string; sym?: string }> = {
  sum: { label: "Add up", hint: "Adds the numbers from the columns you pick", min: 2, max: 12, name: "Total", sym: "+" },
  sub: { label: "Subtract", hint: "First column minus the second", min: 2, max: 2, name: "Difference", sym: "−" },
  mul: { label: "Multiply", hint: "Like quantity × price", min: 2, max: 6, name: "Amount", sym: "×" },
  div: { label: "Divide", hint: "First column divided by the second", min: 2, max: 2, name: "Ratio", sym: "÷" },
  pct: { label: "Percentage", hint: "What % the first column is of the second", min: 2, max: 2, percent: true, name: "Percent", sym: "% of" },
  share: { label: "Share of total", hint: "Each row's % of the whole column", min: 1, max: 1, percent: true, name: "Share" },
  avg: { label: "Average", hint: "Average of the columns you pick", min: 2, max: 12, name: "Average" },
  min: { label: "Lowest", hint: "Smallest value across the columns", min: 2, max: 12, name: "Lowest" },
  max: { label: "Highest", hint: "Largest value across the columns", min: 2, max: 12, name: "Highest" },
};

export const SUMMARY_META: Record<SummaryFn, { label: string; hint: string; fn: string }> = {
  sum: { label: "Total", hint: "Adds up every number column", fn: "SUM" },
  avg: { label: "Average", hint: "Average of every number column", fn: "AVG" },
  max: { label: "Highest", hint: "Largest value in each column", fn: "MAX" },
  min: { label: "Lowest", hint: "Smallest value in each column", fn: "MIN" },
  count: { label: "Count", hint: "How many rows have a number", fn: "COUNT" },
};

/** Fill in column/row metadata for tables created before it existed. */
export function full(t: TableData): FullTable {
  const nCols = t.cells[0]?.length ?? 0;
  const cols = (t.cols ?? []).slice(0, nCols);
  while (cols.length < nCols) cols.push({ id: id(), kind: "text" });
  const rows = (t.rows ?? []).slice(0, t.cells.length);
  while (rows.length < t.cells.length) rows.push({ id: id() });
  const colWidths = t.colWidths.slice(0, nCols);
  while (colWidths.length < nCols) colWidths.push(110);
  return { ...t, cols, rows, colWidths, cellBg: t.cellBg ?? {}, cellFmt: t.cellFmt ?? {} };
}

export const isHeaderRow = (t: TableData, r: number) => t.header && r === 0;

export function dataRows(t: FullTable) {
  const out: number[] = [];
  t.rows.forEach((row, r) => !isHeaderRow(t, r) && !row.summary && out.push(r));
  return out;
}

export function colLabel(t: FullTable, c: number) {
  const h = t.header ? t.cells[0]?.[c]?.trim() : "";
  return h && !h.startsWith("=") ? h : `Column ${colName(c)}`;
}

const ref = (r: number, c: number) => `${colName(c)}${r + 1}`;

function calcFormula(t: FullTable, op: CalcOp, srcCols: number[], r: number): string {
  const refs = srcCols.map((c) => ref(r, c));
  const any = `ANY(${refs.join(",")})`;
  let body: string;
  switch (op) {
    case "sum": body = refs.join("+"); break;
    case "sub": body = `${refs[0]}-${refs[1]}`; break;
    case "mul": body = refs.join("*"); break;
    case "div": body = `ROUND(${refs[0]}/${refs[1]},2)`; break;
    case "pct": body = `ROUND(${refs[0]}/${refs[1]}*100,1)`; break;
    case "avg": body = `ROUND(AVG(${refs.join(",")}),2)`; break;
    case "min": body = `MIN(${refs.join(",")})`; break;
    case "max": body = `MAX(${refs.join(",")})`; break;
    case "share": {
      const all = dataRows(t).map((rr) => ref(rr, srcCols[0]));
      body = `ROUND(${refs[0]}/SUM(${all.join(",")})*100,1)`;
      break;
    }
  }
  // Rows where every source cell is empty stay blank instead of showing 0.
  return `=IF(${any},${body})`;
}

/** Rewrite every generated cell (calc columns, summary rows) for the current layout. */
export function regenerate(t: FullTable): FullTable {
  const cells = t.cells.map((r) => [...r]);
  const index = new Map(t.cols.map((c, i) => [c.id, i]));
  const data = dataRows(t);
  const firstText = t.cols.findIndex((c) => c.kind === "text");

  t.cols.forEach((col, c) => {
    if (col.kind !== "calc" || !col.calc) return;
    const src = col.calc.cols.map((cid) => index.get(cid)).filter((i): i is number => i !== undefined);
    for (const r of data) cells[r][c] = src.length >= CALC_META[col.calc.op].min ? calcFormula(t, col.calc.op, src, r) : "#REF";
  });

  t.rows.forEach((row, r) => {
    if (!row.summary) return;
    const meta = SUMMARY_META[row.summary];
    t.cols.forEach((col, c) => {
      const numeric =
        col.kind !== "text" ||
        data.some((dr) => {
          const v = t.cells[dr][c].trim();
          return v !== "" && (v.startsWith("=") || !isNaN(Number(v.replace(/,/g, ""))));
        });
      if (c === firstText && !numeric) cells[r][c] = meta.label;
      else if (!numeric || !data.length) cells[r][c] = "";
      else {
        const fn = col.kind === "checkbox" && row.summary === "count" ? "SUM" : meta.fn;
        const list = data.map((dr) => ref(dr, c)).join(",");
        cells[r][c] = row.summary === "avg" ? `=ROUND(${fn}(${list}),2)` : `=${fn}(${list})`;
      }
    });
  });
  return { ...t, cells };
}

/** Shift A1 references in hand-written formulas after a row/column insert or delete. */
function shift(t: FullTable, axis: "row" | "col", at: number, delta: number): string[][] {
  return t.cells.map((row) =>
    row.map((v) =>
      v.startsWith("=")
        ? v.replace(/\b([A-Z]+)(\d+)\b/g, (m, letters: string, digits: string) => {
            let c = 0;
            for (const ch of letters) c = c * 26 + (ch.charCodeAt(0) - 64);
            c -= 1;
            let r = parseInt(digits, 10) - 1;
            if (axis === "row" && r >= at) r = Math.max(at, r + delta);
            else if (axis === "col" && c >= at) c = Math.max(at, c + delta);
            else return m;
            return ref(r, c);
          })
        : v,
    ),
  );
}

export function insertRow(t0: TableData, at: number, def: Partial<RowDef> = {}): FullTable {
  const t = full(t0);
  const cells = shift(t, "row", at, 1);
  cells.splice(at, 0, Array(t.cols.length).fill(""));
  const rows = [...t.rows];
  rows.splice(at, 0, { id: id(), ...def });
  return regenerate({ ...t, cells, rows });
}

/** Where a new plain row goes: above any summary rows at the bottom. */
export function newRowIndex(t0: TableData) {
  const t = full(t0);
  let at = t.rows.length;
  while (at > 0 && t.rows[at - 1].summary) at--;
  return at;
}

export function deleteRow(t0: TableData, at: number): FullTable {
  const t = full(t0);
  if (t.rows.length <= 1) return t;
  const cells = shift({ ...t, cells: t.cells.filter((_, i) => i !== at) }, "row", at + 1, -1);
  return regenerate({ ...t, cells, rows: t.rows.filter((_, i) => i !== at) });
}

export function insertCol(t0: TableData, at: number, def: Partial<ColDef> = {}, name = ""): FullTable {
  const t = full(t0);
  const cells = shift(t, "col", at, 1).map((row, r) => {
    const out = [...row];
    out.splice(at, 0, isHeaderRow(t, r) ? name : "");
    return out;
  });
  const cols = [...t.cols];
  cols.splice(at, 0, { id: id(), kind: "text", ...def });
  const colWidths = [...t.colWidths];
  colWidths.splice(at, 0, def.kind === "checkbox" ? 80 : 120);
  return regenerate({ ...t, cells, cols, colWidths });
}

export function deleteCol(t0: TableData, at: number): FullTable {
  const t = full(t0);
  if (t.cols.length <= 1) return t;
  const gone = t.cols[at].id;
  const trimmed = { ...t, cells: t.cells.map((row) => row.filter((_, i) => i !== at)) };
  const cells = shift(trimmed, "col", at + 1, -1);
  // Calc columns that used the deleted column fall back to plain numbers.
  const cols = t.cols
    .filter((_, i) => i !== at)
    .map((c) => (c.calc?.cols.includes(gone) ? { ...c, kind: "number" as const, calc: undefined } : c));
  return regenerate({ ...t, cells, cols, colWidths: t.colWidths.filter((_, i) => i !== at) });
}

export function setCalcColumn(t0: TableData, op: CalcOp, srcIds: string[], name: string): FullTable {
  const t = full(t0);
  return insertCol(t, t.cols.length, { kind: "calc", calc: { op, cols: srcIds }, format: CALC_META[op].percent ? "percent" : "plain" }, name);
}

export function addSummaryRow(t0: TableData, fn: SummaryFn): FullTable {
  const t = full(t0);
  return insertRow(t, t.rows.length, { summary: fn });
}

/** Formula a single cell gets from the "calculate this cell" wizard. */
export function cellFormula(op: CalcOp, refs: string[]) {
  switch (op) {
    case "sum": return `=${refs.join("+")}`;
    case "sub": return `=${refs[0]}-${refs.slice(1).join("-")}`;
    case "mul": return `=${refs.join("*")}`;
    case "div": return `=ROUND(${refs[0]}/${refs[1]},2)`;
    case "pct": return `=ROUND(${refs[0]}/${refs[1]}*100,1)`;
    case "avg": return `=ROUND(AVG(${refs.join(",")}),2)`;
    case "min": return `=MIN(${refs.join(",")})`;
    case "max": return `=MAX(${refs.join(",")})`;
    case "share": return `=ROUND(${refs[0]}/SUM(${refs.slice(1).join(",")})*100,1)`;
  }
}

/** A new table with a header row, typed columns and a Total row at the bottom. */
export function starterTable(cells: string[][], kinds: ColDef["kind"][]): FullTable {
  const t = full({
    cells: [...cells, Array(cells[0].length).fill("")],
    colWidths: kinds.map((k) => (k === "text" ? 160 : 110)),
    header: true,
    cols: kinds.map((kind) => ({ id: id(), kind })),
    rows: [...cells.map(() => ({ id: id() })), { id: id(), summary: "sum" as const }],
  });
  return regenerate(t);
}

export const cellKey = (t: FullTable, r: number, c: number) => `${t.rows[r].id}:${t.cols[c].id}`;
