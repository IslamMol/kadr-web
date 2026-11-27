// Кадр 3.0 — браузерная студия на новом EDL-ядре.
// Открыть: studio3.html. Сначала видео, потом один клик на приём, потом экспорт.
import {
  Input, ALL_FORMATS, BlobSource, Output, BufferTarget,
  Mp4OutputFormat, Conversion, canEncodeAudio, VideoSample,
} from "mediabunny";
import { registerAacEncoder } from "@mediabunny/aac-encoder";
import {
  normalizeEdl, outputTimeForSource, frameState, LOOKS, CAPTION_TEMPLATES,
} from "./edl.js";
import { renderFrame } from "./frame.js";
import { GHOST_RECIPES, styleById } from "./ghost.js";

const $ = (s) => document.querySelector(s);
const W = 1080, H = 1920;
const state = {
  file: null, url: null, video: null, duration: 0, edl: null,
  t: 0, playing: false, recipe: "clean", look: "clean", busy: false, conversion: null, result: null,
};

const LOOK_MAP = { clean: "clean", cinematic: "cinematic", editorial: "editorial", kinetic: "kinetic", launch: "launch", meme: "magazine", pop: "magazine" };
const CAP_MAP = { clean: "clean", serif: "blur", editorial: "highlighter", pop: "pop", type: "outline", outline: "outline", upper: "clean" };

function coverDraw(ctx, video, x, y, w, h) {
  const vw = video.videoWidth || 1080, vh = video.videoHeight || 1920;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale, dh = vh * scale;
  ctx.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function buildEdl() {
  const start = Math.max(0, Number($("#in")?.value) || 0);
  const rawEnd = Number($("#out")?.value);
  const end = Number.isFinite(rawEnd) && rawEnd > start ? Math.min(rawEnd, state.duration || rawEnd) : (state.duration || 6);
  const span = Math.max(0.2, end - start);
  const lines = ($("#words")?.value || "").split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 30);
  const step = lines.length ? span / lines.length : 0;
  const s = styleById(state.recipe);
  const template = CAP_MAP[s.effect] || "clean";
  const cues = lines.map((text, i) => ({
    id: `cue-${i + 1}`, start: i * step, end: (i + 1) * step,
    text, template, keyword: text.split(/\s+/)[0] || "",
    words: text.split(/\s+/).filter(Boolean).map((w, n, all) => ({
      text: w, start: i * step + step * n / all.length, end: i * step + step * (n + 1) / all.length,
    })),
  }));
  const preset = LOOK_MAP[state.look] || "clean";
  const lookStyle = styleById(state.look);
  const grain = lookStyle.film === "film" ? 0.16 : lookStyle.film === "grain" ? 0.08 : 0;
  const graphicType = ["quote", "number", "diagram"].includes(s.scene) ? s.scene : "quote";
  const graphics = cues.length ? [{
    id: "beat", type: graphicType, at: span * 0.55, duration: Math.min(2.6, span * 0.4),
    label: graphicType === "number" ? String(cues.length) + " фразы" : cues[0].text,
    value: String(cues.length), steps: cues.slice(0, 4).map(c => c.text), template,
  }] : [];
  const motion = s.kinetic === "headline" ? [] : [{
    id: "motion", type: s.kinetic === "spring" ? "word-slam" : s.kinetic === "scramble" ? "spring" : "rise",
    at: 0, duration: Math.min(0.8, span * 0.3),
  }];
  state.edl = normalizeEdl({
    name: "Кадр 3.0",
    output: { width: W, height: H, fps: 30 },
    clips: [{ id: "main", src: "video", in: start, out: end }],
    captions: cues, graphics, motion,
    look: { preset, accent: lookStyle.accent, grain, vignette: preset === "cinematic" ? 0.4 : 0.14 },
  });
  state.t = 0;
  $("#range").max = String(Math.max(0.1, state.edl.duration));
  $("#range").value = "0";
  $("#status").textContent = `Готово: ${state.edl.duration.toFixed(1)} с, ${cues.length} фраз, ${graphics.length} сцена.`;
  draw();
}

function draw() {
  if (!state.edl) return;
  const ctx = $("#canvas").getContext("2d");
  const sources = state.video ? {
    video: {
      draw(c, rect) { coverDraw(c, state.video, rect.x, rect.y, rect.w, rect.h); },
    },
  } : {};
  renderFrame(ctx, state.edl, state.t, sources);
  $("#time").textContent = `${state.t.toFixed(1)} / ${state.edl.duration.toFixed(1)} с`;
}

async function loadFile(file) {
  if (!file || state.busy) return;
  state.file = file;
  if (state.url) URL.revokeObjectURL(state.url);
  state.url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = state.url; video.muted = true; video.playsInline = true; video.preload = "metadata";
  await new Promise((res, rej) => {
    video.onloadedmetadata = res;
    video.onerror = () => rej(new Error("Не удалось прочитать видео. Попробуй MP4 или WebM."));
  });
  state.video = video;
  state.duration = video.duration;
  $("#in").value = "0";
  $("#out").value = String(Math.min(state.duration, 30));
  $("#status").textContent = `Видео загружено: ${state.duration.toFixed(1)} с. Напиши фразы и нажми «Собрать проект».`;
  buildEdl();
}

