import { Component, type ReactNode } from "react";
import type { CardNode } from "../lib/types";

/**
 * Keeps one broken card from taking down the whole board: if a card throws
 * while rendering, show a small placeholder in its place instead.
 */
export class CardBoundary extends Component<{ node: CardNode; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  componentDidCatch(e: unknown) {
    console.error("Card failed to render", this.props.node.id, e);
  }

  componentDidUpdate(prev: { node: CardNode }) {
    // An edit (e.g. undo) may fix the card: try again when its data changes.
    if (this.state.error && prev.node !== this.props.node) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const n = this.props.node;
    return (
      <div className="card card-broken" data-node={n.id} style={{ left: n.x, top: n.y, width: n.w, height: Math.max(90, Math.min(n.h, 160)), zIndex: 10 + n.z }}>
        <b>This card couldn't load</b>
        <small>{n.title || n.type} · {this.state.error.slice(0, 120)}</small>
        <small>Undo (Ctrl Z) may bring it back, or delete it and keep going.</small>
      </div>
    );
  }
}
