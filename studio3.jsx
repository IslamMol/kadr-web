// Кадр 3.0 — браузерная студия на новом EDL-ядре.
// Открыть: studio3.html. Сначала видео, потом один клик на приём, потом экспорт.
import {
  Input, ALL_FORMATS, BlobSource, Output, BufferTarget,
  Mp4OutputFormat, Conversion, canEncodeAudio, VideoSample,
} from "mediabunny";
import { registerAacEncoder } from "@mediabunny/aac-encoder";
import {
  normalizeEdl, outputTimeForSource, sourceTimeAt, sourceSpanAt, frameState, mapCuesToOutput, LOOKS, CAPTION_TEMPLATES, GRAPHIC_TYPES,
} from "./edl.js";
import { renderFrame } from "./frame.js";
import { renderTemplatePreview } from "./preview-frame.js";
import { planGhostEdit } from "./ghost.js";
import { createASRWorker, wordsToCues } from "./asr.js";
import { KADR_TEMPLATES, KADR_EXAMPLES, templateById, planBeats } from "./templates.js";
import { createProject3, readProject3 } from "./project3.js";
import { buildApprovalSheet, qaApproval } from "./approval.js";
import { wordBoundaries, snapTime } from "./snap.js";
import { icon, hydrateIcons } from "./icons.js";
import { detectSilences, removeSilences } from "./silence.js";

const $ = (s) => document.querySelector(s);
const W = 1080, H = 1920;
const state = {
  file: null, url: null, video: null, duration: 0, edl: null,
  t: 0, playing: false, template: "clean", busy: false, conversion: null, result: null,
  cues: null, excluded: new Set(), asrBusy: false, asrWorker: null,
  manualGraphics: [], approved: false, drag: null,
  cutDeltas: {}, originalBounds: [], snapPoints: [],
  previewEdls: {}, previewVisible: new Set(), previewTimer: 0,
  silences: [], demoFrames: [],
};

function coverDraw(ctx, video, x, y, w, h) {
  const vw = video.videoWidth || 1080, vh = video.videoHeight || 1920;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale, dh = vh * scale;
  ctx.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// Сдвиг внутренней склейки: оба соседних клипа двигаются на одинаковую
// дельту, поэтому длительность и тайминг субтитров остаются согласованными.
function applyCutDeltas(clips) {
  const out = clips.map(c => ({ ...c }));
  state.originalBounds = out.map(c => c.out);
  for (const [key, val] of Object.entries(state.cutDeltas || {})) {
    const i = Number(key);
    if (!val || !out[i + 1] || Math.abs(out[i].out - Number(val.base)) > 0.05) continue;
    const lo = Math.max(out[i].in + 0.1 - out[i].out, -out[i + 1].in);
    const hi = Math.min((state.duration || 1e6) - out[i].out, out[i + 1].out - 0.1 - out[i + 1].in);
    const d = Math.max(lo, Math.min(hi, Number(val.delta) || 0));
    out[i].out = Math.max(out[i].in + 0.1, out[i].out + d);
    out[i + 1].in = Math.max(0, out[i + 1].in + d);
  }
  return out;
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
    let pieces = (plan.pieces.length ? plan.pieces : [{ from: start, to: end }])
      .slice().sort((a, b) => a.from - b.from);
    if ($("#remove-pauses")?.checked) pieces = removeSilences(pieces, state.silences);
    if (!pieces.length) pieces = [{ from: start, to: end }];
    clips = pieces.map((p, i) => ({
      id: `take-${i + 1}`, src: "video",
      in: Math.max(start, p.from), out: Math.min(end, Math.max(p.from + 0.04, p.to)),
    })).filter(c => c.out > c.in);
    if (!clips.length) clips = [{ id: "main", src: "video", in: start, out: end }];
    clips = applyCutDeltas(clips);
    const base = normalizeEdl({ output: { width: W, height: H, fps: 30 }, clips, look });
    cues = mapCuesToOutput(base, (plan.sentences.length ? plan.sentences : selected).map(c => ({
      ...c, template: captionTemplate, keyword: String(c.text || "").split(/\s+/)[0] || "",
    })));
  } else {
    // Пока речь не распознана — просто видео без выдуманных фраз.
    clips = [{ id: "main", src: "video", in: start, out: end }];
    state.originalBounds = clips.map(c => c.out);
    cues = [];
  }

  const graphics = [...planBeats(cues, tpl.id), ...state.manualGraphics].slice(0, 12);
  const beatSpan = cues.length ? cues[cues.length - 1].end : span;
  const motion = [{
    id: "motion", type: tpl.motion === "scramble" ? "spring" : tpl.motion,
    at: 0, duration: Math.min(0.8, Math.max(0.2, beatSpan) * 0.3),
  }];

  state.edl = normalizeEdl({
    name: "Кадр 3.0", output: { width: W, height: H, fps: 30 },
    clips, captions: cues, graphics, motion, look,
  });
  state.snapPoints = wordBoundaries(state.edl);
  state.t = 0;
  $("#range").max = String(Math.max(0.1, state.edl.duration));
  $("#range").value = "0";
  $("#status").textContent = `${tpl.name}: ${state.edl.duration.toFixed(1)} с, ${clips.length} склеек, ${cues.length} фраз, ${graphics.length} сцен.`;
  state.approved = false;
  const consent = $("#approved"); if (consent) consent.checked = false;
  renderCues();
  renderScenes();
  renderTimeline();
  renderApproval();
  draw();
}

