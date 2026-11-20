import { useEffect, useState } from "react";
import { create } from "zustand";
import { X, Plus, LayoutTemplate, Trash2, CalendarRange, Map as MapIcon, GraduationCap, Images, Network, Users } from "lucide-react";
import { BOARD_TEMPLATES, newBoardFromTemplate, useTemplates } from "../lib/templates";

export const usePicker = create<{ open: boolean; set(v: boolean): void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openTemplatePicker = () => usePicker.getState().set(true);

const ICONS: Record<string, typeof Plus> = {
  weekly: CalendarRange, roadmap: MapIcon, study: GraduationCap, mood: Images, mindmap: Network, meeting: Users,
};

/** "New board" dialog: blank, built-in templates and your saved board templates. */
export function TemplatePicker() {
  const open = usePicker((s) => s.open);
  const setOpen = usePicker((s) => s.set);
  const { list, load, remove } = useTemplates();
  const [name, setName] = useState("");
  useEffect(() => { if (open) { load(); setName(""); } }, [open, load]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [open, setOpen]);
  if (!open) return null;
  const mine = list.filter((t) => t.kind === "board");
  const make = (id: string | null) => {
    newBoardFromTemplate(id, name.trim() || undefined);
    setOpen(false);
  };

  return (
    <div className="scrim" onPointerDown={() => setOpen(false)}>
      <div className="pop dialog tp" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="dialog" aria-label="New board">
        <div className="wiz-head"><b><LayoutTemplate size={15} />New board</b><button className="btn icon" onClick={() => setOpen(false)} aria-label="Close"><X size={15} /></button></div>
        <input className="field" placeholder="Board name (optional)" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && make(null)} />
        <div className="tp-grid">
          <button className="tp-card blank" onClick={() => make(null)}>
            <Plus size={20} /><b>Blank board</b><small>Start from scratch</small>
          </button>
          {BOARD_TEMPLATES.map((t) => {
            const I = ICONS[t.id] ?? LayoutTemplate;
            return (
              <button key={t.id} className="tp-card" onClick={() => make(t.id)}>
                <I size={20} /><b>{t.name}</b><small>{t.hint}</small>
              </button>
            );
          })}
        </div>
        {mine.length > 0 && (
          <>
            <div className="wiz-sec">Your templates</div>
            <div className="tp-grid">
              {mine.map((t) => (
                <div key={t.id} className="tp-card mine" role="button" tabIndex={0} onClick={() => make(t.id)} onKeyDown={(e) => e.key === "Enter" && make(t.id)}>
                  <LayoutTemplate size={20} /><b>{t.name}</b><small>{t.board?.nodes.length ?? 0} cards</small>
                  <button className="btn icon tp-del" title="Delete template" onClick={(e) => { e.stopPropagation(); remove(t.id); }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="hint-sm">Save your own: a board's ⋯ menu → Save as template, or select cards → bookmark button.</p>
      </div>
    </div>
  );
}
