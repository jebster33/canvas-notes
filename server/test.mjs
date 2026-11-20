// node --test server/test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, memoryStore } from "./core.mjs";

const TOKEN = "test-token-1234567890";
const auth = { authorization: "Bearer " + TOKEN };
const call = (store, method, path, body, headers = auth) => {
  const u = new URL(path, "http://x");
  return handle({ method, path: u.pathname, query: u.searchParams, headers, body: body && JSON.stringify(body) }, store, TOKEN).then((r) => ({ ...r, json: r.body ? JSON.parse(r.body) : null }));
};
const board = (name = "A") => ({ id: "b1", name, nodes: [], edges: [], strokes: [] });

test("health works without a token", async () => {
  const r = await call(memoryStore(), "GET", "/api/health", null, {});
  assert.equal(r.status, 200);
  assert.equal(r.json.configured, true);
});

test("refuses wrong or missing tokens", async () => {
  const s = memoryStore();
  assert.equal((await call(s, "GET", "/api/boards", null, {})).status, 401);
  assert.equal((await call(s, "GET", "/api/boards", null, { authorization: "Bearer nope" })).status, 401);
});

test("refuses everything when no token is configured", async () => {
  const r = await handle({ method: "GET", path: "/api/boards", query: new URLSearchParams(), headers: auth }, memoryStore(), "");
  assert.equal(r.status, 503);
});

test("save, read, conflict, resolve", async () => {
  const s = memoryStore();
  let r = await call(s, "PUT", "/api/boards/b1", { board: board(), baseRev: null });
  assert.equal(r.status, 200);
  assert.equal(r.json.rev, 1);
  r = await call(s, "GET", "/api/boards/b1");
  assert.equal(r.json.board.name, "A");
  // Device 2 saves from rev 1.
  r = await call(s, "PUT", "/api/boards/b1", { board: board("B"), baseRev: 1 });
  assert.equal(r.json.rev, 2);
  // Device 1 still thinks it's rev 1: conflict, gets the newer board back.
  r = await call(s, "PUT", "/api/boards/b1", { board: board("C"), baseRev: 1 });
  assert.equal(r.status, 409);
  assert.equal(r.json.board.name, "B");
  assert.equal(r.json.rev, 2);
  // Retrying from the newest rev works.
  r = await call(s, "PUT", "/api/boards/b1", { board: board("C"), baseRev: 2 });
  assert.equal(r.json.rev, 3);
  r = await call(s, "GET", "/api/boards");
  assert.deepEqual(r.json.boards.map((b) => [b.id, b.rev, b.name]), [["b1", 3, "C"]]);
});

test("rejects bad ids and mismatched bodies", async () => {
  const s = memoryStore();
  assert.equal((await call(s, "GET", "/api/boards/..%2Fetc")).status, 400);
  assert.equal((await call(s, "PUT", "/api/boards/b2", { board: board(), baseRev: null })).status, 400);
});

test("changes since and delete", async () => {
  const s = memoryStore();
  const t0 = Date.now() - 1;
  await call(s, "PUT", "/api/boards/b1", { board: board(), baseRev: null });
  let r = await call(s, "GET", `/api/changes?since=${t0}`);
  assert.equal(r.json.boards.length, 1);
  assert.equal((await call(s, "DELETE", "/api/boards/b1?baseRev=7")).status, 409);
  assert.equal((await call(s, "DELETE", "/api/boards/b1?baseRev=1")).status, 200);
  assert.equal((await call(s, "GET", "/api/boards/b1")).status, 404);
});
