// Кадр 3.0 → HyperFrames.
// Один и тот же EDL становится HTML-композицией, которую можно открыть в
// HyperFrames Studio и отрендерить в MP4 на десктопе. Браузерный Canvas и
// HyperFrames получают одинаковый монтажный список.
import { serializeEdl } from "./edl.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const f = (n) => Number(n).toFixed(3);

export function buildHyperComposition(edl, { videoSrc = "assets/video.mp4", title = "Кадр 3.0" } = {}) {
  const W = edl.output.width, H = edl.output.height;
  const pieces = [];
  const tweens = [];

  edl.spans.forEach((s, i) => {
    pieces.push(`    <video id="kadr-clip-${i}" class="clip" src="${esc(videoSrc)}" data-media-start="${f(s.clip.in)}" data-start="${f(s.start)}" data-duration="${f(s.duration)}" data-track-index="0" data-has-audio="true"></video>`);
  });

  edl.captions.forEach((c, i) => {
    const words = (c.words || []).map((w, n) =>
      `<span id="kadr-word-${i}-${n}" class="word">${esc(w.text)}</span>`).join(" ");
    pieces.push(`    <div id="kadr-cue-${i}" class="clip caption" data-start="${f(c.start)}" data-duration="${f(c.end - c.start)}" data-track-index="1">${words}</div>`);
    tweens.push(`  tl.fromTo("#kadr-cue-${i}", { opacity: 0, y: 34 }, { opacity: 1, y: 0, duration: 0.2, ease: "power2.out" }, ${f(c.start)});`);
    tweens.push(`  tl.fromTo("#kadr-cue-${i}", { opacity: 1 }, { opacity: 0, duration: 0.16, immediateRender: false }, ${f(Math.max(c.start, c.end - 0.16))});`);
    (c.words || []).forEach((w, n) => tweens.push(
      `  tl.fromTo("#kadr-word-${i}-${n}", { color: "#ffffff" }, { color: "${esc(edl.look.accent)}", duration: 0.12, ease: "none" }, ${f(Math.max(0, w.start - c.start))});`
    ));
  });

  edl.graphics.forEach((g, i) => {
    const label = g.label || g.value || g.type;
    pieces.push(`    <div id="kadr-gfx-${i}" class="clip gfx gfx-${esc(g.type)}" data-start="${f(g.at)}" data-duration="${f(g.duration)}" data-track-index="2"><span class="gfx-label">${esc(label)}</span>${(g.steps || []).slice(0, 5).map((s, n) => `<span class="gfx-step">${esc(s)}</span>`).join("")}</div>`);
    tweens.push(`  tl.fromTo("#kadr-gfx-${i}", { opacity: 0, scale: 0.92, y: 28 }, { opacity: 1, scale: 1, y: 0, duration: 0.34, ease: "back.out(1.4)" }, ${f(g.at)});`);
    tweens.push(`  tl.fromTo("#kadr-gfx-${i}", { opacity: 1 }, { opacity: 0, duration: 0.22, immediateRender: false }, ${f(Math.max(g.at, g.at + g.duration - 0.22))});`);
  });

  const edlJson = serializeEdl(edl).replace(/</g, "\\u003c").replace(/<\/script/gi, "<\\/script");
  const css = `
    html,body{margin:0;padding:0;width:${W}px;height:${H}px;overflow:hidden;background:${esc(edl.look.preset === "paper" || edl.look.preset === "halftone" ? "#f2eadc" : "#0d0f12")};font-family:Arial,sans-serif}
    #kadr{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#0d0f12}
    #kadr video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1}
    .caption{position:absolute;left:6%;right:6%;bottom:16%;z-index:5;text-align:center;color:#fff;font-size:66px;font-weight:800;line-height:1.18;text-shadow:0 4px 14px rgba(0,0,0,.9)}
    .caption .word{display:inline-block;margin:0 7px;white-space:pre}
    .gfx{position:absolute;left:8%;right:8%;top:32%;z-index:4;padding:34px 40px;border-radius:24px;background:rgba(12,14,18,.82);color:#fff;display:flex;flex-direction:column;gap:14px}
    .gfx-label{font-size:82px;font-weight:900;line-height:1.05;color:${esc(edl.look.accent)}}
    .gfx-step{font-size:38px;font-weight:600;opacity:.82}
    .gfx-number .gfx-label{font-size:200px}
    .gfx-list .gfx-label{font-size:64px}
    .gfx-behind .gfx-label{font-size:150px;opacity:.45}
  `;

  return `<!doctype html>
<html lang="ru"><head><meta charset="UTF-8"><title>${esc(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>${css}</style></head><body>
  <div id="kadr" data-composition-id="kadr" data-width="${W}" data-height="${H}" data-start="0" data-duration="${f(edl.duration)}">
${pieces.join("\n")}
  </div>
  <script id="kadr-edl" type="application/json">${edlJson}</script>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
${tweens.join("\n")}
    window.__timelines["kadr"] = tl;
  </script>
</body></html>`;
}

export function hyperProjectFiles(edl, opts = {}) {
  const html = buildHyperComposition(edl, opts);
  return [{ path: "index.html", content: html }];
}
