import type { Board, StatusDef } from "./types";

/** The lists every board starts with (ids match tasks made before lists were customizable). */
export const DEFAULT_STATUSES: StatusDef[] = [
  { id: "todo", label: "To do", color: "#5D6070" },
  { id: "working", label: "Working on it", color: "#E39B2B" },
  { id: "stuck", label: "Stuck", color: "#E2445C" },
  { id: "done", label: "Done", color: "#2FAE6E", done: true },
];

export const STATUS_COLORS = ["#5D6070", "#6EA8FE", "#8B7CF6", "#5EC2B0", "#2FAE6E", "#E39B2B", "#E2445C", "#F5A3D0"];

export function boardStatuses(b: Board | null | undefined): StatusDef[] {
  return b?.statuses?.length ? b.statuses : DEFAULT_STATUSES;
}

/** Look up a status; unknown ids (e.g. from another board) fall back by id, then to the first list. */
export function statusMeta(b: Board | null | undefined, id: string): StatusDef {
  const list = boardStatuses(b);
  return list.find((s) => s.id === id) ?? DEFAULT_STATUSES.find((s) => s.id === id) ?? list[0];
}

export const isDoneStatus = (b: Board | null | undefined, id: string) => !!statusMeta(b, id).done;

export function firstDone(b: Board | null | undefined) {
  const list = boardStatuses(b);
  return (list.find((s) => s.done) ?? list[list.length - 1]).id;
}

/** Task changes when moving to another list: done lists fill progress, leaving one resets a full bar. */
export function withStatus(b: Board | null | undefined, progress: number, status: string) {
  const done = isDoneStatus(b, status);
  return { status, progress: done ? 100 : progress === 100 ? 60 : progress };
}

/** Task changes when dragging the progress bar: 100% moves it to a done list and back. */
export function withProgress(b: Board | null | undefined, status: string, p: number) {
  const list = boardStatuses(b);
  if (p === 100) return { progress: p, status: firstDone(b) };
  if (isDoneStatus(b, status)) return { progress: p, status: (list.find((s) => !s.done) ?? list[0]).id };
  return { progress: p, status };
}
