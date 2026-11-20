import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Type, Hash, CheckSquare, Plus, Minus, X as Times, Divide, Percent, PieChart, Sigma, ArrowDownToLine, ArrowUpToLine, ListOrdered, ChevronLeft,
} from "lucide-react";
import type { CalcOp, SummaryFn } from "../lib/types";
import { CALC_META, SUMMARY_META, type FullTable, colLabel } from "../lib/table";

const CALC_ICON: Record<CalcOp, React.ReactNode> = {
  sum: <Plus size={16} />, sub: <Minus size={16} />, mul: <Times size={16} />, div: <Divide size={16} />,
  pct: <Percent size={16} />, share: <PieChart size={16} />, avg: <Sigma size={16} />,
  min: <ArrowDownToLine size={16} />, max: <ArrowUpToLine size={16} />,
};

/** Plain-language preview of a calculation, e.g. "Qty × Price" or "B2 as a % of B5". */
function describe(op: CalcOp, names: string[]) {
  const meta = CALC_META[op];
  if (op === "share") return `Each row's share of all of ${names[0]}`;
  if (op === "pct") return names.length > 1 ? `${names[0]} as a % of ${names[1]}` : `${names[0]} as a % of …`;
  if (op === "avg" || op === "min" || op === "max") return `${meta.label} of ${names.join(", ")}`;
  return names.join(` ${meta.sym} `);
}

