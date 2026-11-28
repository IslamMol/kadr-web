// Кадр 3.0: поиск тишины по громкости дорожки. Локально, без сервера.
// Порог консервативный: вырезаем только уверенные паузы и оставляем дыхание.
const THRESHOLD = Math.pow(10, -40 / 20);
const HOP_MS = 20;
const MIN_PAUSE = 0.8;
const BREATH = 0.2;

export function findQuietRanges(buffer) {
  const sr = buffer.sampleRate;
  const channels = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
  const hop = Math.max(1, Math.round(sr * HOP_MS / 1000));
  let quietStart = null, loudBlocks = 0;
  const runs = [];

  const finish = (endIndex) => {
    if (quietStart === null) return;
    const from = quietStart / sr;
    const to = Math.min(buffer.duration, endIndex / sr);
    if (to - from >= MIN_PAUSE) {
      const a = from + BREATH, b = to - BREATH;
      if (b > a + 0.08) runs.push({ from: a, to: b, enabled: true });
    }
    quietStart = null;
  };

  for (let i = 0; i < buffer.length; i += hop) {
    const n = Math.min(buffer.length, i + hop);
    let highest = 0;
    for (const data of channels) {
      let sum = 0, count = 0;
      for (let j = i; j < n; j += 4) { sum += data[j] * data[j]; count++; }
      highest = Math.max(highest, Math.sqrt(sum / Math.max(count, 1)));
    }
    if (highest < THRESHOLD) { if (quietStart === null) quietStart = i; }
    else { loudBlocks++; finish(i); }
  }
  finish(buffer.length);
  return { silent: loudBlocks < 10, ranges: runs };
}

export async function detectSilences(blob) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error("Анализ звука требует Chrome или Edge.");
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    return findQuietRanges(decoded);
  } finally {
    try { await ctx.close(); } catch {}
  }
}

// Вычитает паузы из выбранных дублей. Границы остаются в тишине, слова не режутся.
export function removeSilences(pieces = [], ranges = []) {
  let out = [];
  for (const p of pieces) {
    let segs = [{ from: p.from, to: p.to }];
    for (const s of ranges) {
      if (!s.enabled) continue;
      const next = [];
      for (const seg of segs) {
        if (s.to <= seg.from || s.from >= seg.to) { next.push(seg); continue; }
        if (s.from > seg.from + 0.08) next.push({ from: seg.from, to: s.from });
        if (s.to < seg.to - 0.08) next.push({ from: s.to, to: seg.to });
      }
      segs = next;
    }
    for (const seg of segs) if (seg.to - seg.from >= 0.12) out.push(seg);
  }
  return out.sort((a, b) => a.from - b.from);
}
