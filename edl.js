// Кадр 3.0: простой монтажный список (edit decision list).
// Это не проприетарный проект-файл: обычный JSON, который читает и человек,
// и агент. Все времена — секунды, все позиции — доли кадра.
// Один и тот же EDL питает превью в браузере, десктоп иэкспорт MP4.

export const EDL_VERSION = 3;
export const FRAME = 1 / 30;

const num = (v, fallback, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};
const text = (v, max = 240) => typeof v === "string" ? v.slice(0, max) : "";
const pick = (v, allowed, fallback) => allowed.includes(v) ? v : fallback;
const arr = (v, max) => Array.isArray(v) ? v.slice(0, max) : [];

export const LOOKS = Object.freeze(["clean", "editorial", "kinetic", "cinematic", "launch", "magazine", "paper", "news", "ink", "halftone", "board", "graph"]);
export const CAPTION_TEMPLATES = Object.freeze(["clean", "karaoke", "highlighter", "outline", "pop", "blur", "line-focus", "neominimal", "hype", "upper"]);
export const GRAPHIC_TYPES = Object.freeze(["quote", "number", "diagram", "chip", "lower-third", "stamp", "title", "stats", "list", "strike", "behind", "endcard", "card", "ui", "hook", "cta", "glass", "morph"]);
export const MOTION_TYPES = Object.freeze(["none", "rise", "word-slam", "spring", "scramble"]);
export const TRANSITIONS = Object.freeze(["none", "dissolve", "flash", "wipe", "iris"]);

function normalizeWords(raw, start, end, maxWords = 80) {
  return arr(raw, maxWords).flatMap((w, i) => {
    if (!w || typeof w !== "object") return [];
    const a = num(w.start, NaN, 0, 1e6), b = num(w.end, NaN, 0, 1e6);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return [];
    return [{ text: text(w.text, 60), start: a, end: b, index: i }];
  }).sort((a, b) => a.start - b.start);
}

// Clips are laid out end-to-end. There is no hidden timeline state: `in`/`out`
// are the only source times, output time is derived by summing durations.
export function normalizeEdl(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("EDL должен быть объектом.");

  const output = raw.output && typeof raw.output === "object" ? raw.output : {};
  const clips = arr(raw.clips, 300).flatMap((c, i) => {
    if (!c || typeof c !== "object") return [];
    const from = num(c.in, NaN, 0, 1e6), to = num(c.out, NaN, 0, 1e6);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];
    return [{
      id: text(c.id, 80) || `clip-${i + 1}`,
      src: text(c.src, 120) || "video",
      in: from, out: to,
      crop: {
        zoom: num(c.crop?.zoom, 1, 1, 3),
        x: num(c.crop?.x, 50, 0, 100),
        y: num(c.crop?.y, 50, 0, 100),
        mode: pick(c.crop?.mode, ["crop", "fit"], "crop"),
      },
    }];
  });
  if (!clips.length) throw new Error("В EDL нет ни одного фрагмента.");

  const spans = [];
  let cursor = 0;
  for (const c of clips) {
    const dur = c.out - c.in;
    spans.push({ clip: c, start: cursor, end: cursor + dur, duration: dur });
    cursor += dur;
  }
  const duration = cursor;

  const captions = arr(raw.captions, 2000).flatMap((c, i) => {
    if (!c || typeof c !== "object") return [];
    const a = num(c.start, NaN, 0, duration), b = num(c.end, NaN, 0, duration);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return [];
    const item = {
      id: text(c.id, 80) || `cue-${i + 1}`,
      start: a, end: b, text: text(c.text, 300),
      template: pick(c.template, CAPTION_TEMPLATES, "clean"),
      keyword: text(c.keyword, 60),
      words: normalizeWords(c.words, a, b),
    };
    if (!item.words.length) {
      const plain = item.text.trim().split(/\s+/).filter(Boolean);
      const step = (b - a) / Math.max(1, plain.length);
      item.words = plain.slice(0, 80).map((w, n) => ({ text: w, start: a + step * n, end: a + step * (n + 1), index: n }));
    }
    return [item];
  }).sort((a, b) => a.start - b.start);

  const graphics = arr(raw.graphics, 12).flatMap((g, i) => {
    if (!g || typeof g !== "object" || !GRAPHIC_TYPES.includes(g.type)) return [];
    return [{
      id: text(g.id, 80) || `g-${i + 1}`,
      type: g.type,
      at: num(g.at, 0, 0, duration),
      duration: num(g.duration, 2.8, 0.4, 12),
      label: text(g.label, 120),
      value: text(g.value, 60),
      steps: arr(g.steps, 8).map(s => text(s, 80)).filter(Boolean),
      template: pick(g.template, CAPTION_TEMPLATES, "clean"),
    }];
  }).sort((a, b) => a.at - b.at);

  const motion = arr(raw.motion, 80).flatMap((m, i) => {
    if (!m || typeof m !== "object") return [];
    return [{
      id: text(m.id, 80) || `m-${i + 1}`,
      type: pick(m.type, MOTION_TYPES, "none"),
      at: num(m.at, 0, 0, duration),
      duration: num(m.duration, 0.6, 0.1, 6),
      target: text(m.target, 80),
    }];
  });

  const transitions = arr(raw.transitions, 60).flatMap((t, i) => {
    if (!t || typeof t !== "object") return [];
    const type = pick(t.type, TRANSITIONS, "none");
    if (type === "none") return [];
    return [{ id: text(t.id, 80) || `t-${i + 1}`, type, at: num(t.at, 0, 0, duration), duration: num(t.duration, 0.4, 0.1, 2) }];
  }).sort((a, b) => a.at - b.at);

  const lookRaw = raw.look && typeof raw.look === "object" ? raw.look : {};
  const look = {
    preset: pick(lookRaw.preset, LOOKS, "clean"),
    accent: text(lookRaw.accent, 20) || "#ffd23f",
    grain: num(lookRaw.grain, 0, 0, 1),
    vignette: num(lookRaw.vignette, 0, 0, 1),
    font: text(lookRaw.font, 60) || "Manrope",
  };

  return {
    version: EDL_VERSION,
    name: text(raw.name, 120) || "Ролик",
    output: {
      width: Math.round(num(output.width, 1080, 320, 2160)),
      height: Math.round(num(output.height, 1920, 320, 3840)),
      fps: Math.round(num(output.fps, 30, 12, 60)),
    },
    clips, captions, graphics, motion, transitions, look,
    duration,
    spans,
    reducedMotion: !!raw.reducedMotion,
  };
}

