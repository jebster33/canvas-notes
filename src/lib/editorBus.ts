import { create } from "zustand";
import type { Editor } from "@tiptap/react";

/** The Tiptap editor of the card being edited, so toolbars can drive it. */
export const useEditorBus = create<{ editor: Editor | null; tick: number; set(e: Editor | null): void; bump(): void }>((set) => ({
  editor: null,
  tick: 0,
  set: (editor) => set({ editor }),
  bump: () => set((s) => ({ tick: s.tick + 1 })),
}));
