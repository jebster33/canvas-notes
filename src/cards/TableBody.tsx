import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Rows3, CheckSquare, Calculator, Trash2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Eraser, Columns3, Sigma } from "lucide-react";
import type { CalcOp, CardNode, TableData } from "../lib/types";
import { useStore } from "../lib/store";
import { colName, evaluateTable } from "../lib/formula";
import {
  full, regenerate, insertRow, deleteRow, insertCol, deleteCol, setCalcColumn, addSummaryRow, newRowIndex,
  isHeaderRow, cellKey, cellFormula, CALC_META, type FullTable,
} from "../lib/table";
import { ColumnWizard, RowWizard, CellWizard, type ColumnChoice } from "./TableWizard";
import { useKeepOnScreen } from "../components/ui";

const stop = (e: React.SyntheticEvent) => e.stopPropagation();
const ROW_COLORS = ["#2B2340", "#1F2A3D", "#1E3330", "#33291C", "#3A2228", "#38213A", "#2E2E1C"];
const CELL_COLORS = ["#4A3D75", "#34507A", "#2F5B52", "#6B5428", "#6A3540", "#663D69", "#3A3B48"];

type Menu = { x: number; y: number; r: number; c: number };
type Wizard =
  | { kind: "col"; anchor: DOMRect }
  | { kind: "row"; anchor: DOMRect }
  | { kind: "cell"; anchor: DOMRect; r: number; c: number; op: CalcOp | null; picked: [number, number][] };

