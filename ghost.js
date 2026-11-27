// Кадр: локальный порт логики ghost-editor без Python, HyperFrames и нейросети.
// Перенесены правила, а не код skills: дубли по словам, стили как системы,
// защита лица, лист согласия перед экспортом и проверка качества.
// Источник: ghost-editor/SKILL.md, references/take-selection.md,
// references/styles.md, styles/*.json, scripts/approval_sheet.py.
import { planTakes } from "./takes.js";

export const GHOST_RULES = Object.freeze({
  lead: 0.12,        // срез за первым словом
  tail: 0.25,        // срез после последнего слова
  shortPause: 0.5,   // паузы короче — ритм речи, оставляем
  longPause: 1.0,    // длинные паузы внутри дубля ужимаем
  faceOnScreenMin: 0.65,
  brollPerMinuteMax: 3,
  targetMin: 45,
  targetMax: 75,
  maxGraphicElements: 12,
});

// Каждый стиль — система: шрифт, акцент, субтитры, движение и сцены.
// preset/effect — реальные движки Кадра, а не названия для галочки.
export const GHOST_STYLES = [
  {id:"clean", name:"Чистый", preset:"premium", effect:"clean", accent:"#ffd23f", capSize:64,
   font:"Manrope", note:"Крупные слова, один акцент, без музыки", sample:"Чистая речь, один акцент"},
  {id:"cinematic", name:"Кино", preset:"premium", effect:"serif", accent:"#e7c27a", capSize:56,
   font:"Playfair", note:"Засечки, мягкий свет, редкие сцены", sample:"Крупная мысль, крупная буква"},
  {id:"editorial", name:"Редакционный", preset:"red", effect:"editorial", accent:"#d13f34", capSize:58,
   font:"Manrope", note:"Нижний регистр, подсветка слов, карточки", sample:"Слово за словом, без шума"},
  {id:"kinetic", name:"Кинетический", preset:"red", effect:"pop", accent:"#ff5a1f", capSize:60,
   font:"Manrope", note:"Крупное слово, прыжок на ударении", sample:"Одно слово — один кадр"},
  {id:"launch", name:"Запуск", preset:"tech", effect:"type", accent:"#7c5cff", capSize:58,
   font:"Manrope", note:"Тёмный интерфейс, моно-метки, глитч", sample:"Запуск за три шага"},
  {id:"meme", name:"Мем", preset:"light", effect:"outline", accent:"#ffd166", capSize:60,
   font:"Manrope", note:"Обводка и крупная реакция рядом с лицом", sample:"Реакция крупным планом"},
  {id:"pop", name:"Журнал", preset:"light", effect:"upper", accent:"#ff2e88", capSize:56,
   font:"Manrope", note:"ЗАГЛАВНЫЕ, цветной блок, журнальная сетка", sample:"БОЛЬШОЕ СЛОВО В КАДРЕ"},
];

export const styleById = (id) => GHOST_STYLES.find((s) => s.id === id) || GHOST_STYLES[0];

// Дубли и паузы: те же правила, что в takedown ghost-editor, но на JS.
export function planGhostEdit(cues, opts = {}) {
  const plan = planTakes(cues, opts);
  const chosenMs = (plan.pieces || []).reduce((sum, p) => sum + Math.max(0, p.to - p.from), 0);
  return {
    ...plan,
    target: {min: GHOST_RULES.targetMin, max: GHOST_RULES.targetMax, chosen: Number(chosenMs.toFixed(1))},
    note: chosenMs > 0 && chosenMs < GHOST_RULES.targetMin
      ? "Сейчас короче 45 с. Для Reels это нормально, но ghost-editor целится в 45–75 с."
      : chosenMs > GHOST_RULES.targetMax
        ? "Сейчас длиннее 75 с. Убери лишние дубли или сократи фрагмент."
        : "Хронометраж в пределах 45–75 с.",
  };
}

