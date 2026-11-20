import type { Board, CardNode } from "./types";
import { DEFAULT_THEME } from "./theme";
import { defaultNode, uid } from "./store";
import { starterTable } from "./table";

/** First-run board that demonstrates each card type and how to use them. */
export function welcomeBoard(): Board {
  let z = 0;
  const mk = (type: CardNode["type"], x: number, y: number, p: Partial<CardNode>): CardNode => ({
    ...defaultNode(type, x, y, z++),
    ...p,
  });

  const hub = mk("note", 0, 0, {
    title: "Welcome to Canvas Notes",
    w: 320, h: 230, x: -160, y: -115,
    html:
      "<p>This is a board. Double-click empty space to add a card, or press <strong>N</strong> for a note.</p>" +
      "<ul><li>Right-drag on empty space to draw a box and make a card in it</li><li>Left-drag empty space to move around</li>" +
      "<li>Drag a dot on a card's edge to connect it</li>" +
      "<li>Press <strong>Ctrl K</strong> to search everything</li></ul>",
  });
  const task = mk("task", 0, 0, {
    title: "Plan the launch", x: 280, y: -330, w: 300, h: 210,
    html: "<p>Status, owner, due date and priority live right on the card.</p>",
    task: { status: "working", owner: "Me", due: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), priority: "high", progress: 40 },
  });
  const table = mk("table", 0, 0, {
    title: "Budget", x: 280, y: -60, w: 420, h: 220,
    table: starterTable([["Item", "Qty", "Price"], ["Domain", "1", "12"], ["Hosting", "12", "5"]], ["text", "number", "number"]),
  });
  const sticky = mk("sticky", 0, 0, {
    x: 280, y: 220, w: 210, h: 190,
    html: "<p>Sticky notes are for quick thoughts. Change their color from the bar above a selected card.</p>",
  });
  const tips = mk("note", 0, 0, {
    title: "Styling", x: -560, y: -140, w: 300, h: 220,
    html:
      "<p>Select a card to style just that card. Open <strong>Sheet settings</strong> (top right) to change fonts, " +
      "sizes and colors for the whole board. Cards you styled by hand keep a small dot until you reset them.</p>",
  });
  const nodes = [hub, task, table, sticky, tips];
  const e = (from: string, to: string, label = "") => ({ id: uid(), from, to, label });

  return {
    id: uid(),
    name: "Welcome",
    color: "#8B7CF6",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    theme: structuredClone(DEFAULT_THEME),
    nodes,
    edges: [e(hub.id, task.id, "next"), e(hub.id, table.id), e(hub.id, sticky.id), { ...e(tips.id, hub.id), shape: "straight", dashed: true }],
    strokes: [],
    viewport: { x: 0, y: 0, zoom: 0.85 },
    order: 0,
  };
}
