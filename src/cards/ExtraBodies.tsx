import { useEffect, useMemo, useRef, useState } from "react";
import { Globe, Play, ExternalLink, RefreshCw, Copy, Check, Paperclip, FileText, FileImage, FileArchive, FileAudio, FileVideo, FileCode, Download, Eye, EyeOff, Mic, Square, Pause, RotateCcw } from "lucide-react";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import lua from "highlight.js/lib/languages/lua";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import csharp from "highlight.js/lib/languages/csharp";
import cpp from "highlight.js/lib/languages/cpp";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import markdown from "highlight.js/lib/languages/markdown";
import powershell from "highlight.js/lib/languages/powershell";
import type { CardNode, WebData } from "../lib/types";
import { useStore } from "../lib/store";
import { fetchPreview, openUrl, openAsset, readAsset, saveAssetCopy, pickFileAsset, saveFileBlob } from "../lib/storage";

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/* ---------------- web link ---------------- */

export function youtubeId(url: string) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i);
  return m?.[1];
}

export async function loadWebCard(id: string, url: string) {
  const st = useStore.getState();
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  const yt = youtubeId(u);
  st.patchNode(id, { web: { url: u, title: "Loading…", description: "", image: yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : "", site: "", youtube: yt } });
  try {
    const p = await fetchPreview(u);
    const web: WebData = { ...p, youtube: yt, image: yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : p.image, title: p.title || p.site || u };
    st.patchNode(id, { web, title: web.title });
  } catch (e) {
    const host = (() => { try { return new URL(u).hostname; } catch { return u; } })();
    st.patchNode(id, { web: { url: u, title: host, description: String(e), image: "", site: host, youtube: yt }, title: host });
  }
}