function renderCues() {
  const box = $("#cues");
  if (!box) return;
  if (!state.cues?.length) { box.innerHTML = ""; return; }
  box.innerHTML = state.cues.map((c, i) => `
    <div class="cue-editor-row" data-cue="${c.id}">
      <div class="cue-top">
        <button type="button" class="cue-jump" data-act="jump" aria-label="Перейти к фразе">${c.start.toFixed(1)}с</button>
        <input type="number" class="cue-time" data-field="start" step="0.01" min="0" value="${c.start.toFixed(2)}" aria-label="Начало фразы">
        <span class="cue-dash">—</span>
        <input type="number" class="cue-time" data-field="end" step="0.01" min="0" value="${c.end.toFixed(2)}" aria-label="Конец фразы">
        <button type="button" class="cue-icon" data-act="delete" aria-label="Удалить фразу">${icon("trash", 13)}</button>
      </div>
      <input type="text" class="cue-text" data-field="text" value="${esc(c.text)}" aria-label="Текст фразы">
      <div class="cue-words">${(c.words || []).map(w => `<span class="cue-word">${esc(w.text)}<small>${w.start.toFixed(2)}</small></span>`).join("")}</div>
      <div class="cue-actions">
        <button type="button" class="small" data-act="split" ${i === state.cues.length - 1 ? "disabled" : ""}><span data-icon="scissors"></span> Разделить здесь</button>
        <button type="button" class="small" data-act="merge" ${i === state.cues.length - 1 ? "disabled" : ""}>Слить со следующей</button>
      </div>
    </div>`).join("");
  hydrateIcons(box);
}

function updateCueField(id, field, value) {
  const c = state.cues.find(x => x.id === id);
  if (!c) return;
  if (field === "text") {
    c.text = String(value || "").trim().slice(0, 160);
    c.words = recomputeWords(c);
  } else {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    if (field === "start") {
      const delta = Math.max(0, n) - c.start;
      c.start += delta; c.end = Math.max(c.start + 0.04, c.end + delta);
      c.words = c.words.map(w => ({ ...w, start: w.start + delta, end: w.end + delta }));
    } else {
      const old = Math.max(0.04, c.end - c.start);
      c.end = Math.max(c.start + 0.04, n);
      const ratio = (c.end - c.start) / old;
      c.words = c.words.map(w => ({ ...w,
        start: c.start + (w.start - c.start) * ratio,
        end: c.start + (w.end - c.start) * ratio,
      }));
    }
  }
  buildEdl();
}

