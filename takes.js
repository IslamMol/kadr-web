// Кадр 2.0: монтаж по словам, без нейросети.
// Правила из take-selection.md ghost-editor: лучший дубль каждого предложения,
// резка по словам, длинные паузы внутри дубля ужимаются до 0,2 с.
const norm = (s) => String(s || "").toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[^a-zа-яё0-9]+/gi, " ").trim();
const snap = (t) => Math.round(t * 30) / 30;
const isEnd = (w) => /[.!?…]$/.test(w.text || "");

export function wordsFromCues(cues = []) {
  const out = [];
  for (const c of cues || []) {
    const start = Number(c.start);
    const end = Number(c.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    if (Array.isArray(c.words) && c.words.length) {
      for (const w of c.words) {
        if (w && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start && String(w.text || "").trim()) {
          out.push({ text: String(w.text).trim(), start: Number(w.start), end: Number(w.end) });
        }
      }
    } else {
      const parts = String(c.text || "").trim().split(" ").filter(Boolean);
      parts.forEach((text, i) => out.push({ text, start: start + (end - start) * i / parts.length, end: start + (end - start) * (i + 1) / parts.length }));
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function sentencesFromWords(words = []) {
  const out = [];
  let cur = [];
  const flush = () => { if (cur.length) out.push(cur); cur = []; };
  for (const w of words) {
    if (cur.length && w.start - cur[cur.length - 1].end > 1.2) flush();
    cur.push(w);
    if (isEnd(w)) flush();
  }
  flush();
  return out.map((ws) => ({ text: ws.map((w) => w.text).join(" "), start: ws[0].start, end: ws[ws.length - 1].end, words: ws }));
}

function scoreTake(s) {
  let score = 0;
  if (isEnd(s.words[s.words.length - 1])) score += 3;
  if (s.words.length >= 3) score += 1;
  let maxGap = 0;
  for (let i = 1; i < s.words.length; i++) maxGap = Math.max(maxGap, s.words[i].start - s.words[i - 1].end);
  if (maxGap < 0.5) score += 2;
  else if (maxGap < 1) score += 1;
  score += Math.min(1, s.start / 60);
  return score;
}

export function planTakes(cues, opts = {}) {
  const start = Number(opts.start) || 0;
  const end = Number.isFinite(opts.end) ? Number(opts.end) : Infinity;
  const words = wordsFromCues(cues).filter((w) => w.end > start && w.start < end);
  if (!words.length) return { pieces: [], cuts: [], sentences: [], rejected: [] };
  const sentences = sentencesFromWords(words);
  const groups = new Map();
  for (const s of sentences) {
    const key = norm(s.text);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const chosen = [];
  const rejected = [];
  for (const list of groups.values()) {
    let best = list[0];
    let bestScore = -Infinity;
    for (const s of list) {
      const sc = scoreTake(s);
      if (sc > bestScore) { bestScore = sc; best = s; }
    }
    chosen.push(best);
    for (const s of list) if (s !== best) rejected.push(s);
  }
  chosen.sort((a, b) => a.start - b.start);
  const pieces = chosen.map((s) => {
    const from = snap(Math.max(start, s.start - 0.12));
    let to = snap(Math.min(end, s.end + 0.25));
    if (to <= from) to = from + 1 / 30;
    return { from, to, text: s.text, start: s.start, end: s.end };
  });
  for (let i = 0; i < pieces.length - 1; i++) {
    const nextStart = chosen[i + 1].start;
    if (pieces[i].to > nextStart - 0.05) pieces[i].to = snap(nextStart - 0.05);
  }
  const cuts = [];
  const addCut = (from, to) => {
    from = snap(from);
    to = snap(to);
    if (to - from >= 1 / 30) cuts.push({ from, to });
  };
  for (const s of rejected) addCut(s.start - 0.12, s.end + 0.25);
  for (let i = 0; i < pieces.length; i++) {
    const prevEnd = i ? pieces[i - 1].to : start;
    if (pieces[i].from > prevEnd) addCut(prevEnd, pieces[i].from);
    if (i === pieces.length - 1 && pieces[i].to < end && Number.isFinite(end)) addCut(pieces[i].to, end);
  }
  for (const s of chosen) {
    for (let i = 1; i < s.words.length; i++) {
      if (s.words[i].start - s.words[i - 1].end > 1) addCut(s.words[i - 1].end + 0.1, s.words[i].start - 0.1);
    }
  }
  cuts.sort((a, b) => a.from - b.from);
  const merged = [];
  for (const c of cuts) {
    const last = merged[merged.length - 1];
    if (last && c.from <= last.to) last.to = Math.max(last.to, c.to);
    else merged.push({ from: c.from, to: c.to });
  }
  return { pieces, cuts: merged, sentences: chosen, rejected };
}

export function takesToSilences(plan) {
  return (plan.cuts || []).map((c, i) => ({ id: "take-cut-" + (i + 1), from: c.from, to: c.to, enabled: true }));
}

export { snap };