export function serializeEdl(edl) {
  const { spans, ...rest } = edl;
  return JSON.stringify(rest);
}

// FNV-1a: stable across Node and browsers, used for frame-cache keys and tests.
export function hashEdl(edl) {
  const s = serializeEdl(edl);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function spanAt(edl, outputT) {
  const t = Math.max(0, Math.min(edl.duration, Number(outputT) || 0));
  for (const s of edl.spans) if (t >= s.start && t < s.end) return s;
  return edl.spans[edl.spans.length - 1] || null;
}

export function sourceTimeAt(edl, outputT) {
  const s = spanAt(edl, outputT);
  return s ? s.clip.in + (Math.min(s.end, Math.max(s.start, outputT)) - s.start) : 0;
}

export function outputTimeForSource(edl, sourceT) {
  const t = Number(sourceT) || 0;
  for (const s of edl.spans) if (t >= s.clip.in && t < s.clip.out) return s.start + (t - s.clip.in);
  return t < (edl.spans[0]?.clip.in ?? 0) ? 0 : edl.duration;
}

// Null in a removed gap. Needed by the encoder: frames between chosen takes
// must be skipped entirely instead of becoming a duplicate of the last frame.
export function sourceSpanAt(edl, sourceT) {
  const t = Number(sourceT) || 0;
  for (const s of edl.spans) if (t >= s.clip.in && t < s.clip.out)
    return { span: s, outputT: s.start + (t - s.clip.in) };
  return null;
}

// Transcribe on the source timeline, then map words to the cut timeline.
export function mapCuesToOutput(edl, cues = []) {
  return cues.flatMap((cue) => {
    const a = outputTimeForSource(edl, cue.start), b = outputTimeForSource(edl, cue.end);
    if (!(b > a)) return [];
    const words = (cue.words || []).flatMap(w => {
      const wa = outputTimeForSource(edl, w.start), wb = outputTimeForSource(edl, w.end);
      return wb > wa ? [{ ...w, start: wa, end: wb }] : [];
    });
    return [{ ...cue, start: a, end: b, words }];
  });
}

export function activeCue(edl, outputT) {
  const t = Math.max(0, Number(outputT) || 0);
  return edl.captions.find(c => t >= c.start && t < c.end) || null;
}

export function activeGraphics(edl, outputT) {
  const t = Math.max(0, Number(outputT) || 0);
  return edl.graphics.filter(g => t >= g.at && t < g.at + g.duration);
}

export function activeGraphic(edl, outputT) {
  return activeGraphics(edl, outputT)[0] || null;
}

export function activeMotion(edl, outputT, target = "") {
  const t = Math.max(0, Number(outputT) || 0);
  return edl.motion.find(m => t >= m.at && t < m.at + m.duration && (!m.target || m.target === target)) || null;
}

export function activeTransition(edl, outputT) {
  const t = Math.max(0, Number(outputT) || 0);
  return edl.transitions.find(x => t >= x.at && t < x.at + x.duration) || null;
}

export function frameState(edl, outputT) {
  const t = Math.max(0, Math.min(edl.duration, Number(outputT) || 0));
  const span = spanAt(edl, t);
  const localT = span ? t - span.start : 0;
  return {
    t,
    frame: Math.round(t * edl.output.fps),
    span,
    clip: span?.clip || null,
    localT,
    sourceT: sourceTimeAt(edl, t),
    cue: activeCue(edl, t),
    graphics: activeGraphics(edl, t),
    graphic: activeGraphics(edl, t)[0] || null,
    motion: activeMotion(edl, t),
    transition: activeTransition(edl, t),
    reducedMotion: edl.reducedMotion,
  };
}

export function emptyEdl() {
  return normalizeEdl({
    output: { width: 1080, height: 1920, fps: 30 },
    clips: [{ id: "placeholder", src: "video", in: 0, out: 1 }],
  });
}