// Лист согласия: кадр на каждой склейке и сцене, как approval_sheet.py.
// В браузере вместо PNG генерируются точки просмотра: кнопка ведёт к кадру.
export function buildApprovalSheet({cuts = [], graphics = [], cues = [], start = 0, limit = 40} = {}) {
  const points = [];
  for (const c of cuts) {
    if (!Number.isFinite(c.from)) continue;
    points.push({kind:"cut", time:Number(start) + Number(c.from), title:"Склейка",
      detail:`Убрать ${(Number(c.to) - Number(c.from)).toFixed(2)} с. Проверь губы и звук на стыке.`});
  }
  for (const g of graphics) {
    if (!Number.isFinite(g.at) || !String(g.label || "").trim()) continue;
    points.push({kind:"graphic", time:Number(g.at), title:g.kind === "diagram" ? "Схема" : "Текст на кадре",
      detail:`«${String(g.label).slice(0, 60)}» · ${Number(g.duration) || 2.8} с. Не должно закрывать лицо.`});
  }
  for (const cue of cues.slice(0, 2)) {
    if (!Number.isFinite(cue.start) || !String(cue.text || "").trim()) continue;
    points.push({kind:"caption", time:Number(cue.start), title:"Субтитры",
      detail:`«${String(cue.text).slice(0, 60)}». Сверь текст и время с речью.`});
  }
  return points.sort((a, b) => a.time - b.time).slice(0, limit);
}

// Проверка перед сборкой: только то, что реально проверяемо по таймингам.
export function qaGhost({cuts = [], graphics = [], cues = [], start = 0, end = 0,
  faceY = 29, captionPosition = "normal", approved = false} = {}) {
  const warnings = [];
  const span = Math.max(0, Number(end) - Number(start));
  const removed = cuts.reduce((s, c) => s + Math.max(0, Math.min(Number(c.to), end) - Math.max(Number(c.from), start)), 0);
  const out = Math.max(0, span - removed);
  const sceneTime = graphics.filter((g) => g.layout === "scene")
    .reduce((s, g) => s + Math.min(Number(g.duration) || 0, out), 0);
  const faceShare = out > 0 ? 1 - sceneTime / out : 0;
  if (out > 0 && faceShare < GHOST_RULES.faceOnScreenMin)
    warnings.push({code:"face-share", time:Number(start), title:"Лицо почти не видно",
      detail:`Сцены занимают около ${Math.round((1 - faceShare) * 100)}% ролика. Оставь говорящего минимум на 65%.`});
  if (graphics.length > GHOST_RULES.maxGraphicElements)
    warnings.push({code:"too-many-graphics", time:Number(start), title:"Слишком много графики",
      detail:`Элементов: ${graphics.length}. Оставь не больше ${GHOST_RULES.maxGraphicElements}.`});
  const capY = {high:.72, normal:.80, low:.86}[captionPosition] ?? .8;
  if (Math.abs(capY - Number(faceY) / 100) < .14)
    warnings.push({code:"face-cover", time:Number(start), title:"Субтитры рядом с лицом",
      detail:"Сдвинь субтитры или положение лица, чтобы текст не перекрывал рот."});
  if (out > GHOST_RULES.targetMax)
    warnings.push({code:"long", time:Number(start), title:"Ролик длиннее 75 с",
      detail:`После нарезки: ${out.toFixed(1)} с. Для короткого reel обычно хватает 45–75 с.`});
  const cutRate = out > 0 ? cuts.length / (out / 60) : 0;
  if (cutRate > 20)
    warnings.push({code:"many-cuts", time:Number(start), title:"Очень много склеек",
      detail:`${cuts.length} склеек за ${out.toFixed(1)} с. Проверь стыки на дыхание и мигание.`});
  if (!cues.some((c) => Number(c.end) > start && Number(c.start) < end))
    warnings.push({code:"no-cues", time:Number(start), title:"Нет слов с таймингом",
      detail:"Без субтитров нельзя проверить, не вырезана ли часть речи."});
  if (!approved && (cuts.length || graphics.length))
    warnings.push({code:"approval", time:Number(start), title:"Нужен лист проверки",
      detail:"Открой каждую точку листа и поставь отметку перед сборкой."});
  return warnings;
}

// Демо-фразы только для примера оформления; это не утверждения о продукте.
export function exampleCues() {
  return [
    {id:"ex-1", start:0.3, end:2.4, text:"Маленький перерыв.",
     words:[{text:"Маленький",start:.3,end:.9},{text:"перерыв.",start:1.0,end:2.4}]},
    {id:"ex-2", start:2.7, end:5.4, text:"Для больших идей.",
     words:[{text:"Для",start:2.7,end:3.0},{text:"больших",start:3.1,end:4.2},{text:"идей.",start:4.3,end:5.4}]},
  ];
}

export function templateExample(id) {
  const style = styleById(id);
  return {...style, cues:exampleCues(), headline:style.sample};
}