async function exportMp4() {
  if (!state.file || !state.edl || state.busy) return;
  state.busy = true;
  const btn = $("#export"); btn.disabled = true; btn.textContent = "Собираем…";
  $("#progress").style.display = "block";
  let conversion = null;
  try {
    if (!(await canEncodeAudio("aac"))) registerAacEncoder();
    const input = new Input({ source: new BlobSource(state.file), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("В файле нет видеодорожки.");
    if (!(await canEncodeAudio("aac"))) registerAacEncoder();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
    const clip = state.edl.clips[0];
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false });
    const video = {
      codec: "avc", width: 1080, height: 1920, fit: "fill",
      processedWidth: W, processedHeight: H, frameRate: 30, bitrate: 7_000_000,
      allowRotationMetadata: false,
      process: (sample) => {
        const sourceT = sample.timestamp;
        if (sourceT < clip.in || sourceT >= clip.out) return null;
        const outputT = outputTimeForSource(state.edl, sourceT);
        renderFrame(ctx, state.edl, outputT, {
          video: { draw(c, rect) { sample.draw(c, rect.x, rect.y, rect.w, rect.h); } },
        });
        return new VideoSample(canvas, { timestamp: outputT, duration: sample.duration });
      },
    };
    conversion = await Conversion.init({
      input, output, tracks: "primary",
      trim: { start: clip.in, end: clip.out },
      video,
      audio: { codec: "aac", bitrate: 128_000 },
      showWarnings: false,
    });
    conversion.onProgress = (p) => {
      const pct = Math.round(Math.max(0, Math.min(1, p)) * 100);
      $("#progress span").style.width = pct + "%";
    };
    await conversion.execute();
    const data = output.target.buffer;
    if (!data?.byteLength) throw new Error("Не удалось получить MP4. Попробуй другой файл.");
    if (state.result?.url) URL.revokeObjectURL(state.result.url);
    state.result = { name: "kadr3.mp4", url: URL.createObjectURL(new Blob([data], { type: "video/mp4" })) };
    const a = $("#download");
    a.href = state.result.url; a.download = state.result.name; a.style.display = "block";
    $("#status").textContent = "Готово. MP4 собран в браузере, без загрузки видео на сервер.";
  } catch (e) {
    $("#status").textContent = e?.message || "Не удалось собрать ролик.";
  } finally {
    state.busy = false; state.conversion = conversion;
    btn.disabled = false; btn.textContent = "Собрать MP4";
    $("#progress").style.display = "none";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("#recipes").innerHTML = GHOST_RECIPES.map(r => {
    const s = styleById(r.style);
    return `<button type="button" class="card" data-recipe="${r.id}" style="--accent:${s.accent}"><i></i><strong>${r.name}</strong><small>${r.what}</small></button>`;
  }).join("");
  const lookNames = { clean: "Чистый", editorial: "Редакционный", kinetic: "Кинетический", cinematic: "Кино", launch: "Запуск", magazine: "Журнал" };
  $("#looks").innerHTML = LOOKS.map(id => `<button type="button" class="card" data-look="${id}"><i style="--accent:${id === "cinematic" ? "#e7c27a" : "#b9c6ff"}"></i><strong>${lookNames[id] || id}</strong></button>`).join("");
  $("#file").addEventListener("change", e => loadFile(e.target.files?.[0]).catch(err => { $("#status").textContent = err.message; }));
  $("#build").addEventListener("click", buildEdl);
  $("#export").addEventListener("click", exportMp4);
  $("#recipes").addEventListener("click", e => {
    const b = e.target.closest("[data-recipe]"); if (!b) return;
    state.recipe = b.dataset.recipe;
    document.querySelectorAll("[data-recipe]").forEach(x => x.classList.toggle("active", x === b));
    buildEdl();
  });
  $("#looks").addEventListener("click", e => {
    const b = e.target.closest("[data-look]"); if (!b) return;
    state.look = b.dataset.look;
    document.querySelectorAll("[data-look]").forEach(x => x.classList.toggle("active", x === b));
    buildEdl();
  });
  $("#range").addEventListener("input", e => { state.t = Number(e.target.value); draw(); });
  $("#play").addEventListener("click", () => {
    if (!state.video || !state.edl) return;
    const v = state.video, clip = state.edl.clips[0];
    if (!state.playing) {
      v.currentTime = clip.in + state.t; v.play();
      state.playing = true; $("#play").textContent = "Пауза";
      const tick = () => {
        if (!state.playing) return;
        state.t = Math.max(0, Math.min(state.edl.duration, v.currentTime - clip.in));
        $("#range").value = String(state.t); draw();
        if (state.t >= state.edl.duration - 0.02) { v.pause(); state.playing = false; $("#play").textContent = "Играть"; return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } else {
      v.pause(); state.playing = false; $("#play").textContent = "Играть";
    }
  });
  document.querySelector('[data-recipe="clean"]')?.classList.add("active");
  document.querySelector('[data-look="clean"]')?.classList.add("active");
  state.edl = normalizeEdl({
    output: { width: W, height: H, fps: 30 },
    clips: [{ id: "main", src: "video", in: 0, out: 6 }],
    captions: [{ start: 0.4, end: 5.6, text: "Загрузи видео, напиши фразы и нажми приём", template: "clean" }],
    look: { preset: "clean", accent: "#ffd23f" },
  });
  $("#range").max = "6"; draw();
});
