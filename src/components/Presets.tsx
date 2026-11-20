import type { CardStyle } from "../lib/types";
import { BOARD_PRESETS, CARD_PRESETS, type BoardPreset, withOpacity } from "../lib/theme";

/** A tiny card drawn with a given style, used for previews and preset tiles. */
export function MiniCard({ s, title, children, className = "" }: { s: CardStyle; title?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div
      className={"mini-card shadow-" + s.shadow + (s.opacity < 100 ? " glass" : "") + " " + className}
      style={{
        background: withOpacity(s.bg, s.opacity ?? 100),
        border: s.borderWidth > 0 ? `${s.borderWidth}px ${s.borderStyle} ${s.border}` : "none",
        borderRadius: Math.min(s.radius, 18),
        color: s.textColor,
        fontFamily: s.fontFamily,
        fontWeight: s.bold ? 650 : undefined,
        fontStyle: s.italic ? "italic" : undefined,
        textDecoration: s.underline ? "underline" : undefined,
        textAlign: s.align,
        padding: Math.max(6, s.padding * 0.6),
        ["--card-accent" as string]: s.accent,
      }}
    >
      {s.accentBar !== "none" && <i className={"mini-accent " + s.accentBar} style={{ background: s.accent }} />}
      {title && <b>{title}</b>}
      {children}
    </div>
  );
}

/** Grid of premade card looks; `base` is the style they are layered on. */
export function CardPresetGrid({ base, onPick }: { base: CardStyle; onPick(style: Partial<CardStyle> | null): void }) {
  return (
    <div className="preset-grid">
      {CARD_PRESETS.map((p) => (
        <button key={p.id} className="preset-tile" title={p.name} onClick={() => onPick(p.style)}>
          <MiniCard s={{ ...base, ...(p.style ?? {}) }}>
            <span className="mini-line" />
            <span className="mini-line short" />
          </MiniCard>
          <span className="preset-name">{p.name}</span>
        </button>
      ))}
    </div>
  );
}

export function BoardPresetGrid({ onPick }: { onPick(p: BoardPreset): void }) {
  return (
    <div className="theme-grid">
      {BOARD_PRESETS.map((p) => {
        const [canvas, card, a1, a2] = p.preview;
        return (
          <button key={p.id} className="theme-tile" onClick={() => onPick(p)} title={`Use the ${p.name} look on this board`}>
            <div className="theme-canvas" style={{ background: canvas }}>
              <span className="tc tc1" style={{ background: card, borderColor: p.theme.card?.border ?? "#2C2D38", borderRadius: Math.min(8, p.theme.card?.radius ?? 6) }}>
                <i style={{ background: a1 }} />
              </span>
              <span className="tc tc2" style={{ background: p.theme.types?.sticky?.bg ?? "#F2C66D", borderRadius: 3 }} />
              <span className="tc tc3" style={{ background: card, borderColor: p.theme.card?.border ?? "#2C2D38", borderRadius: Math.min(8, p.theme.card?.radius ?? 6) }}>
                <i style={{ background: a2 }} />
              </span>
              <svg className="tc-line" viewBox="0 0 100 60" preserveAspectRatio="none">
                <path d="M38 20 C 55 20, 50 42, 62 42" stroke={a1} strokeWidth="1.5" fill="none" opacity="0.7" />
              </svg>
            </div>
            <span className="preset-name">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}
