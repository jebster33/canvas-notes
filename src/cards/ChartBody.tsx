import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, LineChart, PieChart } from "lucide-react";
import type { CardNode, ChartData, ChartKind } from "../lib/types";
import { selectBoard, useStore } from "../lib/store";
import { evaluateTable } from "../lib/formula";
import { full, colLabel, dataRows } from "../lib/table";
import { Select } from "../components/ui";

/** Categorical palette validated for the dark card surface (fixed order, never cycled). */
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9", "#e66767"];
const MAX_SLICES = 6;

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

interface Series { name: string; color: string; values: number[] }

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : String(Math.round(v * 100) / 100));

export function ChartBody({ node, selected }: { node: CardNode; selected: boolean }) {
  const board = useStore(selectBoard)!;
  const patchNode = useStore((s) => s.patchNode);
  const c = node.chart!;
  const tables = board.nodes.filter((n) => n.type === "table");
  const src = tables.find((t) => t.id === c.source) ?? (c.source ? undefined : tables[0]);
  const set = (p: Partial<ChartData>) => patchNode(node.id, { chart: { ...c, ...p } });

  // Pull labels and numbers out of the source table's data rows.
  const data = useMemo(() => {
    if (!src?.table) return null;
    const t = full(src.table);
    const vals = evaluateTable(t.cells);
    const rows = dataRows(t);
    const labelCol = Math.min(c.labelCol, t.cols.length - 1);
    const labels = rows.map((r) => vals[r][labelCol] || `Row ${r + 1}`);
    const valueCols = c.valueCols.filter((i) => i < t.cols.length && i !== labelCol);
    const series: Series[] = valueCols.map((col, k) => ({
      name: colLabel(t, col),
      color: SERIES[k % SERIES.length],
      values: rows.map((r) => Number(String(vals[r][col]).replace(/%$/, "")) || 0),
    }));
    return { t, labels, series, columns: t.cols.map((_, i) => colLabel(t, i)) };
  }, [src?.table, c.labelCol, c.valueCols]);

  return (
    <div className="chart" onPointerDown={selected ? stop : undefined}>
      {selected && (
        <div className="chart-ctl" onPointerDown={stop} onKeyDown={stop}>
          <Select compact className="field" value={src?.id ?? ""} placeholder="Add a table card first" options={tables.map((t) => ({ value: t.id, label: t.title || "Table" }))} onChange={(v) => set({ source: v })} title="Table to chart" />
          <div className="seg">
            {([["bar", BarChart3], ["line", LineChart], ["pie", PieChart]] as [ChartKind, typeof BarChart3][]).map(([k, I]) => (
              <button key={k} className={c.kind === k ? "on" : ""} onClick={() => set(k === "pie" ? { kind: k, valueCols: c.valueCols.slice(0, 1) } : { kind: k })} title={k === "pie" ? "Donut" : k[0].toUpperCase() + k.slice(1)}><I size={13} /></button>
            ))}
          </div>
          {data && (
            <>
              <Select compact className="field" value={c.labelCol} options={data.columns.map((name, i) => ({ value: i, label: `Labels: ${name}` }))} onChange={(v) => set({ labelCol: v })} title="Labels from" />
              <div className="chart-cols">
                {data.columns.map((name, i) =>
                  i === c.labelCol ? null : (
                    <button
                      key={i}
                      className={"wiz-chip" + (c.valueCols.includes(i) ? " on" : "")}
                      onClick={() => {
                        const on = c.valueCols.includes(i);
                        const next = c.kind === "pie" ? [i] : on ? c.valueCols.filter((x) => x !== i) : [...c.valueCols, i];
                        set({ valueCols: next.length ? next : [i] });
                      }}
                    >
                      {name}
                    </button>
                  ),
                )}
              </div>
            </>
          )}
        </div>
      )}
      {!data ? (
        <div className="chart-empty">
          <BarChart3 size={22} />
          <span>{tables.length ? "Pick a table to chart" : "Add a table card to this board, then pick it here"}</span>
        </div>
      ) : !data.labels.length || !data.series.length ? (
        <div className="chart-empty"><span>The table has no rows with numbers yet.</span></div>
      ) : c.kind === "pie" ? (
        <Donut labels={data.labels} series={data.series[0]} />
      ) : (
        <XYChart kind={c.kind} labels={data.labels} series={data.series} />
      )}
    </div>
  );
}

function Legend({ items }: { items: { name: string; color: string; value?: string }[] }) {
  return (
    <div className="chart-legend">
      {items.map((it) => (
        <span key={it.name}><i style={{ background: it.color }} />{it.name}{it.value !== undefined && <b>{it.value}</b>}</span>
      ))}
    </div>
  );
}

