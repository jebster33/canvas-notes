// Captures README screenshots from the dev server with a hidden headless Edge.
//   npm run dev            (in another terminal)
//   node scripts/screenshots.mjs
// Writes PNGs to docs/screenshots/. Uses a throwaway browser profile.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "docs", "screenshots");
const URL = process.env.APP_URL ?? "http://localhost:1420/";
const EDGE = process.env.EDGE ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9333;
const W = 1440, H = 900;
mkdirSync(out, { recursive: true });

const profile = join(tmpdir(), `cn-shots-${Date.now()}`);
const edge = spawn(EDGE, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, "--hide-scrollbars", "--disable-gpu", "--force-color-profile=srgb", "--no-first-run", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page;
for (let i = 0; i < 50 && !page; i++) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    page = list.find((t) => t.type === "page");
  } catch { /* not up yet */ }
}
if (!page) throw new Error("Edge did not start");

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.method === "Runtime.consoleAPICalled" && process.env.SHOW_LOG) console.log("page:", msg.params.args.map((a) => a.value ?? a.preview?.properties?.map((p) => p.name + "=" + p.value).join(" ")).join(" "));
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const shot = async (name) => {
  await sleep(700);
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(out, `${name}.png`), Buffer.from(data, "base64"));
  console.log("saved", name);
};
const store = `(await import("/src/lib/store.ts")).useStore.getState()`;

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

await send("Page.navigate", { url: URL });
await sleep(2500);
// Fresh profile: keep reminders quiet, then build the demo boards.
await evaluate(`localStorage.setItem("cn.reminderPrefs", JSON.stringify({ enabled: false, morning: "09:00", overdue: false, desktop: false })); 1`);
console.log(await evaluate(`(${readFileSync(join(here, "seed-demo.js"), "utf8")})()`));
await send("Page.reload");
await sleep(3000);

// The dev preview labels its storage; show what the desktop app shows instead.
await evaluate(`(async () => { (await import("/src/lib/store.ts")).useStore.setState({ vault: "Documents" + String.fromCharCode(92) + "Canvas Notes" }); return 1; })()`);

// 1. Canvas, zoomed so card text is readable
await evaluate(`(async () => { const s = ${store}; s.setHome(false); s.clearSel(); const v = await import("/src/lib/viewport.ts"); v.centerOn(-40, 120, 0.74); return 1; })()`);
await shot("canvas");

// 2. Sheet settings with themes
await evaluate(`(async () => { const s = ${store}; s.setPanel("settings"); return 1; })()`);
await shot("themes");
await evaluate(`(async () => { const s = ${store}; s.setPanel("settings"); return 1; })()`);

// 3. Board (Trello-style) view
await evaluate(`(async () => { const s = ${store}; s.setView("kanban"); return 1; })()`);
await shot("board-view");

// 4. Task detail card
await evaluate(`(async () => { const s = ${store}; const b = s.board(); const t = b.nodes.find(n => n.title === "Finalize landing page"); s.openTask(b.id, t.id); return 1; })()`);
await shot("task-detail");
await evaluate(`(async () => { const s = ${store}; s.closeTask(); s.setView("timeline"); return 1; })()`);
await shot("timeline");

// 5. Graph view
await evaluate(`(async () => { const s = ${store}; s.setView("canvas"); s.setGraph(true); return 1; })()`);
await sleep(4000);

await shot("graph");

// 6. Start menu
await evaluate(`(async () => { const s = ${store}; s.setGraph(false); s.setHome(true); return 1; })()`);
await sleep(1200);
await shot("start-menu");

ws.close();
edge.kill();
await sleep(500);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* Edge may still hold files */ }
