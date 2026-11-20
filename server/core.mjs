// Canvas Notes sync server: the part shared by every host (plain Node, Docker, Netlify).
// It stores whole boards with a revision number. A save only goes through when the
// client says which revision it started from, so two devices can't silently
// overwrite each other: the second one gets a 409 with the newer board instead.
//
// Storage is pluggable: { get(id), put(id, doc), del(id), list() } where doc is
// { board, rev, updatedAt, name }.

import { timingSafeEqual } from "node:crypto";

export const VERSION = 1;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_BODY = 25 * 1024 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

const json = (status, body) => ({ status, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify(body) });

function authorized(header, token) {
  if (!token || token.length < 16) return false;
  const m = /^Bearer (.+)$/.exec(header || "");
  if (!m) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Handle one request.
 * @param {{ method: string, path: string, query: URLSearchParams, headers: Record<string,string|undefined>, body?: string }} req
 * @param {{ get(id:string):Promise<any>, put(id:string, doc:any):Promise<void>, del(id:string):Promise<void>, list():Promise<any[]> }} store
 * @param {string|undefined} token  the shared secret (CANVAS_SYNC_TOKEN)
 */
export async function handle(req, store, token) {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS, body: "" };
  const path = req.path.replace(/\/+$/, "") || "/";

  if (path === "/api/health") return json(200, { ok: true, service: "canvas-notes-sync", version: VERSION, configured: !!token && token.length >= 16 });

  if (!token || token.length < 16) return json(503, { error: "The server has no CANVAS_SYNC_TOKEN set (use at least 16 characters)." });
  if (!authorized(req.headers.authorization, token)) return json(401, { error: "Wrong or missing token." });

  try {
    if (path === "/api/boards" && req.method === "GET") {
      const list = await store.list();
      return json(200, { boards: list.map(({ id, rev, updatedAt, name }) => ({ id, rev, updatedAt, name })) });
    }

    if (path === "/api/changes" && req.method === "GET") {
      const since = Number(req.query.get("since") || 0);
      const list = (await store.list()).filter((d) => d.updatedAt > since);
      const boards = [];
      for (const d of list) boards.push(await store.get(d.id));
      return json(200, { now: Date.now(), boards: boards.filter(Boolean) });
    }

    const m = /^\/api\/boards\/([^/]+)$/.exec(path);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (!ID.test(id)) return json(400, { error: "Bad board id." });
      const cur = await store.get(id);

      if (req.method === "GET") return cur ? json(200, cur) : json(404, { error: "No such board." });

      if (req.method === "PUT") {
        if ((req.body?.length ?? 0) > MAX_BODY) return json(413, { error: "Board is too big." });
        let input;
        try { input = JSON.parse(req.body || "{}"); } catch { return json(400, { error: "Body must be JSON." }); }
        const board = input?.board;
        if (!board || typeof board !== "object" || board.id !== id || !Array.isArray(board.nodes)) return json(400, { error: "Expected { board, baseRev } with board.id matching the URL." });
        const base = input.baseRev ?? null;
        if (cur && base !== cur.rev) return json(409, { error: "Someone saved a newer version.", ...cur });
        if (!cur && base !== null) return json(409, { error: "This board was deleted on the server.", rev: null });
        const doc = { id, board, rev: (cur?.rev ?? 0) + 1, updatedAt: Date.now(), name: String(board.name ?? "").slice(0, 200) };
        await store.put(id, doc);
        return json(200, { rev: doc.rev, updatedAt: doc.updatedAt });
      }

      if (req.method === "DELETE") {
        if (!cur) return json(404, { error: "No such board." });
        const base = Number(req.query.get("baseRev"));
        if (base !== cur.rev) return json(409, { error: "Someone saved a newer version.", ...cur });
        await store.del(id);
        return json(200, { ok: true });
      }
    }
    return json(404, { error: "Not found." });
  } catch (e) {
    return json(500, { error: "Server error: " + (e && e.message ? e.message : String(e)) });
  }
}

/** Keeps everything in memory (tests, quick trials). */
export function memoryStore() {
  const m = new Map();
  return {
    async get(id) { return m.has(id) ? structuredClone(m.get(id)) : null; },
    async put(id, doc) { m.set(id, structuredClone(doc)); },
    async del(id) { m.delete(id); },
    async list() { return [...m.values()].map((d) => ({ id: d.id, rev: d.rev, updatedAt: d.updatedAt, name: d.name })); },
  };
}