export function TableBody({ node, selected }: { node: CardNode; selected: boolean }) {
  const patchNode = useStore((s) => s.patchNode);
  const t = useMemo(() => full(node.table!), [node.table]);
  const values = useMemo(() => evaluateTable(t.cells), [t.cells]);
  const [active, setActive] = useState<[number, number] | null>(null);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [wiz, setWiz] = useState<Wizard | null>(null);
  const draft = useRef("");
  const root = useRef<HTMLDivElement>(null);
  const rows = t.cells.length, cols = t.cols.length;

  // Grow the card when rows, columns or the toolbar no longer fit (never shrinks by itself).
  useLayoutEffect(() => {
    const body = root.current?.closest<HTMLElement>(".card-body");
    if (!body) return;
    const extraH = body.scrollHeight - body.clientHeight;
    const extraW = body.scrollWidth - body.clientWidth;
    if (extraH > 1 || extraW > 1) {
      patchNode(node.id, { h: node.h + Math.max(0, extraH), w: node.w + Math.max(0, Math.min(extraW, 600)) }, false);
    }
  }, [t.cells.length, t.cols.length, t.colWidths, selected, t.checks, node.h, node.w, node.id, patchNode]);

  const write = (next: Partial<TableData> | FullTable) => patchNode(node.id, { table: { ...t, ...next } });
  const generated = (r: number, c: number) => !!t.rows[r]?.summary || (t.cols[c]?.kind === "calc" && !isHeaderRow(t, r));
  const setCell = (r: number, c: number, v: string) => {
    if ((t.cells[r]?.[c] ?? "") === v || generated(r, c)) return;
    const cells = t.cells.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row));
    // Header names and numbers feed calc columns and totals, so rebuild them.
    write(regenerate({ ...t, cells }));
  };
  const move = (r: number, c: number) => setActive([Math.max(0, Math.min(rows - 1, r)), Math.max(0, Math.min(cols - 1, c))]);
  const anchor = () => (root.current?.closest(".card") ?? root.current)!.getBoundingClientRect();

  const commit = () => {
    if (active && editing) setCell(active[0], active[1], draft.current);
    setEditing(false);
  };
  const startEdit = (r: number, c: number, initial?: string) => {
    if (generated(r, c)) {
      useStore.getState().flash(t.rows[r]?.summary ? "This is a summary row. It updates by itself." : "This column is calculated. It updates by itself.");
      return;
    }
    if (t.cols[c].kind === "checkbox" && !isHeaderRow(t, r)) {
      setCell(r, c, t.cells[r][c] ? "" : "1");
      return;
    }
    draft.current = initial ?? t.cells[r][c];
    setEditing(true);
  };

  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (!active) return;
    const [r, c] = active;
    if (editing) {
      if (e.key === "Enter") { commit(); move(r + 1, c); e.preventDefault(); }
      else if (e.key === "Tab") { commit(); move(r, c + (e.shiftKey ? -1 : 1)); e.preventDefault(); }
      else if (e.key === "Escape") { setEditing(false); e.preventDefault(); }
      return;
    }
    const nav: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Enter: [1, 0], Tab: [0, e.shiftKey ? -1 : 1] };
    if (nav[e.key]) { move(r + nav[e.key][0], c + nav[e.key][1]); e.preventDefault(); return; }
    if (e.key === "Delete" || e.key === "Backspace") { setCell(r, c, ""); e.preventDefault(); return; }
    if (e.key === "F2") { startEdit(r, c); e.preventDefault(); return; }
    if (e.key === " " && t.cols[c].kind === "checkbox") { startEdit(r, c); e.preventDefault(); return; }
    if (e.key === "Escape") { setActive(null); (e.currentTarget as HTMLElement).blur(); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { startEdit(r, c, e.key); e.preventDefault(); }
  };

  /* ---- structural actions ---- */
  const addRowPlain = () => write(insertRow(t, newRowIndex(t)));
  const addColumn = (ch: ColumnChoice) => {
    setWiz(null);
    if (ch.kind === "calc") write(setCalcColumn(t, ch.op, ch.cols, ch.name || CALC_META[ch.op].name));
    else write(insertCol(t, t.cols.length, { kind: ch.kind }, ch.name));
  };
  const setRowColor = (r: number, color?: string) => write({ rows: t.rows.map((row, i) => (i === r ? { ...row, color } : row)) });
  const setCellColor = (r: number, c: number, color?: string) => {
    const cellBg = { ...t.cellBg };
    if (color) cellBg[cellKey(t, r, c)] = color;
    else delete cellBg[cellKey(t, r, c)];
    write({ cellBg });
  };
  const toggleDone = (r: number) => write({ rows: t.rows.map((row, i) => (i === r ? { ...row, done: !row.done } : row)) });

  /* ---- cell wizard picking ---- */
  const picking = wiz?.kind === "cell" && wiz.op !== null;
  const pickCell = (r: number, c: number) => {
    if (wiz?.kind !== "cell" || !wiz.op) return;
    if (r === wiz.r && c === wiz.c) return;
    const max = CALC_META[wiz.op].max;
    const has = wiz.picked.findIndex(([pr, pc]) => pr === r && pc === c);
    const picked: [number, number][] = has >= 0 ? wiz.picked.filter((_, i) => i !== has) : wiz.picked.length >= max ? [...wiz.picked.slice(0, max - 1), [r, c]] : [...wiz.picked, [r, c]];
    setWiz({ ...wiz, picked });
  };
  const finishCell = () => {
    if (wiz?.kind !== "cell" || !wiz.op) return;
    const refs = wiz.picked.map(([r, c]) => `${colName(c)}${r + 1}`);
    const cells = t.cells.map((row, i) => (i === wiz.r ? row.map((x, j) => (j === wiz.c ? cellFormula(wiz.op!, refs) : x)) : row));
    const cellFmt = { ...t.cellFmt };
    const k = cellKey(t, wiz.r, wiz.c);
    if (CALC_META[wiz.op].percent) cellFmt[k] = "percent";
    else delete cellFmt[k];
    write(regenerate({ ...t, cells, cellFmt }));
    setWiz(null);
  };

  const raw = active ? t.cells[active[0]]?.[active[1]] ?? "" : "";
  const display = (r: number, c: number) => {
    const v = values[r][c];
    if (v === "" || v.startsWith("#")) return v;
    const pct = t.cols[c].format === "percent" && !isHeaderRow(t, r) && !t.rows[r].summary || t.cellFmt[cellKey(t, r, c)] === "percent";
    return pct && !isNaN(Number(v)) ? v + "%" : v;
  };

  const resizeCol = (e: React.PointerEvent, c: number) => {
    e.stopPropagation();
    e.preventDefault();
    const st = useStore.getState();
    const zoom = st.board()!.viewport.zoom;
    const sx = e.clientX, w0 = t.colWidths[c];
    st.beginGesture();
    const mv = (m: PointerEvent) => {
      const colWidths = [...t.colWidths];
      colWidths[c] = Math.max(48, Math.round(w0 + (m.clientX - sx) / zoom));
      st.patchNode(node.id, { table: { ...t, colWidths } }, false);
    };
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      st.endGesture();
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={root}
      className={"tbl" + (picking ? " picking" : "")}
      onPointerDown={stop}
      onKeyDown={onKey}
      tabIndex={0}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && (commit(), !wiz && setActive(null))}
      onContextMenu={(e) => e.preventDefault()}
    >
      {selected && (
        <div className="formula-bar">
          {picking ? (
            <span className="pick-hint">Click boxes to use them in the calculation</span>
          ) : active ? (
            <>
              <b>{colName(active[1])}{active[0] + 1}</b>
              <span>{generated(active[0], active[1]) ? "Calculated automatically" : raw || "empty"}</span>
            </>
          ) : (
            <span style={{ opacity: 0.5 }}>Click a box to edit. Right-click for colors and calculations.</span>
          )}
        </div>
      )}
      <div className="tbl-wrap">
        <table className="sheet">
          <colgroup>
            <col style={{ width: 26 }} />
            {t.checks && <col style={{ width: 30 }} />}
            {t.colWidths.map((w, i) => <col key={t.cols[i].id} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              <th />
              {t.checks && <th />}
              {t.cols.map((col, c) => (
                <th key={col.id} className={col.kind === "calc" ? "calc-h" : ""} title={col.kind === "calc" && col.calc ? CALC_META[col.calc.op].label : undefined}>
                  {colName(c)}
                  {col.kind === "calc" && <Calculator size={9} style={{ marginLeft: 3, verticalAlign: -1 }} />}
                  <span className="col-resize" onPointerDown={(e) => resizeCol(e, c)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.cells.map((row, r) => {
              const rd = t.rows[r];
              const head = isHeaderRow(t, r);
              return (
                <tr key={rd.id} className={(rd.summary ? "summary " : "") + (rd.done ? "done" : "")}>
                  <td className="rh" onContextMenu={(e) => setMenu({ x: e.clientX, y: e.clientY, r, c: active?.[1] ?? 0 })}>{r + 1}</td>
                  {t.checks && (
                    <td className="row-check" style={rd.color ? { background: rd.color } : undefined}>
                      {!head && !rd.summary && <input type="checkbox" checked={!!rd.done} onChange={() => toggleDone(r)} aria-label={`Row ${r + 1} done`} />}
                    </td>
                  )}
                  {row.map((cell, c) => {
                    const col = t.cols[c];
                    const v = display(r, c);
                    const isActive = active?.[0] === r && active?.[1] === c;
                    const pickIdx = wiz?.kind === "cell" ? wiz.picked.findIndex(([pr, pc]) => pr === r && pc === c) : -1;
                    const isTarget = wiz?.kind === "cell" && wiz.r === r && wiz.c === c;
                    const bg = t.cellBg[cellKey(t, r, c)] ?? rd.color;
                    const cls = [
                      "cell",
                      head ? "head" : "",
                      isActive && !picking ? "active" : "",
                      generated(r, c) ? "gen" : cell.startsWith("=") ? "formula" : "",
                      v.startsWith("#") ? "err" : "",
                      v !== "" && !isNaN(Number(v.replace(/%$/, ""))) ? "num" : "",
                      pickIdx >= 0 ? "picked" : "",
                      isTarget ? "target" : "",
                    ].join(" ");
                    return (
                      <td
                        key={col.id}
                        className={cls}
                        style={bg ? { background: bg } : undefined}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          if (picking) return pickCell(r, c);
                          if (!isActive) commit();
                          move(r, c);
                          if (col.kind === "checkbox" && !head && !rd.summary && (e.target as HTMLElement).matches("input")) startEdit(r, c);
                        }}
                        onDoubleClick={() => !picking && col.kind !== "checkbox" && startEdit(r, c)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (picking) return;
                          commit();
                          move(r, c);
                          setMenu({ x: e.clientX, y: e.clientY, r, c });
                        }}
                      >
                        {pickIdx >= 0 && <i className="pick-badge">{pickIdx + 1}</i>}
                        {isActive && editing ? (
                          <input autoFocus defaultValue={draft.current} onChange={(e) => (draft.current = e.target.value)} onBlur={commit} />
                        ) : col.kind === "checkbox" && !head && !rd.summary ? (
                          <div className="cv cb"><input type="checkbox" checked={!!cell} readOnly tabIndex={-1} /></div>
                        ) : (
                          <div className="cv" title={cell.startsWith("=") && !generated(r, c) ? cell : undefined}>{v}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <button className="add-col" title="Add a column" onClick={() => setWiz({ kind: "col", anchor: anchor() })}>
          <Plus size={13} />
        </button>
      </div>
      <button className="add-row" onClick={addRowPlain} title="Add a row">
        <Plus size={13} />New row
      </button>
      {selected && (
        <div className="sheet-tools">
          <button onClick={() => setWiz({ kind: "col", anchor: anchor() })}><Columns3 size={12} />Add column…</button>
          <button onClick={() => setWiz({ kind: "row", anchor: anchor() })}><Sigma size={12} />Add row…</button>
          <button className={t.checks ? "on" : ""} onClick={() => write({ checks: !t.checks })}><CheckSquare size={12} />Checkboxes</button>
          <button className={t.header ? "on" : ""} onClick={() => write(regenerate({ ...t, header: !t.header }))}><Rows3 size={12} />Header</button>
        </div>
      )}

      {menu && (
        <CellMenu
          menu={menu}
          table={t}
          onClose={() => setMenu(null)}
          actions={{
            calc: () => setWiz({ kind: "cell", anchor: anchor(), r: menu.r, c: menu.c, op: null, picked: [] }),
            rowColor: (col) => setRowColor(menu.r, col),
            cellColor: (col) => setCellColor(menu.r, menu.c, col),
            rowAbove: () => write(insertRow(t, menu.r)),
            rowBelow: () => write(insertRow(t, menu.r + 1)),
            colLeft: () => write(insertCol(t, menu.c)),
            colRight: () => write(insertCol(t, menu.c + 1)),
            delRow: () => write(deleteRow(t, menu.r)),
            delCol: () => write(deleteCol(t, menu.c)),
            clear: () => setCell(menu.r, menu.c, ""),
          }}
          canCalc={!generated(menu.r, menu.c) && !isHeaderRow(t, menu.r) && t.cols[menu.c]?.kind !== "checkbox"}
        />
      )}
      {wiz?.kind === "col" && <ColumnWizard table={t} anchor={wiz.anchor} onClose={() => setWiz(null)} onDone={addColumn} />}
      {wiz?.kind === "row" && (
        <RowWizard
          anchor={wiz.anchor}
          onClose={() => setWiz(null)}
          onPlain={() => (addRowPlain(), setWiz(null))}
          onSummary={(fn) => (write(addSummaryRow(t, fn)), setWiz(null))}
        />
      )}
      {wiz?.kind === "cell" && (
        <CellWizard
          anchor={wiz.anchor}
          target={`${colName(wiz.c)}${wiz.r + 1}`}
          op={wiz.op}
          picked={wiz.picked.map(([r, c]) => `${colName(c)}${r + 1}`)}
          onPickOp={(op) => setWiz({ ...wiz, op })}
          onDone={finishCell}
          onClose={() => setWiz(null)}
        />
      )}
    </div>
  );
}

function CellMenu({
  menu, table, onClose, actions, canCalc,
}: {
  menu: Menu; table: FullTable; onClose(): void; canCalc: boolean;
  actions: Record<"calc" | "rowAbove" | "rowBelow" | "colLeft" | "colRight" | "delRow" | "delCol" | "clear", () => void> & {
    rowColor(c?: string): void; cellColor(c?: string): void;
  };
}) {
  const run = (f: () => void) => () => (f(), onClose());
  const menuRef = useRef<HTMLDivElement>(null);
  useKeepOnScreen(menuRef);
  const rowColor = table.rows[menu.r]?.color;
  const cellColor = table.cellBg[cellKey(table, menu.r, menu.c)];
  return createPortal(
    <div className="menu-scrim" onPointerDown={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())}>
      <div
        ref={menuRef}
        className="pop menu table-menu"
        style={{ left: menu.x, top: menu.y }}
        onPointerDown={stop}
      >
        {canCalc && <button onClick={run(actions.calc)}><Calculator size={14} />Calculate this box…</button>}
        {canCalc && <hr />}
        <div className="menu-label">Box color</div>
        <div className="menu-colors">
          <button className={"swatch" + (!cellColor ? " on" : "")} title="None" onClick={run(() => actions.cellColor(undefined))} style={{ background: "linear-gradient(135deg, transparent 45%, #F27474 46%, #F27474 54%, transparent 55%)" }} />
          {CELL_COLORS.map((c) => <button key={c} className={"swatch" + (cellColor === c ? " on" : "")} style={{ background: c }} onClick={run(() => actions.cellColor(c))} />)}
        </div>
        <div className="menu-label">Row color</div>
        <div className="menu-colors">
          <button className={"swatch" + (!rowColor ? " on" : "")} title="None" onClick={run(() => actions.rowColor(undefined))} style={{ background: "linear-gradient(135deg, transparent 45%, #F27474 46%, #F27474 54%, transparent 55%)" }} />
          {ROW_COLORS.map((c) => <button key={c} className={"swatch" + (rowColor === c ? " on" : "")} style={{ background: c }} onClick={run(() => actions.rowColor(c))} />)}
        </div>
        <hr />
        <button onClick={run(actions.rowAbove)}><ArrowUp size={14} />Insert row above</button>
        <button onClick={run(actions.rowBelow)}><ArrowDown size={14} />Insert row below</button>
        <button onClick={run(actions.colLeft)}><ArrowLeft size={14} />Insert column left</button>
        <button onClick={run(actions.colRight)}><ArrowRight size={14} />Insert column right</button>
        <hr />
        <button onClick={run(actions.clear)}><Eraser size={14} />Clear box</button>
        <button className="danger" onClick={run(actions.delRow)}><Trash2 size={14} />Delete row</button>
        <button className="danger" onClick={run(actions.delCol)}><Trash2 size={14} />Delete column</button>
      </div>
    </div>,
    document.body,
  );
}