/** Floating dialog placed next to the table card (fixed, outside the zoomed canvas). */
export function WizardShell({ anchor, title, onClose, children, width = 360 }: { anchor: DOMRect; title: React.ReactNode; onClose(): void; children: React.ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  useEffect(() => {
    const h = ref.current?.offsetHeight ?? 400;
    const right = anchor.right + 14;
    const left = right + width < window.innerWidth - 8 ? right : Math.max(8, anchor.left - width - 14);
    setPos({ left, top: Math.max(8, Math.min(anchor.top, window.innerHeight - h - 8)) });
  }, [anchor, width]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  return createPortal(
    <div
      ref={ref}
      className="pop wizard"
      style={{ left: pos.left, top: pos.top, width }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="dialog"
    >
      <div className="wiz-head">
        <b>{title}</b>
        <button className="btn icon" onClick={onClose} aria-label="Close"><X size={15} /></button>
      </div>
      {children}
    </div>,
    document.body,
  );
}

function Option({ icon, label, hint, onClick, tint }: { icon: React.ReactNode; label: string; hint: string; onClick(): void; tint?: string }) {
  return (
    <button className="wiz-opt" onClick={onClick}>
      <span className="wiz-ic" style={tint ? { color: tint, background: tint + "22" } : undefined}>{icon}</span>
      <span><b>{label}</b><small>{hint}</small></span>
    </button>
  );
}

/* ---------------- add column ---------------- */

export type ColumnChoice =
  | { kind: "text" | "number" | "checkbox"; name: string }
  | { kind: "calc"; op: CalcOp; cols: string[]; name: string };

export function ColumnWizard({ table, anchor, onDone, onClose }: { table: FullTable; anchor: DOMRect; onDone(c: ColumnChoice): void; onClose(): void }) {
  const [op, setOp] = useState<CalcOp | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const usable = table.cols.map((c, i) => ({ c, i })).filter(({ c }) => c.kind !== "checkbox");

  if (!op) {
    return (
      <WizardShell anchor={anchor} title="What would you like to add?" onClose={onClose}>
        <div className="wiz-sec">Basic column</div>
        <div className="wiz-grid">
          <Option icon={<Type size={16} />} label="Text" hint="Names, notes, anything" onClick={() => onDone({ kind: "text", name: "" })} />
          <Option icon={<Hash size={16} />} label="Numbers" hint="Amounts, scores, prices" onClick={() => onDone({ kind: "number", name: "" })} />
          <Option icon={<CheckSquare size={16} />} label="Checkboxes" hint="Tick things off" onClick={() => onDone({ kind: "checkbox", name: "Done" })} />
        </div>
        <div className="wiz-sec">Calculated from other columns</div>
        <div className="wiz-grid">
          {(Object.keys(CALC_META) as CalcOp[]).map((k) => (
            <Option key={k} icon={CALC_ICON[k]} label={CALC_META[k].label} hint={CALC_META[k].hint} tint="#5EC2B0"
              onClick={() => { setOp(k); setPicked([]); setName(CALC_META[k].name); }} />
          ))}
        </div>
      </WizardShell>
    );
  }

  const meta = CALC_META[op];
  const ready = picked.length >= meta.min;
  const ask =
    meta.min === meta.max
      ? meta.min === 1 ? "Which column?" : `Pick ${meta.min} columns, in order`
      : `Pick at least ${meta.min} columns`;
  const preview = picked.map((id) => colLabel(table, table.cols.findIndex((c) => c.id === id)));

  return (
    <WizardShell anchor={anchor} title={<><button className="btn icon" onClick={() => setOp(null)} aria-label="Back"><ChevronLeft size={15} /></button>{meta.label}</>} onClose={onClose}>
      <p className="wiz-q">{ask}</p>
      <div className="wiz-chips">
        {usable.map(({ c, i }) => {
          const n = picked.indexOf(c.id);
          return (
            <button
              key={c.id}
              className={"wiz-chip" + (n >= 0 ? " on" : "")}
              onClick={() =>
                setPicked((p) => (n >= 0 ? p.filter((x) => x !== c.id) : p.length >= meta.max ? [...p.slice(0, meta.max - 1), c.id] : [...p, c.id]))
              }
            >
              {n >= 0 && <i>{n + 1}</i>}
              {colLabel(table, i)}
            </button>
          );
        })}
      </div>
      {usable.length < meta.min && <p className="wiz-note">Add more columns first. This needs {meta.min}.</p>}
      {preview.length > 0 && (
        <div className="wiz-preview">
          {describe(op, preview)}
        </div>
      )}
      <label className="wiz-label">Column name</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ready && onDone({ kind: "calc", op, cols: picked, name })} />
      <div className="wiz-actions">
        <button className="btn" onClick={() => setOp(null)}>Back</button>
        <button className="btn solid" disabled={!ready} onClick={() => onDone({ kind: "calc", op, cols: picked, name })}>Add column</button>
      </div>
    </WizardShell>
  );
}

/* ---------------- add row ---------------- */

export function RowWizard({ anchor, onPlain, onSummary, onClose }: { anchor: DOMRect; onPlain(): void; onSummary(fn: SummaryFn): void; onClose(): void }) {
  const icons: Record<SummaryFn, React.ReactNode> = {
    sum: <Plus size={16} />, avg: <Sigma size={16} />, max: <ArrowUpToLine size={16} />, min: <ArrowDownToLine size={16} />, count: <ListOrdered size={16} />,
  };
  return (
    <WizardShell anchor={anchor} title="What would you like to add?" onClose={onClose}>
      <div className="wiz-grid">
        <Option icon={<Type size={16} />} label="Empty row" hint="A new row to fill in" onClick={onPlain} />
      </div>
      <div className="wiz-sec">Summary row at the bottom</div>
      <div className="wiz-grid">
        {(Object.keys(SUMMARY_META) as SummaryFn[]).map((k) => (
          <Option key={k} icon={icons[k]} label={SUMMARY_META[k].label} hint={SUMMARY_META[k].hint} tint="#8B7CF6" onClick={() => onSummary(k)} />
        ))}
      </div>
    </WizardShell>
  );
}

/* ---------------- calculate one cell ---------------- */

export function CellWizard({
  anchor, target, op, picked, onPickOp, onDone, onClose,
}: {
  anchor: DOMRect; target: string; op: CalcOp | null; picked: string[];
  onPickOp(op: CalcOp): void; onDone(): void; onClose(): void;
}) {
  const ops: CalcOp[] = ["sum", "sub", "mul", "div", "pct", "avg", "min", "max"];
  if (!op) {
    return (
      <WizardShell anchor={anchor} title={`What should ${target} show?`} onClose={onClose}>
        <div className="wiz-grid">
          {ops.map((k) => (
            <Option key={k} icon={CALC_ICON[k]} label={CALC_META[k].label} hint={k === "pct" ? "What % one box is of another" : k === "sum" ? "Total of the boxes you pick" : CALC_META[k].hint.replace("columns", "boxes").replace("column", "box")} tint="#5EC2B0" onClick={() => onPickOp(k)} />
          ))}
        </div>
      </WizardShell>
    );
  }
  const meta = CALC_META[op];
  const ready = picked.length >= meta.min;
  return (
    <WizardShell anchor={anchor} title={`${meta.label} into ${target}`} onClose={onClose}>
      <p className="wiz-q">
        Click the boxes in the table to use{meta.min === meta.max ? `, ${meta.min} in order` : ""}. Click a box again to remove it.
      </p>
      <div className="wiz-preview">{picked.length ? describe(op, picked) : "Nothing picked yet"}</div>
      <div className="wiz-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn solid" disabled={!ready} onClick={onDone}>Put it in {target}</button>
      </div>
    </WizardShell>
  );
}
