// Кадр 3.0: предпоказ / мэшап. Живая смена шаблонов на одном демо-дубле.
import { normalizeEdl } from "./edl.js";
import { renderFrame } from "./frame.js";
import { templateById, planBeats } from "./templates.js";
import { icon, hydrateIcons } from "./icons.js";

const IDS = ["clean", "editorial", "cinematic", "kinetic", "caption-news", "step-deck"];
const W = 540, H = 960, SHOT = 2.4;
const state = { frames: [], edls: [], start: 0 };

function demoSource(ctx, rect, localT = 0) {
  if (state.frames.length) {
    const frame = state.frames[Math.floor(Math.abs(localT) * 1.5) % state.frames.length];
    ctx.drawImage(frame, rect.x, rect.y, rect.w, rect.h);
    return;
  }
  ctx.fillStyle = "#1b2530"; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

function makeEdl(tpl) {
  const words = tpl.sample.split(/\s+/).filter(Boolean).slice(0, 2);
  const step = 1.2 / Math.max(1, words.length);
  const cues = [
    { id: "a", start: 0.05, end: 1.25, text: words.join(" "), template: tpl.caption,
      words: words.map((text, i) => ({ text, start: 0.05 + step * i, end: 0.05 + step * (i + 1) })) },
    { id: "b", start: 1.3, end: 2.35, text: "39%", template: tpl.caption,
      words: [{ text: "39%", start: 1.3, end: 2.35 }] },
  ];
  const grain = ["cinematic", "ink", "halftone", "graph"].includes(tpl.look) ? 0.12 : 0.04;
  return normalizeEdl({
    output: { width: W, height: H, fps: 30 },
    clips: [{ id: "demo", src: "video", in: 0, out: SHOT }],
    captions: cues,
    graphics: planBeats(cues, tpl.id),
    look: { preset: tpl.look, accent: tpl.accent, grain, vignette: 0.18 },
  });
}

async function loadFrames() {
  const video = document.createElement("video");
  video.src = "./demo-portrait.mp4"; video.muted = true; video.playsInline = true;
  try {
    await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = rej; });
    for (const t of [0.25, 1.1, 2.3]) {
      await new Promise(res => { video.onseeked = res; video.currentTime = Math.min(t, Math.max(0, video.duration - 0.05)); });
      const c = document.createElement("canvas"); c.width = 216; c.height = 384;
      c.getContext("2d").drawImage(video, 0, 0, 216, 384);
      state.frames.push(c);
    }
  } catch {}
}

function setNow(tpl, index) {
  const title = document.getElementById("now-title");
  const what = document.getElementById("now-what");
  const meta = document.getElementById("now-meta");
  if (title) title.textContent = `${tpl.name} · ${index + 1}/${IDS.length}`;
  if (what) what.textContent = tpl.what;
  if (meta) meta.textContent = `Субтитры: ${tpl.caption} · Графика: ${tpl.graphic} · Моушен: ${tpl.motion}`;
}

function loop(now) {
  requestAnimationFrame(loop);
  if (!state.start) state.start = now;
  const elapsed = (now - state.start) / 1000;
  if (document.hidden) return;
  const total = IDS.length * SHOT;
  const at = elapsed % total;
  const index = Math.floor(at / SHOT);
  const local = at - index * SHOT;
  const tpl = templateById(IDS[index]);
  const canvas = document.getElementById("mashup");
  renderFrame(canvas.getContext("2d"), state.edls[index], local, { video: { draw: demoSource } });
  setNow(tpl, index);
  const bar = document.querySelector(".progress span");
  if (bar) bar.style.width = `${(at / total) * 100}%`;
}

document.addEventListener("DOMContentLoaded", async () => {
  hydrateIcons(document);
  state.edls = IDS.map(id => makeEdl(templateById(id)));
  await loadFrames();
  requestAnimationFrame(loop);
});
