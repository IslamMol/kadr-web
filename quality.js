// Local, non-blocking preflight inspired by common video-editing QA workflows.
// It compares supplied time intervals only: it does not listen to the speech,
// recognise faces, inspect pixels, or determine whether the edit is correct.
const number = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const overlap = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));

function mergedCuts(cuts, start, end) {
  const clipped = (cuts || [])
    .map(c => ({from: Math.max(start, number(c.from)), to: Math.min(end, number(c.to))}))
    .filter(c => c.to > c.from)
    .sort((a, b) => a.from - b.from);
  const out = [];
  for (const c of clipped) {
    const last = out[out.length - 1];
    if (last && c.from <= last.to) last.to = Math.max(last.to, c.to);
    else out.push({...c});
  }
  return out;
}
function retained(from, to, cuts) {
  if (to <= from) return 0;
  return Math.max(0, to - from - cuts.reduce((n, c) => n + overlap(from, to, c.from, c.to), 0));
}
function firstRetained(from, to, cuts) {
  let t = from;
  for (const c of cuts) {
    if (c.from <= t && c.to > t) t = c.to;
    if (c.from > t) break;
  }
  return t < to ? t : null;
}

/**
 * Build an editable-source-time outline and a conservative list of things to
 * check. `graphics` contains one item per graphic with its already resolved
 * keyword/time triggers in `times`. Cut times are absolute source seconds.
 */
export function reviewEdit({start = 0, end = 0, cues = [], cuts = [], graphics = [], headline = ""} = {}) {
  start = Math.max(0, number(start));
  end = Math.max(start, number(end));
  const keptCuts = mergedCuts(cuts, start, end);
  const inRange = (cues || []).map(c => ({
    ...c, start: number(c.start, -1), end: number(c.end, -1),
    text: String(c.text || "").trim(),
  })).filter(c => c.text && c.start >= 0 && c.end > c.start && c.end > start && c.start < end)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const warnings = [];
  const warn = (code, time, title, detail = "") => {
    warnings.push({code, time: Math.max(start, Math.min(end, time)), title, detail});
  };

  // At short durations and high character rates this is only a reading-speed
  // heuristic. Imported SRT may have approximately split phrase timings.
  let furthest = null;
  for (const c of inRange) {
    const d = c.end - c.start;
    const chars = Array.from(c.text).length;
    if (d < .45 && chars > 2) {
      warn("short-caption", c.start, "Субтитр может мелькать", c.text);
    } else if (chars / d > 20) {
      warn("fast-caption", c.start, "Субтитр может быть трудно прочитать", c.text);
    }
    if (furthest && overlap(c.start, c.end, furthest.start, furthest.end) > .02 &&
        retained(Math.max(c.start, furthest.start, start), Math.min(c.end, furthest.end, end), keptCuts) > .02) {
      warn("caption-overlap", c.start, "Фразы субтитров пересекаются", c.text);
    }
    if (!furthest || c.end > furthest.end) furthest = c;
  }
  const atStart = inRange.find(c => c.start < start - .04 && c.end > start + .04);
  const atEnd = inRange.find(c => c.start < end - .04 && c.end > end + .04);
  if (atStart) warn("trim-start", start, "Начало обрезки внутри фразы", atStart.text);
  if (atEnd) warn("trim-end", Math.max(start, end - .5), "Конец обрезки внутри фразы", atEnd.text);
  for (const cut of keptCuts) {
    const cue = inRange.find(c => overlap(c.start, c.end, cut.from, cut.to) > .05);
    if (cue) warn("cut-caption", Math.max(start, cut.from - .5),
      "Вырезанная пауза пересекает субтитр", "Прослушай склейку: " + cue.text);
  }

  const events = [], activeGraphics = [];
  if (String(headline || "").trim()) {
    const first = firstRetained(start, end, keptCuts);
    events.push({key: "headline", type: "Заголовок", title: String(headline).trim(),
      from: start, to: null, seek: first, removed: first === null});
  }
  for (const g of graphics || []) {
    const title = String(g.label || g.value || "").trim();
    if ((g.kind === "quote" && !String(g.label || "").trim()) ||
        (g.kind === "number" && !title)) continue;
    if (g.kind === "image" && !g.hasImage) {
      warn("missing-image", number(g.at, start), "Для элемента не выбрана картинка");
      continue;
    }
    const type = ({quote:"Фраза", icon:"Иконка", diagram:"Схема", number:"Цифра", image:"Картинка"})[g.kind] || "Графика";
    const duration = Math.max(0, number(g.duration) || 2.8);
    const times = Array.isArray(g.times) ? g.times : [];
    for (let i = 0; i < times.length; i++) {
      const t = number(times[i], -1), from = Math.max(start, t), to = Math.min(end, t + duration);
      if (t < 0 || to <= from) continue;
      const left = retained(from, to, keptCuts), seek = firstRetained(from, to, keptCuts);
      const event = {key: `graphic-${g.id}-${i}`, type, title: title || type, from, to,
        seek, removed: left < .03, layout: g.layout};
      events.push(event);
      activeGraphics.push(event);
      if (left < .03) {
        warn("graphic-removed", from, "Графика попадает в вырезанную паузу", title || type);
      } else if (to - from - left > .12) {
        warn("graphic-cut", from, "Склейка сокращает показ графики", title || type);
      }
    }
    if (g.trigger === "keyword" && String(g.keyword || "").trim() && !times.length) {
      warn("keyword-not-found", start, "Слово для графики не найдено в субтитрах", String(g.keyword).trim());
    }
  }
  activeGraphics.sort((a, b) => a.from - b.from || a.to - b.to);
  let active = [];
  for (const event of activeGraphics) {
    active = active.filter(prev => prev.to > event.from + .05);
    const conflict = active.find(prev =>
      retained(Math.max(prev.from, event.from), Math.min(prev.to, event.to), keptCuts) > .05);
    if (conflict) warn("graphic-overlap", event.from,
      "Акценты графики пересекаются", "Может отображаться только первый из пересекающихся элементов.");
    active.push(event);
  }
  events.sort((a, b) => a.from - b.from || (a.key === "headline" ? -1 : b.key === "headline" ? 1 : 0));
  warnings.sort((a, b) => a.time - b.time);
  return {events, warnings, timedCuesInRange: inRange.length, selectedCuts: keptCuts.length};
}