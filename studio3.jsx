// Кадр 3.0 — браузерная студия на новом EDL-ядре.
// Открыть: studio3.html. Сначала видео, потом один клик на приём, потом экспорт.
import {
  Input, ALL_FORMATS, BlobSource, Output, BufferTarget,
  Mp4OutputFormat, Conversion, canEncodeAudio, VideoSample,
} from "mediabunny";
import { registerAacEncoder } from "@mediabunny/aac-encoder";
import {
  normalizeEdl, outputTimeForSource, sourceTimeAt, sourceSpanAt, frameState, mapCuesToOutput, LOOKS, CAPTION_TEMPLATES,
} from "./edl.js";
import { renderFrame } from "./frame.js";
import { planGhostEdit } from "./ghost.js";
import { createASRWorker, wordsToCues } from "./asr.js";
import { KADR_TEMPLATES, KADR_EXAMPLES, templateById, planBeats } from "./templates.js";

const $ = (s) => document.querySelector(s);
const W = 1080, H = 1920;
const state = {
  file: null, url: null, video: null, duration: 0, edl: null,
  t: 0, playing: false, template: "clean", busy: false, conversion: null, result: null,
  cues: null, excluded: new Set(), asrBusy: false, asrWorker: null,
};

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
  const tpl = templateById(state.template);
  const captionTemplate = tpl.caption;
  const grain = ["cinematic", "halftone", "ink"].includes(tpl.look) ? 0.16 : tpl.look === "paper" ? 0.06 : 0;
  const vignette = ["cinematic", "halftone", "ink"].includes(tpl.look) ? 0.38 : 0.12;
  const look = { preset: tpl.look, accent: tpl.accent, grain, vignette };
  let clips, cues;

  if (state.cues?.length) {
    // Слова с таймингами: убираем дубли по правилам ghost-editor и режем по словам.
    const selected = state.cues.filter(c =>
      !state.excluded.has(c.id) && c.end > start && c.start < end);
    const plan = planGhostEdit(selected, { start, end });
    const pieces = (plan.pieces.length ? plan.pieces : [{ from: start, to: end }])
      .slice().sort((a, b) => a.from - b.from);
    clips = pieces.map((p, i) => ({
      id: `take-${i + 1}`, src: "video",
      in: Math.max(start, p.from), out: Math.min(end, Math.max(p.from + 0.04, p.to)),
    })).filter(c => c.out > c.in);
    if (!clips.length) clips = [{ id: "main", src: "video", in: start, out: end }];
    const base = normalizeEdl({ output: { width: W, height: H, fps: 30 }, clips, look });
    cues = mapCuesToOutput(base, (plan.sentences.length ? plan.sentences : selected).map(c => ({
      ...c, template: captionTemplate, keyword: String(c.text || "").split(/\s+/)[0] || "",
    })));
  } else {
    // Ручной режим: фразы распределяются равномерно по выбранному куску.
    const lines = ($("#words")?.value || "").split(/\n+/).map(x => x.trim()).filter(Boolean).slice(0, 30);
    const step = lines.length ? span / lines.length : 0;
    clips = [{ id: "main", src: "video", in: start, out: end }];
    cues = lines.map((text, i) => ({
      id: `cue-${i + 1}`, start: i * step, end: (i + 1) * step,
      text, template: captionTemplate, keyword: text.split(/\s+/)[0] || "",
      words: text.split(/\s+/).filter(Boolean).map((w, n, all) => ({
        text: w, start: i * step + step * n / all.length, end: i * step + step * (n + 1) / all.length,
      })),
    }));
  }

  const graphics = planBeats(cues, tpl.id);
  const beatSpan = cues.length ? cues[cues.length - 1].end : span;
  const motion = [{
    id: "motion", type: tpl.motion === "scramble" ? "spring" : tpl.motion,
    at: 0, duration: Math.min(0.8, Math.max(0.2, beatSpan) * 0.3),
  }];

  state.edl = normalizeEdl({
    name: "Кадр 3.0", output: { width: W, height: H, fps: 30 },
    clips, captions: cues, graphics, motion, look,
  });
  state.t = 0;
  $("#range").max = String(Math.max(0.1, state.edl.duration));
  $("#range").value = "0";
  $("#status").textContent = `${tpl.name}: ${state.edl.duration.toFixed(1)} с, ${clips.length} склеек, ${cues.length} фраз, ${graphics.length} сцен.`;
  renderCues();
  draw();
}

function renderCues() {
  const box = $("#cues");
  if (!state.cues?.length) { box.innerHTML = ""; return; }
  box.innerHTML = state.cues.map((c, i) =>
    `<label class="cue-row"><input type="checkbox" data-cue="${c.id}" ${state.excluded.has(c.id) ? "" : "checked"}><span>${String(c.text || "").slice(0, 90)}</span><time>${c.start.toFixed(1)}с</time></label>`
  ).join("");
}

