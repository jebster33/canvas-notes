import { useStore } from "./store";

const strip = (s: string) => s.trim().toLowerCase();

/**
 * Follow a [[wiki link]]: jump to a card with that title (this board first,
 * then any board), else a board with that name, else create a linked note.
 */
export function openWikiLink(name: string, fromNodeId: string) {
  const st = useStore.getState();
  const cur = st.board();
  if (!cur) return;
  const want = strip(name);
  const local = cur.nodes.find((n) => strip(n.title) === want && n.id !== fromNodeId);
  if (local) {
    useStore.setState({ focus: local.id });
    return;
  }
  for (const b of Object.values(st.boards)) {
    const hit = b.nodes.find((n) => strip(n.title) === want);
    if (hit) {
      st.openBoard(b.id);
      useStore.setState({ focus: hit.id });
      return;
    }
  }
  const board = Object.values(st.boards).find((b) => strip(b.name) === want);
  if (board) {
    st.openBoard(board.id);
    return;
  }
  const from = cur.nodes.find((n) => n.id === fromNodeId);
  if (!from) return;
  const id = st.addNode("note", from.x + from.w + 220, from.y + from.h / 2, { title: name.trim() });
  st.addEdge(fromNodeId, id);
  useStore.setState({ focus: id });
  st.flash(`Created "${name.trim()}"`);
}