function splitCue(id) {
  const i = state.cues.findIndex(x => x.id === id);
  if (i < 0) return;
  const c = state.cues[i];
  const words = c.words.length ? c.words : recomputeWords(c);
  const idx = Math.max(1, Math.min(words.length - 1, Math.round(words.length / 2)));
  if (words.length < 2) return;
  const at = words[idx].start;
  const a = { ...c, id: `${c.id}-a`, end: at, words: words.slice(0, idx) };
  const b = { ...c, id: `${c.id}-b`, start: at, words: words.slice(idx) };
  a.text = a.words.map(w => w.text).join(" ");
  b.text = b.words.map(w => w.text).join(" ");
  if (!a.text || !b.text) return;
  state.cues.splice(i, 1, a, b);
  buildEdl();
}

function mergeCue(id) {
  const i = state.cues.findIndex(x => x.id === id);
  if (i < 0 || i >= state.cues.length - 1) return;
  const a = state.cues[i], b = state.cues[i + 1];
  a.end = b.end;
  a.text = `${a.text} ${b.text}`.replace(/\s+/g, " ").trim();
  a.words = [...a.words, ...b.words].sort((x, y) => x.start - y.start);
  state.cues.splice(i + 1, 1);
  buildEdl();
}

function deleteCue(id) {
  state.cues = state.cues.filter(c => c.id !== id);
  buildEdl();
}

