// Кадр 3.0: предпоказ / мэшап. Живая смена шаблонов на одном демо-дубле.
import { renderTemplatePreview } from "./preview-frame.js";
import { templateById } from "./templates.js";
import { hydrateIcons } from "./icons.js";

const IDS = ["clean", "editorial", "cinematic", "kinetic", "caption-news", "step-deck"];
const SHOT = 2.4;
const state = { frames: [], start: 0 };

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

function frameAt(t) {
  if (!state.frames.length) return null;
  return state.frames[Math.floor(Math.abs(t) * 1.5) % state.frames.length];
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
  if (document.hidden) return;
  const total = IDS.length * SHOT;
  const at = (now - state.start) / 1000 % total;
  const index = Math.floor(at / SHOT);
  const local = at - index * SHOT;
  const tpl = templateById(IDS[index]);
  const canvas = document.getElementById("mashup");
  renderTemplatePreview(canvas.getContext("2d"), tpl, local, frameAt(local));
  setNow(tpl, index);
  const bar = document.querySelector(".progress span");
  if (bar) bar.style.width = `${(at / total) * 100}%`;
}

document.addEventListener("DOMContentLoaded", async () => {
  hydrateIcons(document);
  await loadFrames();
  try { await document.fonts.load('800 28px "Kadr Manrope"'); await document.fonts.ready; } catch {}
  requestAnimationFrame(loop);
});
