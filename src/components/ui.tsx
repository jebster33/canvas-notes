import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

export function Swatches({
  colors, value, onChange, allowNone,
}: { colors: string[]; value?: string; onChange(c: string | undefined): void; allowNone?: string }) {
  return (
    <div className="swatches">
      {allowNone && (
        <button className={"swatch" + (!value ? " on" : "")} title={allowNone} onClick={() => onChange(undefined)}
          style={{ background: "linear-gradient(135deg, transparent 45%, #F27474 46%, #F27474 54%, transparent 55%)" }} />
      )}
      {colors.map((c) => (
        <button
          key={c}
          className={"swatch" + (value?.toLowerCase() === c.toLowerCase() ? " on" : "")}
          style={{ background: c }}
          title={c}
          onClick={() => onChange(c)}
        />
      ))}
      <label className="swatch custom" title="Custom color">
        <input type="color" value={value && value.startsWith("#") && value.length === 7 ? value : "#8b7cf6"} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

/** A button that toggles a small popover anchored beneath it. */
export function PopButton({
  label, title, children, className = "btn icon", align = "center",
}: { label: ReactNode; title: string; children: ReactNode | ((close: () => void) => ReactNode); className?: string; align?: "center" | "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", h, true);
    return () => window.removeEventListener("pointerdown", h, true);
  }, [open]);
  const pos = align === "left" ? { left: 0 } : align === "right" ? { right: 0 } : { left: "50%", transform: "translateX(-50%)" };
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button className={className + (open ? " on" : "")} title={title} aria-label={title} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && <PopPanel pos={pos} onClose={() => setOpen(false)}>{children}</PopPanel>}
    </div>
  );
}

function PopPanel({ pos, onClose, children }: { pos: React.CSSProperties; onClose(): void; children: ReactNode | ((close: () => void) => ReactNode) }) {
  const ref = useRef<HTMLDivElement>(null);
  useKeepOnScreen(ref);
  return (
    <div ref={ref} className="pop subpop" style={pos} onPointerDown={(e) => e.stopPropagation()}>
      {typeof children === "function" ? children(onClose) : children}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange(v: boolean): void; label: string }) {
  return <button className={"toggle" + (on ? " on" : "")} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: ReactNode; title?: string }[]; onChange(v: T): void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} className={o.v === value ? "on" : ""} title={o.title} aria-label={o.title} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NumberField({ value, min, max, onChange, className = "field num" }: { value: number; min: number; max: number; onChange(v: number): void; className?: string }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(txt));
    if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
    else setTxt(String(value));
  };
  return (
    <input
      className={className}
      value={txt}
      inputMode="numeric"
      onChange={(e) => setTxt(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(max, value + 1)); }
        if (e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(min, value - 1)); }
      }}
    />
  );
}

export const CheckIcon = () => <Check size={13} />;

/* ---------------- Select: dark custom dropdown ---------------- */

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  /** Optional colored dot / text color for the option. */
  color?: string;
  /** Extra style for the option label (e.g. a font preview). */
  style?: React.CSSProperties;
}

/**
 * Replacement for <select>: the list renders in a portal at screen coordinates,
 * so it is never clipped by cards, never scaled by canvas zoom, and always uses
 * the app's colors (Windows' native list can come out light-on-light).
 */
export function Select<T extends string | number>({
  value, options, onChange, title, className = "", disabled, placeholder = "Choose…", minWidth, compact, colorText,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange(v: T): void;
  title?: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  minWidth?: number;
  compact?: boolean;
  /** Paint the closed button's text in the chosen option's color. */
  colorText?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  const show = () => {
    if (disabled || !btn.current) return;
    setRect(btn.current.getBoundingClientRect());
    setHi(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const pick = (o: SelectOption<T>) => {
    onChange(o.value);
    setOpen(false);
    btn.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const close = () => setOpen(false);
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("resize", close);
    window.addEventListener("wheel", away, true);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", away, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(".sel-opt.hi")?.scrollIntoView({ block: "nearest" });
  }, [open, hi]);

  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(options.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (options[hi]) pick(options[hi]); }
    else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); setOpen(false); }
  };

  // Open below, or above when there isn't room.
  const below = rect ? window.innerHeight - rect.bottom - 12 : 0;
  const above = rect ? rect.top - 12 : 0;
  const want = Math.min(320, options.length * 32 + 12);
  const up = rect ? below < want && above > below : false;
  // Cap to the room on the chosen side; the list scrolls inside.
  const maxH = Math.max(120, Math.min(320, up ? above : below));
  const width = rect ? Math.max(rect.width, minWidth ?? 0, 150) : 0;
  const left = rect ? Math.min(rect.left, window.innerWidth - width - 8) : 0;

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={"dd" + (compact ? " compact" : "") + (open ? " open" : "") + " " + className}
        title={title}
        aria-label={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
      >
        {current?.color && !colorText && <i className="sel-dot" style={{ background: current.color }} />}
        <span className="sel-val" style={{ ...(current?.style ?? {}), color: colorText ? current?.color : undefined }}>{current?.label ?? placeholder}</span>
        <svg className="sel-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && rect &&
        createPortal(
          <div
            ref={list}
            className="pop sel-list"
            role="listbox"
            style={{ left, width, maxHeight: maxH, ...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }) }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {options.map((o, i) => (
              <div
                key={String(o.value)}
                role="option"
                aria-selected={o.value === value}
                className={"sel-opt" + (i === hi ? " hi" : "") + (o.value === value ? " on" : "")}
                onPointerEnter={() => setHi(i)}
                onClick={() => pick(o)}
              >
                {o.color && <i className="sel-dot" style={{ background: o.color }} />}
                <span style={o.style}>{o.label}</span>
                {o.value === value && <Check size={13} className="sel-check" />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * Keep a popup fully inside the window: nudges it up/left when it would spill
 * past an edge, and caps its height (scrolling inside) when it is taller than
 * the window. Works for fixed and absolutely positioned popups that live
 * outside the zoomed canvas.
 */
export function useKeepOnScreen<T extends HTMLElement>(ref: React.RefObject<T>, active = true, margin = 8) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const fit = () => {
      el.style.translate = "";
      el.style.maxHeight = "";
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const avail = vh - margin * 2;
      const h = Math.min(r.height, avail);
      if (r.height > avail) {
        el.style.maxHeight = `${avail}px`;
        el.style.overflowY = "auto";
      }
      let dx = 0, dy = 0;
      if (r.top + h > vh - margin) dy = vh - margin - (r.top + h);
      if (r.top + dy < margin) dy = margin - r.top;
      if (r.right > vw - margin) dx = vw - margin - r.right;
      if (r.left + dx < margin) dx = margin - r.left;
      if (dx || dy) el.style.translate = `${Math.round(dx)}px ${Math.round(dy)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  });
}