const esc = (s) => String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function renderScenes() {
  const box = $("#scenes");
  if (!box) return;
  if (!state.manualGraphics.length) { box.innerHTML = '<p class="hint">Сцен пока нет. Нажми «Добавить сцену».</p>'; return; }
  box.innerHTML = state.manualGraphics.map(g =>
    `<div class="scene-row" data-scene="${g.id}">
      <input type="number" step="0.1" min="0" aria-label="Время сцены" data-field="at" value="${g.at.toFixed(2)}">
      <input type="text" aria-label="Текст сцены" data-field="label" value="${esc(g.label)}">
      <select aria-label="Тип сцены" data-field="type">${GRAPHIC_TYPES.map(t => `<option value="${t}" ${g.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
      <button type="button" class="small icon-btn" data-act="jump" aria-label="Перейти к сцене">${icon("arrow", 14)}</button>
      <button type="button" class="small icon-btn" data-act="delete" aria-label="Удалить сцену">${icon("trash", 14)}</button>
    </div>`).join("");
}

function addScene() {
  const tpl = templateById(state.template);
  const at = Math.max(0, Number(state.t) || 0);
  const textNow = (state.cues || []).find(c => at >= c.start && at <= c.end)?.text || tpl.sample;
  state.manualGraphics.push({
    id: `manual-${Date.now().toString(36)}`, type: GRAPHIC_TYPES.includes(tpl.graphic) ? tpl.graphic : "title",
    at, duration: 2.2, label: String(textNow).slice(0, 70), value: "", steps: [], template: tpl.caption,
  });
  buildEdl();
}

function updateScene(id, field, value) {
  const g = state.manualGraphics.find(x => x.id === id);
  if (!g) return;
  if (field === "at") g.at = Math.max(0, Number(value) || 0);
  else g[field] = String(value).slice(0, 120);
  buildEdl();
}

function jumpTo(t) {
  if (!state.edl) return;
  state.t = Math.max(0, Math.min(state.edl.duration, t));
  const r = $("#range"); if (r) r.value = String(state.t);
  if (state.video && !state.playing) state.video.currentTime = sourceTimeAt(state.edl, state.t);
  draw();
}

function renderTimeline() {
  const bar = $("#timeline");
  if (!bar || !state.edl) return;
  const dur = Math.max(0.001, state.edl.duration);
  bar.innerHTML = "";
  state.edl.spans.slice(0, -1).forEach((s, i) => {
    const cut = document.createElement("button");
    cut.type = "button"; cut.className = "cut"; cut.dataset.cut = String(i);
    cut.dataset.base = String(state.originalBounds[i] ?? s.end);
    cut.style.left = `${s.end / dur * 100}%`;
    cut.title = `Склейка ${i + 1} — перетащи или нажми для перехода`;
    cut.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const rect = bar.getBoundingClientRect();
      state.drag = {
        type: "cut", index: i, startX: e.clientX, startAt: s.end, at: s.end,
        base: Number(cut.dataset.base), rect,
      };
      try { cut.setPointerCapture?.(e.pointerId); } catch {}
    });
    bar.appendChild(cut);
  });
  state.manualGraphics.forEach(g => {
    const chip = document.createElement("button");
    chip.type = "button"; chip.className = "scene-chip"; chip.dataset.scene = g.id;
    chip.style.left = `${Math.min(97, g.at / dur * 100)}%`;
    chip.style.setProperty("--chip", templateById(state.template).accent);
    chip.textContent = g.type; chip.title = `${g.type} · ${g.at.toFixed(1)}с — перетащи`;
    chip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const rect = bar.getBoundingClientRect();
      state.drag = { type: "scene", id: g.id, startX: e.clientX, startAt: g.at, at: g.at, rect };
      try { chip.setPointerCapture?.(e.pointerId); } catch {}
    });
    bar.appendChild(chip);
  });
  const head = document.createElement("span");
  head.className = "playhead"; head.style.left = `${state.t / dur * 100}%`;
  bar.appendChild(head);
}

function onDragMove(e) {
  const d = state.drag;
  if (!d || !state.edl) return;
  const dur = Math.max(0.001, state.edl.duration);
  const delta = (e.clientX - d.startX) / Math.max(1, d.rect.width) * dur;
  const raw = Math.max(0, Math.min(dur, d.startAt + delta));
  const tol = Math.max(0.02, 10 / Math.max(1, d.rect.width) * dur);
  const snapped = snapTime(raw, state.snapPoints, tol);
  d.at = snapped.time; d.snapped = snapped.snapped;
  const el = d.type === "cut"
    ? document.querySelector(`[data-cut="${d.index}"]`)
    : document.querySelector(`[data-scene="${d.id}"]`);
  if (el) {
    el.style.left = `${Math.min(99, d.at / dur * 100)}%`;
    el.classList.toggle("snapped", snapped.snapped);
  }
}

function onDragEnd() {
  const d = state.drag;
  if (!d) return;
  state.drag = null;
  if (d.type === "cut") {
    const moved = d.at - d.startAt;
    if (Math.abs(moved) < 0.03) jumpTo(d.startAt);
    else {
      const key = String(d.index);
      const prev = state.cutDeltas[key];
      state.cutDeltas[key] = { delta: (prev?.delta || 0) + moved, base: prev?.base ?? d.base };
      buildEdl();
    }
    return;
  }
  updateScene(d.id, "at", d.at);
}

function renderApproval() {
  const list = $("#approval-list");
  if (!list || !state.edl) return;
  const sheet = buildApprovalSheet(state.edl);
  const warnings = qaApproval(state.edl, sheet);
  list.innerHTML = sheet.length ? sheet.map((p, i) =>
    `<button type="button" class="approval-row" data-approval="${i}"><time>${p.time.toFixed(2)}с</time><span><strong>${p.title}</strong><small>${esc(p.detail)}</small></span></button>`
  ).join("") : '<p class="hint">Точек проверки нет.</p>';
  const warnBox = $("#approval-warnings");
  if (warnBox) warnBox.innerHTML = warnings.map(w => `<p><strong>${esc(w.title)}.</strong> ${esc(w.detail)}</p>`).join("");
  const summary = $("#approval-box summary");
  if (summary) summary.innerHTML = `${icon("check", 14)} Лист проверки перед сборкой · ${sheet.length}`;
  const btn = $("#export");
  if (btn) btn.disabled = sheet.length > 0 && !state.approved;
}

async function saveProject() {
  if (!state.file || !state.edl || state.busy) return;
  try {
    const blob = createProject3({
      edl: state.edl,
      editor: {
        template: state.template, cues: state.cues || [], excluded: [...state.excluded],
        manualGraphics: state.manualGraphics, cutDeltas: state.cutDeltas,
        removePauses: $("#remove-pauses").checked, silences: state.silences,
        start: $("#in").value, end: $("#out").value,
      },
    }, state.file);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base = String(state.file.name || "ролик").replace(/\.[^.]+$/, "");
    a.href = url; a.download = `Кадр3 — ${base}.kadr3`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    $("#status").textContent = "Проект .kadr3 сохранён вместе с видео.";
  } catch (e) { $("#status").textContent = e?.message || "Не удалось сохранить проект."; }
}

async function openProject(file) {
  if (!file || state.busy) return;
  try {
    const project = await readProject3(file);
    await loadFile(project.blob);
    state.template = project.editor.template;
    state.cues = project.editor.cues.length ? project.editor.cues : null;
    state.excluded = new Set(project.editor.excluded);
    state.manualGraphics = project.editor.manualGraphics;
    state.cutDeltas = project.editor.cutDeltas || {};
    state.silences = project.editor.silences || [];
    $("#remove-pauses").checked = project.editor.removePauses !== false;
    $("#in").value = String(project.editor.start);
    $("#out").value = String(project.editor.end);
    state.edl = project.edl;
    state.snapPoints = wordBoundaries(state.edl);
    $("#range").max = String(Math.max(0.1, state.edl.duration));
    state.t = 0;
    document.querySelectorAll("[data-template]").forEach(x => x.classList.toggle("active", x.dataset.template === state.template));
    state.approved = false;
    const consent = $("#approved"); if (consent) consent.checked = false;
    renderCues(); renderScenes(); renderTimeline(); renderApproval(); draw();
    $("#status").textContent = `Открыт проект: ${project.name}. ${state.edl.duration.toFixed(1)} с, ${state.edl.clips.length} склеек.`;
  } catch (e) { $("#status").textContent = e?.message || "Не удалось открыть проект."; }
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

// Лёгкая постобработка распознанного текста: убираем мусорное начало,
// приводим регистр и пунктуацию. Слова и их тайминги не трогаем.
function improveCue(cue) {
  let text = String(cue.text || "").replace(/\s+/g, " ").trim();
  text = text.replace(/^(э|эм|мм|ну|аа|короче)[,\s]+/iu, "").trim();
  if (text && !/[.!?…]$/.test(text)) text += ".";
  if (text) text = text[0].toLocaleUpperCase("ru") + text.slice(1);
  return { ...cue, text, words: (cue.words || []).map(w => ({ ...w, text: String(w.text || "").trim() })).filter(w => w.text) };
}

function recomputeWords(cue) {
  const words = String(cue.text || "").trim().split(/\s+/).filter(Boolean);
  const dur = Math.max(0.04, cue.end - cue.start);
  const step = dur / Math.max(1, words.length);
  return words.map((text, i) => ({ text, start: cue.start + step * i, end: cue.start + step * (i + 1), index: i }));
}

async function transcribe() {
  if (!state.file || state.asrBusy) return;
  state.asrBusy = true;
  const btn = $("#asr"); btn.disabled = true; btn.innerHTML = `${icon("clock", 14)} Загружаем модель…`;
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
        if (data.type === "recognizing") btn.innerHTML = `${icon("mic", 14)} Распознаём речь…`;
        else if (data.type === "complete") { worker.terminate(); revoke(); resolve(data.result); }
        else if (data.type === "error") { worker.terminate(); revoke(); reject(new Error("Не удалось запустить модель. Проверь интернет; можно загрузить SRT.")); }
      };
      worker.onerror = () => { worker.terminate(); revoke(); reject(new Error("Модель не запустилась. Проверь интернет и память.")); };
      worker.postMessage({ audio, language: $("#language").value, model: $("#model").value }, [audio.buffer]);
    });
    const parsed = wordsToCues(result, state.duration);
    state.cues = parsed.cues.map(improveCue); state.excluded = new Set();
    $("#status").textContent = `Распознано ${state.cues.length} фраз со словами. Границы и текст можно поправить ниже.`;
    buildEdl();
  } catch (e) {
    $("#status").textContent = e?.message || "Не удалось распознать речь.";
  } finally {
    if (ctx) { try { await ctx.close(); } catch {} }
    state.asrBusy = false; state.asrWorker = null;
    btn.disabled = false; btn.innerHTML = `${icon("mic", 14)} Распознать речь`;
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
  const head = $("#timeline .playhead");
  if (head) head.style.left = `${state.t / Math.max(0.001, state.edl.duration) * 100}%`;
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
  $("#status").textContent = `Видео загружено: ${state.duration.toFixed(1)} с. Нажми «Распознать речь» — фразы появятся сами.`;
  $("#silence-info").textContent = "Слушаем паузы…";
  buildEdl();
  detectSilences(file).then(result => {
    state.silences = result.ranges;
    $("#silence-info").textContent = result.silent
      ? "Речь не найдена — паузы не трогаем."
      : `Пауз найдено: ${result.ranges.length}.`;
    buildEdl();
  }).catch(() => { $("#silence-info").textContent = "Паузы не проанализированы."; });
}

async function exportMp4() {
  if (!state.file || !state.edl || state.busy) return;
  if (buildApprovalSheet(state.edl).length > 0 && !state.approved) {
    $("#status").textContent = "Сначала отметь лист проверки выше.";
    return;
  }
  state.busy = true;
  const btn = $("#export"); btn.disabled = true; btn.innerHTML = `${icon("clock", 16)} Собираем…`;
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
    btn.disabled = false; btn.innerHTML = `${icon("sparkles", 16)} Собрать MP4`;
    $("#progress").style.display = "none";
  }
}

// Живые превью шаблонов: тот же renderFrame, что и в экспорте.
// Это не картинки-заглушки — каждый кадр собран из EDL шаблона.
async function loadDemoFrames() {
  const video = document.createElement("video");
  video.src = "./demo-portrait.mp4"; video.muted = true; video.playsInline = true;
  try {
    await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = rej; });
    for (const t of [0.25, 1.1, 2.3]) {
      await new Promise(res => { video.onseeked = res; video.currentTime = Math.min(t, Math.max(0, video.duration - 0.05)); });
      const frame = document.createElement("canvas");
      frame.width = 216; frame.height = 384;
      frame.getContext("2d").drawImage(video, 0, 0, 216, 384);
      state.demoFrames.push(frame);
    }
  } catch {}
}

function previewSource(ctx, rect, localT = 0) {
  if (state.demoFrames.length) {
    const frame = state.demoFrames[Math.floor(Math.abs(localT) * 1.5) % state.demoFrames.length];
    ctx.drawImage(frame, rect.x, rect.y, rect.w, rect.h);
    return;
  }
  const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  g.addColorStop(0, "#3b5364"); g.addColorStop(1, "#101821");
  ctx.fillStyle = g; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = "rgba(226,188,150,.88)";
  ctx.beginPath(); ctx.arc(rect.x + rect.w * .5, rect.y + rect.h * .42, rect.w * .17, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(24,31,41,.95)";
  ctx.beginPath(); ctx.arc(rect.x + rect.w * .5, rect.y + rect.h * .84, rect.w * .36, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.10)";
  ctx.fillRect(rect.x, rect.y + rect.h * .12, rect.w, 2);
}

let previewStart = 0;

function previewFrameAt(t) {
  if (!state.demoFrames.length) return null;
  return state.demoFrames[Math.floor(Math.abs(t) * 1.5) % state.demoFrames.length];
}

function drawPreview(canvas, tpl, t) {
  if (!canvas || !tpl) return;
  try { renderTemplatePreview(canvas.getContext("2d"), tpl, t, previewFrameAt(t)); } catch {}
}

function registerPreview(key, canvas, tpl, stillT) {
  if (!canvas || !tpl) return;
  state.previewEdls[key] = { canvas, tpl, t: stillT };
  drawPreview(canvas, tpl, stillT);
}

function renderTemplatePreviews() {
  for (const tpl of KADR_TEMPLATES) {
    const canvas = document.querySelector(`[data-tpl-preview="${tpl.id}"]`);
    if (canvas) registerPreview(tpl.id, canvas, tpl, 1.2);
  }
}

function renderExamplePreviews() {
  for (const ex of KADR_EXAMPLES) {
    const canvas = document.querySelector(`[data-ex-preview="${ex.id}"]`);
    if (canvas) registerPreview(`ex:${ex.id}`, canvas, templateById(ex.template), 1.2);
  }
}

// Один общий rAF для карточек, которые реально видны на экране.
function startPreviewLoop() {
  if (state.previewTimer) cancelAnimationFrame(state.previewTimer);
  const canvases = [...document.querySelectorAll("[data-tpl-preview],[data-ex-preview]")];
  const keyOf = el => el.dataset.tplPreview ? el.dataset.tplPreview : `ex:${el.dataset.exPreview}`;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    canvases.forEach(el => {
      const p = state.previewEdls[keyOf(el)];
      if (p) drawPreview(p.canvas, p.tpl, p.t);
    });
    return;
  }
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const key = keyOf(entry.target);
        if (entry.isIntersecting) state.previewVisible.add(key);
        else state.previewVisible.delete(key);
      }
    }, { rootMargin: "160px" });
    canvases.forEach(el => io.observe(el));
  } else canvases.forEach(el => state.previewVisible.add(keyOf(el)));

  previewStart = performance.now();
  let lastDraw = 0;
  const loop = (now) => {
    state.previewTimer = requestAnimationFrame(loop);
    if (document.hidden || now - lastDraw < 66) return;
    lastDraw = now;
    const elapsed = (now - previewStart) / 1000;
    for (const key of state.previewVisible) {
      const p = state.previewEdls[key];
      if (!p) continue;
      const dur = 2.4;
      drawPreview(p.canvas, p.tpl, ((elapsed % dur) + dur) % dur);
    }
  };
  state.previewTimer = requestAnimationFrame(loop);
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
    document.querySelectorAll("[data-template]").forEach(x => x.classList.toggle("active", x.dataset.template === ex.template));
    document.querySelectorAll("[data-example]").forEach(x => x.classList.toggle("active", x.dataset.example === id));
    $("#status").textContent = ex.note;
    buildEdl();
  } catch (e) {
    $("#status").textContent = e?.message || "Не удалось открыть пример.";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  hydrateIcons(document);
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll("[data-goto]").forEach(btn => btn.addEventListener("click", () => {
    document.getElementById(btn.dataset.goto)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    document.querySelectorAll("[data-goto]").forEach(x => x.setAttribute("aria-pressed", String(x === btn)));
  }));
  window.__kadr3 = state; // debugging / tests: живой EDL доступен из консоли
  const families = ["Все", ...new Set(KADR_TEMPLATES.map(t => t.family.split("·")[0].trim()))];
  $("#filters").innerHTML = families.map((name, i) =>
    `<button type="button" class="filter${i === 0 ? " active" : ""}" data-filter="${esc(name)}">${esc(name)}</button>`
  ).join("");
  $("#templates").innerHTML = KADR_TEMPLATES.map(t =>
    `<button type="button" class="card tpl-card" data-template="${t.id}" style="--accent:${t.accent}" data-family="${esc(t.family)}">
      <canvas class="tpl-preview" data-tpl-preview="${t.id}" width="216" height="384"></canvas>
      <strong>${t.name}</strong><small>${t.what}<br><em>${t.bestFor}</em></small>
      <span class="tpl-meta">Субтитры: ${t.caption} · Графика: ${t.graphic} · Моушен: ${t.motion}</span>
    </button>`
  ).join("");
  $("#examples").innerHTML = KADR_EXAMPLES.map(e =>
    `<button type="button" class="card tpl-card" data-example="${e.id}">
      <canvas class="tpl-preview" data-ex-preview="${e.id}" width="216" height="384"></canvas>
      <strong>${e.name}</strong><small>${e.note}</small>
    </button>`
  ).join("");
  requestAnimationFrame(async () => {
    await loadDemoFrames();
    try { await document.fonts.load('800 14px "Kadr Manrope"'); await document.fonts.ready; } catch {}
    renderTemplatePreviews(); renderExamplePreviews(); startPreviewLoop();
  });
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
      $("#status").textContent = `SRT загружен: ${cues.length} фраз.`;
      buildEdl();
    }).catch(err => { $("#status").textContent = err.message || "Не удалось прочитать SRT."; });
  });
  $("#remove-pauses").addEventListener("change", buildEdl);
  $("#cues").addEventListener("change", e => {
    const row = e.target.closest("[data-cue]");
    if (!row || !e.target.dataset.field) return;
    updateCueField(row.dataset.cue, e.target.dataset.field, e.target.value);
  });
  $("#cues").addEventListener("click", e => {
    const row = e.target.closest("[data-cue]"); if (!row) return;
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "jump") {
      const cue = state.cues.find(c => c.id === row.dataset.cue);
      if (cue) jumpTo(cue.start);
    } else if (act === "delete") deleteCue(row.dataset.cue);
    else if (act === "split") splitCue(row.dataset.cue);
    else if (act === "merge") mergeCue(row.dataset.cue);
  });
  $("#filters").addEventListener("click", e => {
    const b = e.target.closest("[data-filter]"); if (!b) return;
    const value = b.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach(x => x.classList.toggle("active", x === b));
    document.querySelectorAll("[data-template]").forEach(card => {
      card.style.display = value === "Все" || card.dataset.family.startsWith(value) ? "" : "none";
    });
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
  $("#save-project").addEventListener("click", saveProject);
  $("#open-project").addEventListener("click", () => $("#project-file").click());
  $("#project-file").addEventListener("change", e => openProject(e.target.files?.[0]));
  $("#approved").addEventListener("change", e => { state.approved = e.target.checked; renderApproval(); });
  $("#approval-list").addEventListener("click", e => {
    const row = e.target.closest("[data-approval]"); if (!row) return;
    const sheet = buildApprovalSheet(state.edl);
    const point = sheet[Number(row.dataset.approval)];
    if (point) jumpTo(point.time);
  });
  document.addEventListener("pointermove", onDragMove);
  document.addEventListener("pointerup", onDragEnd);
  document.addEventListener("pointercancel", onDragEnd);
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
      state.playing = true; $("#play").innerHTML = `${icon("pause", 14)} Пауза`;
      const tick = () => {
        if (!state.playing) return;
        const mapped = outputTimeForSource(state.edl, v.currentTime);
        if (Math.abs(mapped - state.t) > 0.12) v.currentTime = sourceTimeAt(state.edl, Math.min(state.edl.duration, state.t + 1 / 30));
        state.t = Math.max(0, Math.min(state.edl.duration, mapped));
        $("#range").value = String(state.t); draw();
        if (state.t >= state.edl.duration - 0.02) { v.pause(); state.playing = false; $("#play").innerHTML = `${icon("play", 14)} Играть`; return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } else {
      v.pause(); state.playing = false; $("#play").innerHTML = `${icon("play", 14)} Играть`;
    }
  });
  document.querySelector('[data-template="clean"]')?.classList.add("active");
  state.edl = normalizeEdl({
    output: { width: W, height: H, fps: 30 },
    clips: [{ id: "main", src: "video", in: 0, out: 6 }],
    captions: [{ start: 0.4, end: 5.6, text: "Загрузи видео, напиши фразы и нажми приём", template: "clean" }],
    look: { preset: "clean", accent: "#ffd23f" },
  });
  $("#range").max = "6"; renderScenes(); renderTimeline(); renderApproval(); draw();
});
