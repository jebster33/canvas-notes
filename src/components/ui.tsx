import { useEffect, useRef, useState, type ReactNode } from "react";
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
      {open && (
        <div className="pop subpop" style={pos} onPointerDown={(e) => e.stopPropagation()}>
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
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