function XYChart({ kind, labels, series }: { kind: ChartKind; labels: string[]; series: Series[] }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values);
  const lo = Math.min(0, ...all);
  const hi = niceMax(Math.max(...all, 0));
  const padL = 36, padB = 22, padT = 8, padR = 8;
  const iw = Math.max(10, w - padL - padR), ih = Math.max(10, h - padT - padB);
  const y = (v: number) => padT + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const band = iw / labels.length;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + (hi - lo) * f);
  const labelEvery = Math.ceil(labels.length / Math.max(1, Math.floor(iw / 56)));

  return (
    <div className="chart-plot" onPointerLeave={() => setHover(null)}>
      {series.length > 1 && <Legend items={series.map((s) => ({ name: s.name, color: s.color }))} />}
      <div className="chart-svg" ref={ref}>
      {w > 0 && (
        <svg width={w} height={h} style={{ display: "block", position: "absolute", inset: 0 }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={t === 0 ? 0.25 : 0.08} />
              <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" className="chart-axis">{fmt(t)}</text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % labelEvery === 0 ? (
              <text key={i} x={padL + band * (i + 0.5)} y={h - 6} textAnchor="middle" className="chart-axis">
                {l.length > 10 ? l.slice(0, 9) + "…" : l}
              </text>
            ) : null,
          )}
          {kind === "bar" &&
            series.map((s, k) => {
              const gw = Math.min(band * 0.72, 28 * series.length + 2 * (series.length - 1));
              const bw = (gw - 2 * (series.length - 1)) / series.length;
              return s.values.map((v, i) => {
                const x = padL + band * i + (band - gw) / 2 + k * (bw + 2);
                const top = y(Math.max(v, 0)), bot = y(Math.min(v, 0));
                const r = Math.min(4, bw / 2, (bot - top) / 2);
                const hgt = Math.max(0, bot - top);
                // Rounded on the data end only, square on the baseline.
                const d = v >= 0
                  ? `M${x},${bot} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${bot} Z`
                  : `M${x},${top} V${bot - r} Q${x},${bot} ${x + r},${bot} H${x + bw - r} Q${x + bw},${bot} ${x + bw},${bot - r} V${top} Z`;
                return <path key={`${k}-${i}`} d={hgt > 0 ? d : ""} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.45} />;
              });
            })}
          {kind === "line" &&
            series.map((s) => (
              <g key={s.name}>
                <polyline
                  points={s.values.map((v, i) => `${padL + band * (i + 0.5)},${y(v)}`).join(" ")}
                  fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                />
                {hover !== null && (
                  <circle cx={padL + band * (hover + 0.5)} cy={y(s.values[hover])} r={4.5} fill={s.color} stroke="var(--chart-surface, #1B1C23)" strokeWidth={2} />
                )}
              </g>
            ))}
          {kind === "line" && hover !== null && (
            <line x1={padL + band * (hover + 0.5)} x2={padL + band * (hover + 0.5)} y1={padT} y2={padT + ih} stroke="currentColor" strokeOpacity={0.25} />
          )}
          {/* Hit targets: one full-height band per label, bigger than the marks. */}
          {labels.map((_, i) => (
            <rect key={i} x={padL + band * i} y={padT} width={band} height={ih} fill="transparent" onPointerEnter={() => setHover(i)} />
          ))}
        </svg>
      )}
      </div>
      {hover !== null && w > 0 && (
        <div className="chart-tip pop" style={{ left: Math.min(padL + band * (hover + 0.5) + 10, w - 150), top: 8 }}>
          <b>{labels[hover]}</b>
          {series.map((s) => (
            <span key={s.name}><i style={{ background: s.color }} />{s.name}<em>{fmt(s.values[hover])}</em></span>
          ))}
        </div>
      )}
    </div>
  );
}

function Donut({ labels, series }: { labels: string[]; series: Series }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  // Largest first; past six slices the rest fold into "Other".
  const items = labels
    .map((l, i) => ({ name: l, value: Math.max(0, series.values[i]) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const shown = items.length > MAX_SLICES ? [...items.slice(0, MAX_SLICES - 1), { name: "Other", value: items.slice(MAX_SLICES - 1).reduce((s, x) => s + x.value, 0) }] : items;
  const total = shown.reduce((s, x) => s + x.value, 0) || 1;
  const size = Math.max(40, Math.min(w * 0.55, h - 8));
  const R = size / 2, r = R * 0.6, cx = R + 4, cy = h / 2;
  let a0 = -Math.PI / 2;
  const arcs = shown.map((s, i) => {
    const a1 = a0 + (s.value / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number, rad: number) => `${cx + Math.cos(a) * rad},${cy + Math.sin(a) * rad}`;
    const d = shown.length === 1
      ? `M${cx - R},${cy} a${R},${R} 0 1,0 ${R * 2},0 a${R},${R} 0 1,0 ${-R * 2},0 M${cx - r},${cy} a${r},${r} 0 1,1 ${r * 2},0 a${r},${r} 0 1,1 ${-r * 2},0`
      : `M${p(a0, R)} A${R},${R} 0 ${large},1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${large},0 ${p(a0, r)} Z`;
    a0 = a1;
    return { ...s, d, color: SERIES[i] };
  });
  const focus = hover !== null ? arcs[hover] : null;

  return (
    <div className="chart-plot donut" ref={ref} onPointerLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={size + 8} height={h} style={{ flex: "none" }}>
          {arcs.map((a, i) => (
            <path key={a.name} d={a.d} fill={a.color} stroke="var(--chart-surface, #1B1C23)" strokeWidth={2} fillRule="evenodd"
              opacity={hover === null || hover === i ? 1 : 0.45} onPointerEnter={() => setHover(i)} />
          ))}
          <text x={cx} y={cy - 2} textAnchor="middle" className="donut-num">{fmt(focus ? focus.value : total)}</text>
          <text x={cx} y={cy + 14} textAnchor="middle" className="chart-axis">{focus ? `${Math.round((focus.value / total) * 100)}%` : series.name}</text>
        </svg>
      )}
      <Legend items={arcs.map((a) => ({ name: a.name, color: a.color, value: fmt(a.value) }))} />
    </div>
  );
}
