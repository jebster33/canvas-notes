import type { Board } from "./types";
import { useStore } from "./store";
import { saveTextFile } from "./storage";
import { strokeBounds } from "./geometry";

/** Collect this page's CSS so the snapshot looks the same outside the app. */
function pageCss() {
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        // Fonts point at the app's own files; the page falls back to system fonts instead.
        if (rule.cssText.startsWith("@font-face")) continue;
        css += rule.cssText + "\n";
      }
    } catch {
      /* cross-origin sheet: skip */
    }
  }
  return css;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Export the board as one self-contained, read-only HTML file: the current
 * canvas DOM (images are already inlined), the app's CSS and a tiny pan/zoom
 * viewer. Nothing in it can edit or talk to anything.
 */
export async function exportWebPage(board: Board) {
  const st = useStore.getState();
  const saved = { sel: st.sel, editing: st.editingId, view: st.view };
  if (st.view !== "canvas") st.setView("canvas");
  useStore.setState({ sel: { nodes: [], edges: [], strokes: [] }, editingId: null, renderAll: true });
  await new Promise((r) => setTimeout(r, 200));
  try {
    const world = document.querySelector<HTMLElement>(".world");
    if (!world) throw new Error("open the board on the canvas first");
    // React keeps input text in a property, not an attribute; copy it over so the clone keeps it.
    const live = Array.from(world.querySelectorAll<HTMLInputElement>("input:not([type=checkbox])"));
    live.forEach((i) => i.setAttribute("data-v", i.value));
    const clone = world.cloneNode(true) as HTMLElement;
    live.forEach((i) => i.removeAttribute("data-v"));
    clone.removeAttribute("style");
    clone.querySelectorAll(".handle, .rz, .marquee, .add-col, .add-row, .sheet-tools, .chart-ctl, .formula-bar, iframe, script").forEach((el) => el.remove());
    // Inputs (titles, task fields) become plain text.
    clone.querySelectorAll<HTMLInputElement>("input:not([type=checkbox])").forEach((inp) => {
      const span = document.createElement("span");
      span.className = inp.className;
      span.textContent = inp.getAttribute("data-v") ?? "";
      inp.replaceWith(span);
    });
    clone.querySelectorAll("textarea, select").forEach((el) => el.remove());
    clone.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
    clone.querySelectorAll("*").forEach((el) => {
      for (const a of Array.from(el.attributes)) if (a.name.startsWith("on")) el.removeAttribute(a.name);
    });

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (r: { x: number; y: number; w: number; h: number }) => {
      x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
    };
    board.nodes.forEach(grow);
    board.strokes.forEach((s) => grow(strokeBounds(s.pts, s.width)));
    if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = 800; y1 = 600; }

    const bg = board.theme.canvasBg;
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(board.name)}</title>
<style>${pageCss()}
html, body { margin: 0; height: 100%; overflow: hidden; background: ${bg}; user-select: text; }
#stage { position: fixed; inset: 0; cursor: grab; background-image: radial-gradient(circle, ${board.theme.gridColor} 1px, transparent 1.6px); background-size: 24px 24px; }
#stage.drag { cursor: grabbing; }
#stage .world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.cn-badge { position: fixed; left: 12px; bottom: 12px; padding: 6px 10px; border-radius: 8px; background: rgba(20,21,27,.9); color: #a1a3b0; font: 12px system-ui, sans-serif; border: 1px solid rgba(255,255,255,.1); }
.cn-badge b { color: #e8e8ef; font-weight: 600; }
</style></head><body>
<div id="stage">${clone.outerHTML}</div>
<div class="cn-badge"><b>${escapeHtml(board.name)}</b> · read-only · drag to move, scroll to zoom</div>
<script>
(function () {
  var stage = document.getElementById("stage"), world = stage.querySelector(".world");
  var b = { x0: ${x0}, y0: ${y0}, x1: ${x1}, y1: ${y1} }, v = { x: 0, y: 0, z: 1 };
  function apply() { world.style.transform = "translate(" + v.x + "px," + v.y + "px) scale(" + v.z + ")"; stage.style.backgroundPosition = v.x + "px " + v.y + "px"; stage.style.backgroundSize = 24 * v.z + "px " + 24 * v.z + "px"; }
  function fit() { var w = innerWidth, h = innerHeight, pad = 60; v.z = Math.min(1.2, (w - pad * 2) / (b.x1 - b.x0), (h - pad * 2) / (b.y1 - b.y0)); v.x = w / 2 - (b.x0 + b.x1) / 2 * v.z; v.y = h / 2 - (b.y0 + b.y1) / 2 * v.z; apply(); }
  var drag = null;
  stage.addEventListener("pointerdown", function (e) { if (e.target.closest(".card-body, .rt")) return; drag = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y }; stage.classList.add("drag"); });
  addEventListener("pointermove", function (e) { if (!drag) return; v.x = drag.vx + e.clientX - drag.x; v.y = drag.vy + e.clientY - drag.y; apply(); });
  addEventListener("pointerup", function () { drag = null; stage.classList.remove("drag"); });
  stage.addEventListener("wheel", function (e) { e.preventDefault(); var z = Math.min(4, Math.max(0.1, v.z * Math.exp(-e.deltaY * 0.0015))); v.x = e.clientX - (e.clientX - v.x) / v.z * z; v.y = e.clientY - (e.clientY - v.y) / v.z * z; v.z = z; apply(); }, { passive: false });
  addEventListener("resize", fit);
  fit();
})();
</script></body></html>`;
    const name = (board.name.replace(/[^\w\- ]+/g, "").trim() || "board") + ".html";
    if (await saveTextFile(name, "html", "Web page", html)) st.flash("Saved a read-only web page of this board");
  } catch (e) {
    st.flash("Couldn't make the web page: " + (e as Error).message);
  } finally {
    useStore.setState({ sel: saved.sel, editingId: saved.editing, renderAll: false });
    if (saved.view !== "canvas") st.setView(saved.view);
  }
}
