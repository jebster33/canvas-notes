// Run the sync server on any machine with Node 18+:
//   CANVAS_SYNC_TOKEN=some-long-secret node server/node.mjs
// Env: PORT (default 8787), DATA_DIR (default ./data), CANVAS_SYNC_TOKEN (required, 16+ chars).
// Put it behind HTTPS (Caddy, nginx, Cloudflare Tunnel...) when it's reachable from the internet.

import { createServer } from "node:http";
import { mkdir, readFile, writeFile, readdir, rm, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { handle, MAX_BODY } from "./core.mjs";

const PORT = Number(process.env.PORT || 8787);
const DATA = resolve(process.env.DATA_DIR || "./data");
const TOKEN = process.env.CANVAS_SYNC_TOKEN;

/** One JSON file per board in DATA_DIR. Writes go to a temp file first so a crash can't leave half a board. */
function fileStore(dir) {
  const file = (id) => join(dir, id + ".json");
  return {
    async get(id) {
      try { return JSON.parse(await readFile(file(id), "utf8")); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
    },
    async put(id, doc) {
      const tmp = file(id) + ".tmp";
      await writeFile(tmp, JSON.stringify(doc));
      await rename(tmp, file(id));
    },
    async del(id) { await rm(file(id), { force: true }); },
    async list() {
      const out = [];
      for (const f of await readdir(dir)) {
        if (!f.endsWith(".json")) continue;
        try {
          const d = JSON.parse(await readFile(join(dir, f), "utf8"));
          out.push({ id: d.id, rev: d.rev, updatedAt: d.updatedAt, name: d.name });
        } catch { /* skip unreadable files */ }
      }
      return out;
    },
  };
}

await mkdir(DATA, { recursive: true });
const store = fileStore(DATA);
// Saves for the same board run one after another, so the revision check can't race.
const queues = new Map();
const serial = (key, fn) => {
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  queues.set(key, next.catch(() => {}));
  return next;
};

createServer((req, res) => {
  const chunks = [];
  let size = 0;
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_BODY) { res.writeHead(413).end(); req.destroy(); return; }
    chunks.push(c);
  });
  req.on("end", async () => {
    const url = new URL(req.url || "/", "http://localhost");
    const r = { method: req.method || "GET", path: url.pathname, query: url.searchParams, headers: req.headers, body: Buffer.concat(chunks).toString("utf8") };
    const out = await serial(url.pathname, () => handle(r, store, TOKEN));
    res.writeHead(out.status, out.headers).end(out.body);
  });
}).listen(PORT, () => {
  console.log(`Canvas Notes sync server on http://localhost:${PORT}  (data: ${DATA})`);
  if (!TOKEN || TOKEN.length < 16) console.warn("Set CANVAS_SYNC_TOKEN (16+ characters) or every request will be refused.");
});
