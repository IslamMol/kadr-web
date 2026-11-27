// Кадр 3.0: прилипание склеек и сцен к границам слов.
// Никаких «полслов»: резание и графика попадают на начало/конец произнесённого слова.

export function wordBoundaries(edl) {
  const points = new Set([0, edl.duration]);
  for (const c of edl.captions || []) {
    if (Number.isFinite(c.start)) points.add(c.start);
    if (Number.isFinite(c.end)) points.add(c.end);
    for (const w of c.words || []) {
      if (Number.isFinite(w.start)) points.add(w.start);
      if (Number.isFinite(w.end)) points.add(w.end);
    }
  }
  for (const s of edl.spans || []) {
    if (Number.isFinite(s.start)) points.add(s.start);
    if (Number.isFinite(s.end)) points.add(s.end);
  }
  return [...points].filter(t => t >= 0 && t <= edl.duration).sort((a, b) => a - b);
}

// Возвращает {time, snapped}. tolerance задаётся в секундах.
export function snapTime(t, points = [], tolerance = 0.08) {
  const value = Number(t);
  if (!Number.isFinite(value) || !points.length) return { time: value, snapped: false };
  let best = value, bestDistance = Math.abs(points[0] - value);
  for (const p of points) {
    const d = Math.abs(p - value);
    if (d < bestDistance) { best = p; bestDistance = d; }
  }
  return bestDistance <= tolerance
    ? { time: best, snapped: true }
    : { time: value, snapped: false };
}
