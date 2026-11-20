import { memo } from "react";
import { getStroke } from "perfect-freehand";
import type { Stroke } from "../lib/types";
import { useStore } from "../lib/store";

function freehandPath(pts: number[], size: number, highlighter: boolean) {
  const input: [number, number][] = [];
  for (let i = 0; i < pts.length; i += 2) input.push([pts[i], pts[i + 1]]);
  const outline = getStroke(input, {
    size,
    thinning: highlighter ? 0 : 0.5,
    smoothing: 0.6,
    streamline: 0.45,
    simulatePressure: !highlighter,
    last: true,
  });
  if (!outline.length) return "";
  const d = outline.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...outline[0], "Q"] as (string | number)[],
  );
  d.push("Z");
  return d.join(" ");
}

export function StrokeShape({ s, sel }: { s: Stroke; sel?: boolean }) {
  const hl = s.tool === "highlighter";
  const common = { stroke: s.color, strokeWidth: s.width, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const outline = sel ? { filter: "drop-shadow(0 0 3px rgba(139,124,246,0.9))" } : undefined;
  if (s.tool === "pen" || hl) {
    return (
      <path d={freehandPath(s.pts, hl ? s.width * 4 : s.width * 1.6, hl)} fill={s.color} opacity={hl ? 0.35 : 1} style={outline} />
    );
  }
  const [x0, y0, x1 = x0, y1 = y0] = s.pts;
  if (s.tool === "rect") {
    return <rect x={Math.min(x0, x1)} y={Math.min(y0, y1)} width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)} rx={6} {...common} fill={s.fill ?? "none"} style={outline} />;
  }
  if (s.tool === "ellipse") {
    return <ellipse cx={(x0 + x1) / 2} cy={(y0 + y1) / 2} rx={Math.abs(x1 - x0) / 2} ry={Math.abs(y1 - y0) / 2} {...common} fill={s.fill ?? "none"} style={outline} />;
  }
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const head = Math.max(10, s.width * 4);
  return (
    <g style={outline}>
      <line x1={x0} y1={y0} x2={x1} y2={y1} {...common} />
      {s.tool === "arrow" && (
        <path
          d={`M${x1 - head * Math.cos(ang - 0.45)},${y1 - head * Math.sin(ang - 0.45)} L${x1},${y1} L${x1 - head * Math.cos(ang + 0.45)},${y1 - head * Math.sin(ang + 0.45)}`}
          {...common}
        />
      )}
    </g>
  );
}

interface Props {
  strokes: Stroke[];
  selected: string[];
  interactive: boolean;
  onStrokeDown(e: React.PointerEvent, id: string): void;
}

export const StrokeLayer = memo(function StrokeLayer({ strokes, selected, interactive, onStrokeDown }: Props) {
  const setSel = useStore((s) => s.setSel);
  return (
    <svg className="svg-layer" width="1" height="1" style={{ zIndex: 2 }}>
      {strokes.map((s) => (
        <g
          key={s.id}
          data-stroke={s.id}
          style={{ pointerEvents: interactive ? "visiblePainted" : "none", cursor: interactive ? "move" : undefined }}
          onPointerDown={(e) => {
            if (!interactive || e.button !== 0) return;
            e.stopPropagation();
            if (!selected.includes(s.id)) setSel({ strokes: e.shiftKey ? [...selected, s.id] : [s.id] });
            onStrokeDown(e, s.id);
          }}
        >
          <StrokeShape s={s} sel={selected.includes(s.id)} />
          {interactive && (s.tool === "rect" || s.tool === "ellipse" || s.tool === "line" || s.tool === "arrow") && (
            <StrokeShape s={{ ...s, color: "transparent", width: Math.max(14, s.width + 10), fill: undefined }} />
          )}
        </g>
      ))}
    </svg>
  );
});
