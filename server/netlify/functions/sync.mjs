// Netlify Function: the same sync API, stored in Netlify Blobs.
// Set CANVAS_SYNC_TOKEN in Site settings -> Environment variables, then redeploy.
import { getStore } from "@netlify/blobs";
import { handle } from "../../core.mjs";

function blobStore() {
  const s = getStore({ name: "canvas-notes-boards", consistency: "strong" });
  return {
    async get(id) { return (await s.get(id, { type: "json" })) ?? null; },
    async put(id, doc) { await s.setJSON(id, doc, { metadata: { rev: doc.rev, updatedAt: doc.updatedAt, name: doc.name } }); },
    async del(id) { await s.delete(id); },
    async list() {
      const { blobs } = await s.list();
      const out = [];
      for (const b of blobs) {
        const meta = await s.getMetadata(b.key);
        if (meta?.metadata) out.push({ id: b.key, ...meta.metadata });
      }
      return out;
    },
  };
}

export default async (request) => {
  const url = new URL(request.url);
  // Requests arrive as /api/... through the redirect in netlify.toml.
  const path = url.pathname.replace(/^\/\.netlify\/functions\/sync/, "/api");
  const headers = Object.fromEntries(request.headers);
  const body = ["PUT", "POST"].includes(request.method) ? await request.text() : undefined;
  const out = await handle({ method: request.method, path, query: url.searchParams, headers, body }, blobStore(), process.env.CANVAS_SYNC_TOKEN);
  return new Response(out.status === 204 ? null : out.body, { status: out.status, headers: out.headers });
};

export const config = { path: ["/api/*"] };
