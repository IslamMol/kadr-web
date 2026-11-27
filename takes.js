// Кадр 2.0: монтаж по словам, без нейросети.
// Локальный порт правил ghost-editor/references/take-selection.md:
// лучший дубль каждого предложения, поздний дубль при равенстве, резка по
// словам, паузы >1 с внутри дубля ужимаются, короткие паузы остаются.
const norm = (s) => String(s || "").toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[^a-zа-яё0-9]+/gi, " ").trim();
const snap = (t) => Math.round(t * 30) / 30;
const isEnd = (w) => /[.!?…]$/.test(w.text || "");
const FILLER = new Set("э м мм ну аа какбы типа короче значит".split(" "));
const RESTART = /(ещ[её] раз|опять|с начала|давай снова|окей агайн|okay again|сначала)/iu;

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
  // ghost-editor: later takes are usually warmer; restarts and fillers are not takes.
  score += Math.min(1, s.start / 60);
  if (RESTART.test(s.text)) score -= 4;
  const filler = s.words.filter((w) => FILLER.has(norm(w.text))).length;
  score -= filler * .75;
  return score;
}

// Sentences said in one breath stay one take: one cut instead of four.
function groupedRuns(sentences) {
  const runs = [];
  for (const s of sentences) {
    const last = runs[runs.length - 1];
    if (last && s.start - last.end < .35 && !RESTART.test(s.text) && !RESTART.test(last.text)) {
      last.end = s.end;
      last.sentences.push(s);
    } else runs.push({ start: s.start, end: s.end, sentences: [s] });
  }
  return runs;
}

export function planTakes(cues, opts = {}) {
  const start = Number(opts.start) || 0;
  const end = Number.isFinite(opts.end) ? Number(opts.end) : Infinity;
  const words = wordsFromCues(cues).filter((w) => w.end > start && w.start < end);
  if (!words.length) return { pieces: [], cuts: [], sentences: [], rejected: [], runs: [], notes: [] };
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
      // Under 0.5 s is the speaker's rhythm; over 1 s can be removed.
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
  const runs = groupedRuns(chosen);
  const notes = [];
  if (rejected.length) notes.push(`Отклонённых дублей: ${rejected.length}. Каждое предложение оставлено в одном экземпляре.`);
  if (runs.length < chosen.length) notes.push(`Непрерывных сцен в одном дыхании: ${runs.length} вместо ${chosen.length} — склеек меньше.`);
  if (merged.length) notes.push(`Склейки по словам: ${merged.length}. Паузы короче 0,5 с оставлены как ритм речи.`);
  return { pieces, cuts: merged, sentences: chosen, rejected, runs, notes };
}

export function takesToSilences(plan) {
  return (plan.cuts || []).map((c, i) => ({ id: "take-cut-" + (i + 1), from: c.from, to: c.to, enabled: true }));
}

export { snap };