export function WebBody({ node, selected }: { node: CardNode; selected: boolean }) {
  const w = node.web!;
  const [playing, setPlaying] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => setPlaying(false), [w.url]);

  if (!w.url) {
    return (
      <div className="web-empty" onPointerDown={stop}>
        <Globe size={22} />
        <input
          className="field"
          placeholder="Paste a link and press Enter"
          value={draft}
          autoFocus={selected}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && draft.trim()) loadWebCard(node.id, draft);
          }}
        />
      </div>
    );
  }
  return (
    <div className="web">
      {(w.image || w.youtube) && (
        <div className="web-media">
          {playing && w.youtube ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${w.youtube}?autoplay=1&rel=0`}
              title={w.title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              onPointerDown={stop}
            />
          ) : (
            <>
              <img src={w.image} alt="" draggable={false} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
              {w.youtube && (
                <button className="web-play" onPointerDown={stop} onClick={() => setPlaying(true)} aria-label="Play video"><Play size={22} fill="currentColor" /></button>
              )}
            </>
          )}
        </div>
      )}
      <div className="web-text">
        <div className="web-site">
          <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(w.site || w.url)}&sz=32`} alt="" width={14} height={14} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
          {w.site}
        </div>
        <b className="web-title">{w.title}</b>
        {w.description && <p className="web-desc">{w.description}</p>}
        <div className="web-actions" onPointerDown={stop}>
          <button className="btn" onClick={() => openUrl(w.url)}><ExternalLink size={13} />Open</button>
          {selected && (
            <>
              <button className="btn" onClick={() => loadWebCard(node.id, w.url)} title="Refresh preview"><RefreshCw size={13} /></button>
              <button className="btn" onClick={() => useStore.getState().patchNode(node.id, { web: { url: "", title: "", description: "", image: "", site: "" } })}>Change link</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- code ---------------- */

const LANGS: Record<string, { label: string; def: Parameters<typeof hljs.registerLanguage>[1] }> = {
  javascript: { label: "JavaScript", def: javascript },
  typescript: { label: "TypeScript", def: typescript },
  python: { label: "Python", def: python },
  lua: { label: "Lua / Luau", def: lua },
  rust: { label: "Rust", def: rust },
  csharp: { label: "C#", def: csharp },
  cpp: { label: "C / C++", def: cpp },
  java: { label: "Java", def: java },
  go: { label: "Go", def: go },
  xml: { label: "HTML / XML", def: xml },
  css: { label: "CSS", def: css },
  json: { label: "JSON", def: json },
  sql: { label: "SQL", def: sql },
  bash: { label: "Bash", def: bash },
  powershell: { label: "PowerShell", def: powershell },
  markdown: { label: "Markdown", def: markdown },
};
for (const [k, v] of Object.entries(LANGS)) hljs.registerLanguage(k, v.def);

export function CodeBody({ node, editing }: { node: CardNode; editing: boolean }) {
  const patchNode = useStore((s) => s.patchNode);
  const c = node.code!;
  const [text, setText] = useState(c.text);
  const [copied, setCopied] = useState(false);
  const pre = useRef<HTMLPreElement>(null);
  useEffect(() => setText(c.text), [c.text]);
  const html = useMemo(() => {
    const src = (editing ? text : c.text) || "";
    try {
      return hljs.highlight(src + (src.endsWith("\n") ? " " : ""), { language: c.lang in LANGS ? c.lang : "javascript" }).value;
    } catch {
      return src.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!);
    }
  }, [text, c.text, c.lang, editing]);
  const commit = () => text !== c.text && patchNode(node.id, { code: { ...c, text } });

  return (
    <div className="code">
      <div className="code-bar" onPointerDown={stop}>
        <select className="field" value={c.lang} onChange={(e) => patchNode(node.id, { code: { ...c, lang: e.target.value } })}>
          {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn" title="Copy code" onClick={async () => { await navigator.clipboard.writeText(c.text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <div className="code-area">
        <pre ref={pre} className="hljs" aria-hidden={editing}><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
        {editing ? (
          <textarea
            autoFocus
            spellCheck={false}
            value={text}
            onPointerDown={stop}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onScroll={(e) => {
              if (pre.current) {
                pre.current.scrollTop = e.currentTarget.scrollTop;
                pre.current.scrollLeft = e.currentTarget.scrollLeft;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { commit(); return; }
              e.stopPropagation();
              if (e.key === "Tab") {
                e.preventDefault();
                const t = e.currentTarget, s = t.selectionStart, en = t.selectionEnd;
                const next = text.slice(0, s) + "  " + text.slice(en);
                setText(next);
                requestAnimationFrame(() => (t.selectionStart = t.selectionEnd = s + 2));
              }
            }}
          />
        ) : (
          !c.text && <div className="code-empty">Double-click to write code</div>
        )}
      </div>
    </div>
  );
}

/* ---------------- file ---------------- */

export const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return FileImage;
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return FileArchive;
  if (["mp3", "wav", "ogg", "m4a", "flac", "webm"].includes(ext)) return FileAudio;
  if (["mp4", "mov", "mkv", "avi"].includes(ext)) return FileVideo;
  if (["js", "ts", "py", "rs", "lua", "json", "html", "css", "cs", "cpp", "c", "java", "go"].includes(ext)) return FileCode;
  if (["pdf", "doc", "docx", "txt", "md", "rtf"].includes(ext)) return FileText;
  return Paperclip;
}

export function FileBody({ node }: { node: CardNode }) {
  const patchNode = useStore((s) => s.patchNode);
  const f = node.file;
  const [preview, setPreview] = useState<string | null>(null);
  const isPdf = !!f && /\.pdf$/i.test(f.name);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  if (!f) {
    return (
      <div className="file-empty" onPointerDown={stop}>
        <Paperclip size={20} />
        <span>Drop a file on the canvas, or</span>
        <button
          className="btn outline"
          onClick={async () => {
            const got = await pickFileAsset();
            if (got) patchNode(node.id, { file: { ...got, mime: "" }, title: got.name });
          }}
        >
          Choose a file
        </button>
      </div>
    );
  }
  const Icon = fileIcon(f.name);
  const togglePreview = async () => {
    if (preview) return setPreview(null);
    const url = await readAsset(f.asset);
    const blob = await (await fetch(url)).blob();
    setPreview(URL.createObjectURL(new Blob([blob], { type: "application/pdf" })));
    if (node.h < 360) patchNode(node.id, { h: 460, w: Math.max(node.w, 380) }, false);
  };
  return (
    <div className="file">
      <div className="file-row">
        <span className="file-ic"><Icon size={20} /></span>
        <div className="file-meta">
          <b title={f.name}>{f.name}</b>
          <small>{fmtSize(f.size)}{f.name.includes(".") ? ` · ${f.name.split(".").pop()!.toUpperCase()}` : ""}</small>
        </div>
      </div>
      <div className="file-actions" onPointerDown={stop}>
        <button className="btn outline" onClick={() => openAsset(f.asset).catch((e) => useStore.getState().flash(String(e)))}><ExternalLink size={13} />Open</button>
        {isPdf && <button className="btn" onClick={togglePreview}>{preview ? <EyeOff size={13} /> : <Eye size={13} />}{preview ? "Hide" : "Preview"}</button>}
        <button className="btn" title="Save a copy" onClick={() => saveAssetCopy(f.asset, f.name)}><Download size={13} /></button>
      </div>
      {preview && <iframe className="file-preview" src={preview} title={f.name} onPointerDown={stop} />}
    </div>
  );
}

/* ---------------- voice note ---------------- */

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function VoiceBody({ node }: { node: CardNode }) {
  const patchNode = useStore((s) => s.patchNode);
  const v = node.voice;
  const [rec, setRec] = useState<{ mr: MediaRecorder; t0: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [src, setSrc] = useState("");
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (v?.asset) readAsset(v.asset).then(setSrc).catch(() => setSrc(""));
  }, [v?.asset]);
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setElapsed((Date.now() - rec.t0) / 1000), 200);
    return () => clearInterval(t);
  }, [rec]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const t0 = Date.now();
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        const ext = (mr.mimeType || "audio/webm").includes("ogg") ? "ogg" : "webm";
        const saved = await saveFileBlob(blob, "voice", `voice.${ext}`);
        patchNode(node.id, { voice: { asset: saved.asset, duration: (Date.now() - t0) / 1000 } });
        setRec(null);
      };
      mr.start(250);
      setElapsed(0);
      setRec({ mr, t0 });
    } catch (e) {
      useStore.getState().flash("Microphone not available: " + (e as Error).message);
    }
  };

  if (rec) {
    return (
      <div className="voice recording" onPointerDown={stop}>
        <button className="voice-btn rec" onClick={() => rec.mr.stop()} aria-label="Stop recording"><Square size={14} fill="currentColor" /></button>
        <div className="voice-meta"><b>Recording…</b><small>{mmss(elapsed)}</small></div>
        <span className="rec-dot" />
      </div>
    );
  }
  if (!v) {
    return (
      <div className="voice" onPointerDown={stop}>
        <button className="voice-btn" onClick={start} aria-label="Start recording"><Mic size={16} /></button>
        <div className="voice-meta"><b>{node.title || "Voice note"}</b><small>Click the mic to record</small></div>
      </div>
    );
  }
  const dur = audio.current?.duration && isFinite(audio.current.duration) ? audio.current.duration : v.duration;
  return (
    <div className="voice" onPointerDown={stop}>
      <audio
        ref={audio}
        src={src}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onEnded={() => { setPlaying(false); setPos(0); }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      <button className="voice-btn" disabled={!src} onClick={() => (playing ? audio.current?.pause() : audio.current?.play())} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
      </button>
      <div className="voice-meta">
        <b>{node.title || "Voice note"}</b>
        <div
          className="voice-track"
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            if (audio.current && dur) audio.current.currentTime = ((e.clientX - r.left) / r.width) * dur;
          }}
        >
          <div style={{ width: `${dur ? (pos / dur) * 100 : 0}%` }} />
        </div>
        <small>{mmss(pos)} / {mmss(dur || 0)}</small>
      </div>
      <button className="btn icon" title="Record again" onClick={() => patchNode(node.id, { voice: undefined })}><RotateCcw size={13} /></button>
    </div>
  );
}
