// Кадр 3.0: лист проверки перед сборкой.
// Одна точка на каждую склейку, сцену и начало фразы — как в ghost-editor's
// approval_sheet.py, но по локальному EDL, без Python и сервера.

export function buildApprovalSheet(edl, limit = 40) {
  const points = [];
  for (let i = 0; i < edl.spans.length - 1; i++) {
    const s = edl.spans[i];
    points.push({
      kind: "cut", time: s.end,
      title: `Склейка ${i + 1}`,
      detail: `Конец фрагмента ${i + 1} → начало ${i + 2}. Проверь губы, дыхание и звук на стыке.`,
    });
  }
  for (const g of edl.graphics) {
    points.push({
      kind: "scene", time: g.at,
      title: `Сцена · ${g.type}`,
      detail: `«${String(g.label || "").slice(0, 60)}» · ${g.duration.toFixed(1)} с. Не должна закрывать лицо.`,
    });
  }
  for (const c of edl.captions.slice(0, 6)) {
    points.push({
      kind: "caption", time: c.start,
      title: "Субтитры",
      detail: `«${String(c.text || "").slice(0, 60)}». Сверь текст и тайминг с речью.`,
    });
  }
  return points.sort((a, b) => a.time - b.time).slice(0, limit);
}

export function qaApproval(edl, sheet = buildApprovalSheet(edl)) {
  const warnings = [];
  const minutes = edl.duration / 60;
  if (edl.graphics.length > 12)
    warnings.push({ title: "Слишком много сцен", detail: `Элементов: ${edl.graphics.length}. Оставь не больше 12.` });
  if (minutes > 0.3 && edl.clips.length / minutes > 20)
    warnings.push({ title: "Очень много склеек", detail: `${edl.clips.length} склеек за ${edl.duration.toFixed(1)} с.` });
  if (!edl.captions.length)
    warnings.push({ title: "Нет субтитров", detail: "Без слов нельзя проверить, не вырезана ли часть речи." });
  if (!sheet.length)
    warnings.push({ title: "Лист проверки пуст", detail: "Нечего проверять — добавь склейки, сцены или субтитры." });
  return warnings;
}
