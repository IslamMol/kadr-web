// Кадр 3.0: переносимый проект. Обычный JSON + исходное видео без перекодирования.
// Открывается в браузере и позже в десктопе; сервер и аккаунты не нужны.
import { normalizeEdl } from "./edl.js";

const MAGIC = "KADR3PRJ";
const HEADER = 12;
const MAX_MANIFEST = 4 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const text = (v, max = 240) => typeof v === "string" ? v.slice(0, max) : "";
const num = (v, fallback, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

export function normalizeEditor(raw = {}) {
  const cues = Array.isArray(raw.cues) ? raw.cues.slice(0, 500).flatMap((c, i) => {
    if (!c || typeof c !== "object") return [];
    const start = num(c.start, NaN, 0, 1e6), end = num(c.end, NaN, 0, 1e6);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    const words = Array.isArray(c.words) ? c.words.slice(0, 80).flatMap((w, n) => {
      const a = num(w.start, NaN, 0, 1e6), b = num(w.end, NaN, 0, 1e6);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return [];
      return [{ text: text(w.text, 80), start: a, end: b, index: n }];
    }) : [];
    return [{ id: text(c.id, 80) || `cue-${i + 1}`, start, end, text: text(c.text, 300), words }];
  }) : [];
  return {
    template: text(raw.template, 80) || "clean",
    cues,
    excluded: Array.isArray(raw.excluded) ? raw.excluded.slice(0, 500).map(x => text(x, 80)).filter(Boolean) : [],
    words: text(raw.words, 1200),
    manualGraphics: Array.isArray(raw.manualGraphics) ? raw.manualGraphics.slice(0, 12).flatMap((g, i) => {
      if (!g || typeof g !== "object") return [];
      return [{
        id: text(g.id, 80) || `manual-${i + 1}`,
        type: text(g.type, 40) || "title",
        at: num(g.at, 0, 0, 1e6), duration: num(g.duration, 2.2, 0.4, 12),
        label: text(g.label, 120), value: text(g.value, 60),
        steps: Array.isArray(g.steps) ? g.steps.slice(0, 8).map(s => text(s, 80)) : [],
        template: text(g.template, 40) || "clean",
      }];
    }) : [],
    removePauses: raw.removePauses !== false,
    silences: Array.isArray(raw.silences) ? raw.silences.slice(0, 200).flatMap((s, i) => {
      const a = num(s.from, NaN, 0, 1e6), b = num(s.to, NaN, 0, 1e6);
      return Number.isFinite(a) && Number.isFinite(b) && b > a ? [{ id: text(s.id, 80) || `pause-${i}`, from: a, to: b, enabled: s.enabled !== false }] : [];
    }) : [],
    cutDeltas: raw.cutDeltas && typeof raw.cutDeltas === "object" && !Array.isArray(raw.cutDeltas)
      ? Object.fromEntries(Object.entries(raw.cutDeltas).slice(0, 20).map(([k, v]) => [String(k).slice(0, 8), {
          delta: num(v?.delta, 0, -1e6, 1e6), base: num(v?.base, 0, 0, 1e6),
        }])) : {},
    start: num(raw.start, 0, 0, 1e6),
    end: num(raw.end, 0, 0, 1e6),
  };
}

export function createProject3({ edl, editor = {} }, file) {
  if (!(file instanceof Blob) || file.size < 1) throw new Error("Нет видео для проекта.");
  const cleanEdl = normalizeEdl(edl);
  const cleanEditor = normalizeEditor(editor);
  const manifest = {
    format: "kadr3-project", version: 1,
    edl: JSON.parse(JSON.stringify(cleanEdl)),
    editor: cleanEditor,
    asset: { role: "video", name: text(file.name, 240) || "video.mp4", type: text(file.type, 120) || "video/mp4", size: file.size },
  };
  const json = encoder.encode(JSON.stringify(manifest));
  if (json.length > MAX_MANIFEST) throw new Error("Слишком большой проект.");
  const header = new Uint8Array(HEADER);
  header.set(encoder.encode(MAGIC));
  new DataView(header.buffer).setUint32(8, json.length, true);
  return new Blob([header, json, file], { type: "application/octet-stream" });
}

export async function readProject3(file) {
  if (!(file instanceof Blob) || file.size < HEADER) throw new Error("Это не проект Кадра 3.0.");
  const head = new Uint8Array(await file.slice(0, HEADER).arrayBuffer());
  if (String.fromCharCode(...head.slice(0, 8)) !== MAGIC) throw new Error("Это не проект Кадра 3.0 (.kadr3).");
  const len = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(8, true);
  if (len < 2 || len > MAX_MANIFEST || HEADER + len > file.size) throw new Error("Файл проекта повреждён.");
  let m;
  try { m = JSON.parse(decoder.decode(await file.slice(HEADER, HEADER + len).arrayBuffer())); }
  catch { throw new Error("Не удалось прочитать настройки проекта."); }
  if (!m || m.format !== "kadr3-project" || m.version !== 1) throw new Error("Версия проекта не поддерживается.");
  if (!m.asset || m.asset.role !== "video" || !Number.isSafeInteger(m.asset.size) || m.asset.size <= 0)
    throw new Error("В проекте нет видео.");
  if (HEADER + len + m.asset.size !== file.size) throw new Error("Файл проекта повреждён: размер видео не сходится.");
  return {
    edl: normalizeEdl(m.edl),
    editor: normalizeEditor(m.editor),
    blob: file.slice(HEADER + len, HEADER + len + m.asset.size, m.asset.type || "video/mp4"),
    name: m.asset.name,
  };
}