function parseSrt(raw) {
  const blocks = String(raw || "").replace(/\r/g, "").trim().split(/\n\s*\n+/);
  return blocks.flatMap((b, i) => {
    const lines = b.split("\n").filter(Boolean);
    const time = lines.find(l => l.includes("-->"));
    if (!time) return [];
    const [a, z] = time.split("-->").map(t => t.trim().replace(",", "."));
    const sec = (x) => {
      const p = x.split(":").map(Number);
      return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : 0;
    };
    const start = sec(a), end = sec(z);
    if (!(end > start)) return [];
    const words = lines.filter(l => l !== time && !/^\d+$/.test(l.trim()))
      .join(" ").trim().split(/\s+/).filter(Boolean);
    const step = (end - start) / Math.max(1, words.length);
    return [{
      id: `srt-${i + 1}`, start, end, text: words.join(" "),
      words: words.map((text, n) => ({ text, start: start + step * n, end: start + step * (n + 1) })),
    }];
  });
}

async function transcribe() {
  if (!state.file || state.asrBusy) return;
  state.asrBusy = true;
  const btn = $("#asr"); btn.disabled = true; btn.textContent = "Загружаем модель…";
  let ctx;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx || !window.OfflineAudioContext || !window.Worker)
      throw new Error("Для распознавания нужен актуальный Chrome или Edge на компьютере.");
    ctx = new AudioCtx();
    let decoded;
    try { decoded = await ctx.decodeAudioData(await state.file.arrayBuffer()); }
    catch { throw new Error("Не удалось прочитать звук. Нужен MP4 с AAC, WAV или загрузи SRT."); }
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
    const node = offline.createBufferSource();
    node.buffer = decoded; node.connect(offline.destination); node.start();
    const rendered = await offline.startRendering();
    const audio = rendered.getChannelData(0).slice();
    try { await ctx.close(); } catch {} ctx = null;
    const { worker, revoke } = createASRWorker();
    state.asrWorker = worker;
    const result = await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => {
        if (data.type === "recognizing") btn.textContent = "Распознаём речь…";
        else if (data.type === "complete") { worker.terminate(); revoke(); resolve(data.result); }
        else if (data.type === "error") { worker.terminate(); revoke(); reject(new Error("Не удалось запустить модель. Проверь интернет; можно загрузить SRT.")); }
      };
      worker.onerror = () => { worker.terminate(); revoke(); reject(new Error("Модель не запустилась. Проверь интернет и память.")); };
      worker.postMessage({ audio, language: $("#language").value }, [audio.buffer]);
    });
    const parsed = wordsToCues(result, state.duration);
    state.cues = parsed.cues; state.excluded = new Set();
    $("#words").value = parsed.cues.map(c => c.text).join("\n");
    $("#status").textContent = `Распознано ${parsed.cues.length} фраз со словами. Дубли убираются автоматически.`;
    buildEdl();
  } catch (e) {
    $("#status").textContent = e?.message || "Не удалось распознать речь.";
  } finally {
    if (ctx) { try { await ctx.close(); } catch {} }
    state.asrBusy = false; state.asrWorker = null;
    btn.disabled = false; btn.textContent = "Распознать речь";
  }
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
  video.onseeked = () => draw();
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
    const clips = state.edl.clips;
    const sourceStart = Math.min(...clips.map(c => c.in));
    const sourceEnd = Math.max(...clips.map(c => c.out));
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false });
    const video = {
      codec: "avc", width: 1080, height: 1920, fit: "fill",
      processedWidth: W, processedHeight: H, frameRate: 30, bitrate: 7_000_000,
      allowRotationMetadata: false,
      process: (sample) => {
        // Mediabunny给出了 trim 之后的相对时间；EDL 用绝对源时间。
        const absoluteT = sample.timestamp + sourceStart;
        const hit = sourceSpanAt(state.edl, absoluteT);
        if (!hit) return null;
        const outputT = hit.outputT;
        renderFrame(ctx, state.edl, outputT, {
          video: { draw(c, rect) { sample.draw(c, rect.x, rect.y, rect.w, rect.h); } },
        });
        return new VideoSample(canvas, { timestamp: outputT, duration: sample.duration });
      },
    };
    conversion = await Conversion.init({
      input, output, tracks: "primary",
      trim: { start: sourceStart, end: sourceEnd },
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

async function loadExample(id) {
  const ex = KADR_EXAMPLES.find(x => x.id === id);
  if (!ex || state.busy) return;
  try {
    if (!state.file) {
      const res = await fetch("./demo-portrait.mp4");
      if (!res.ok) throw new Error("Пример не найден рядом со страницей.");
      const blob = await res.blob();
      await loadFile(new File([blob], "демо-дубль.mp4", { type: "video/mp4" }));
    }
    state.template = ex.template;
    state.cues = ex.cues.map(c => ({ ...c, id: c.id || `ex-${Math.random().toString(36).slice(2, 8)}` }));
    state.excluded = new Set();
    $("#words").value = state.cues.map(c => c.text).join("\n");
    document.querySelectorAll("[data-template]").forEach(x => x.classList.toggle("active", x.dataset.template === ex.template));
    document.querySelectorAll("[data-example]").forEach(x => x.classList.toggle("active", x.dataset.example === id));
    $("#status").textContent = ex.note;
    buildEdl();
  } catch (e) {
    $("#status").textContent = e?.message || "Не удалось открыть пример.";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.__kadr3 = state; // debugging / tests: живой EDL доступен из консоли
  $("#templates").innerHTML = KADR_TEMPLATES.map(t =>
    `<button type="button" class="card" data-template="${t.id}" style="--accent:${t.accent}"><i></i><strong>${t.name}</strong><small>${t.what}<br><em>${t.bestFor}</em></small></button>`
  ).join("");
  $("#examples").innerHTML = KADR_EXAMPLES.map(e =>
    `<button type="button" class="card" data-example="${e.id}"><i style="--accent:#b9c6ff"></i><strong>${e.name}</strong><small>${e.note}</small></button>`
  ).join("");
  $("#file").addEventListener("change", e => loadFile(e.target.files?.[0]).catch(err => { $("#status").textContent = err.message; }));
  $("#build").addEventListener("click", buildEdl);
  $("#export").addEventListener("click", exportMp4);
  $("#asr").addEventListener("click", transcribe);
  $("#srt-load").addEventListener("click", () => $("#srt").click());
  $("#srt").addEventListener("change", e => {
    const file = e.target.files?.[0]; if (!file) return;
    file.text().then(raw => {
      const cues = parseSrt(raw).filter(c => c.start < (state.duration || Infinity));
      if (!cues.length) throw new Error("В SRT не найдено фраз с таймингом.");
      state.cues = cues; state.excluded = new Set();
      $("#words").value = cues.map(c => c.text).join("\n");
      $("#status").textContent = `SRT загружен: ${cues.length} фраз.`;
      buildEdl();
    }).catch(err => { $("#status").textContent = err.message || "Не удалось прочитать SRT."; });
  });
  $("#cues").addEventListener("change", e => {
    const id = e.target.dataset.cue; if (!id) return;
    if (e.target.checked) state.excluded.delete(id); else state.excluded.add(id);
    buildEdl();
  });
  $("#templates").addEventListener("click", e => {
    const b = e.target.closest("[data-template]"); if (!b) return;
    state.template = b.dataset.template;
    document.querySelectorAll("[data-template]").forEach(x => x.classList.toggle("active", x === b));
    buildEdl();
  });
  $("#examples").addEventListener("click", e => {
    const b = e.target.closest("[data-example]"); if (!b) return;
    loadExample(b.dataset.example);
  });
  $("#range").addEventListener("input", e => {
    state.t = Number(e.target.value);
    if (state.video && !state.playing && state.edl) state.video.currentTime = sourceTimeAt(state.edl, state.t);
    draw();
  });
  $("#play").addEventListener("click", () => {
    if (!state.video || !state.edl) return;
    const v = state.video;
    if (!state.playing) {
      v.currentTime = sourceTimeAt(state.edl, state.t); v.play();
      state.playing = true; $("#play").textContent = "Пауза";
      const tick = () => {
        if (!state.playing) return;
        const mapped = outputTimeForSource(state.edl, v.currentTime);
        if (Math.abs(mapped - state.t) > 0.12) v.currentTime = sourceTimeAt(state.edl, Math.min(state.edl.duration, state.t + 1 / 30));
        state.t = Math.max(0, Math.min(state.edl.duration, mapped));
        $("#range").value = String(state.t); draw();
        if (state.t >= state.edl.duration - 0.02) { v.pause(); state.playing = false; $("#play").textContent = "Играть"; return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } else {
      v.pause(); state.playing = false; $("#play").textContent = "Играть";
    }
  });
  document.querySelector('[data-template="clean"]')?.classList.add("active");
  state.edl = normalizeEdl({
    output: { width: W, height: H, fps: 30 },
    clips: [{ id: "main", src: "video", in: 0, out: 6 }],
    captions: [{ start: 0.4, end: 5.6, text: "Загрузи видео, напиши фразы и нажми приём", template: "clean" }],
    look: { preset: "clean", accent: "#ffd23f" },
  });
  $("#range").max = "6"; draw();
});
