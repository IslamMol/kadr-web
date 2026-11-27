// Кадр 3.0: каталог приёмов и шаблонов, собранный из ghost-editor,
// EasyReels, herk-edit-kit, Opus Motion Library и HyperFrames.
// Каждый шаблон — не картинка, а конкретная система: субтитры, сцена,
// движение, цвет и правила постановки акцентов. Всё детерминировано.

export const KADR_TEMPLATES = [
  // Preset-стили ghost-editor (styles/*.json)
  {id:"clean", name:"Чистый", family:"ghost-editor · preset", bestFor:"совет, бизнес, спокойная речь",
   caption:"clean", look:"clean", accent:"#ffd23f", graphic:"number", motion:"spring", maxBeats:2,
   what:"Крупные слова, один акцент, счёт на цифрах. Без сцен без нужды.", sample:"Одна идея — один акцент"},
  {id:"editorial", name:"Редакционный", family:"ghost-editor · preset", bestFor:"данные, инсайт, исследование",
   caption:"highlighter", look:"editorial", accent:"#d13f34", graphic:"stats", motion:"rise", maxBeats:3,
   what:"Нижний регистр, подсветка слов, сцены со статистикой.", sample:"new research shows"},
  {id:"cinematic", name:"Кино", family:"ghost-editor · preset", bestFor:"история, основатель, эмоция",
   caption:"blur", look:"cinematic", accent:"#e7c27a", graphic:"quote", motion:"rise", maxBeats:2,
   what:"Засечки, grain, виньетка, тихая цитата вместо крика.", sample:"a long way from here"},
  {id:"kinetic", name:"Кинетика", family:"ghost-editor · preset", bestFor:"хук, цитата, манифест",
   caption:"pop", look:"kinetic", accent:"#ff5a1f", graphic:"behind", motion:"word-slam", maxBeats:3,
   what:"Слово бьёт на ударении, крупное слово за спиной, жёсткий ритм.", sample:"ОДНО СЛОВО"},
  {id:"launch", name:"Запуск", family:"ghost-editor · preset", bestFor:"продукт, AI, фича",
   caption:"outline", look:"launch", accent:"#7c5cff", graphic:"ui", motion:"scramble", maxBeats:3,
   what:"Тёмное окно продукта, напечатанный промпт, глитч по ударению.", sample:"ship it"},
  {id:"meme", name:"Мем", family:"ghost-editor · preset", bestFor:"реакция, горячее мнение",
   caption:"karaoke", look:"magazine", accent:"#ffd166", graphic:"chip", motion:"spring", maxBeats:3,
   what:"Обводка, чипсы, реакция рядом с лицом, мягкий хаос.", sample:"реакция крупным планом"},
  {id:"pop", name:"Журнал", family:"ghost-editor · preset", bestFor:"личный бренд, смелое утверждение",
   caption:"pop", look:"magazine", accent:"#ff2e88", graphic:"behind", motion:"word-slam", maxBeats:2,
   what:"ЗАГЛАВНЫЕ, цветной блок, слово плашет за говорящим.", sample:"БОЛЬШОЕ СЛОВО"},

  // Recipes ghost-editor (записаны как системы, не логотипы)
  {id:"clean-os", name:"Clean OS", family:"ghost-editor · recipe", bestFor:"размышление, объяснение телефона",
   caption:"blur", look:"clean", accent:"#111111", graphic:"card", motion:"rise", maxBeats:3,
   what:"Слова проявляются изblur, белая iOS-карточка, тонкий курсор.", sample:"on repeat"},
  {id:"seoul-list", name:"Seoul list", family:"ghost-editor · recipe", bestFor:"список из N вещей",
   caption:"line-focus", look:"paper", accent:"#d13f34", graphic:"list", motion:"rise", maxBeats:4,
   what:"Одно слово на строку, серая подсветка, нумерованный список.", sample:"три места"},
  {id:"face-result", name:"Face RESULT", family:"ghost-editor · recipe", bestFor:"история, подкаст, ностальгия",
   caption:"highlighter", look:"paper", accent:"#1f3b6e", graphic:"quote", motion:"rise", maxBeats:3,
   what:"Бумажные открытки рядом с лицом, цитата, плёночная пыль.", sample:"ones who left"},
  {id:"kinetic-doc", name:"Kinetic doc", family:"ghost-editor · recipe", bestFor:"архив, документ, факт",
   caption:"karaoke", look:"ink", accent:"#ff3b30", graphic:"strike", motion:"word-slam", maxBeats:3,
   what:"Ч/б архив, одно красное слово, зачёркнутый миф.", sample:"МИФ"},
  {id:"step-deck", name:"Step Deck", family:"ghost-editor · recipe", bestFor:"шаги, инструкция, советы",
   caption:"clean", look:"ink", accent:"#ffd166", graphic:"diagram", motion:"rise", maxBeats:3,
   what:"Огромный номер шага, схема из твоих фраз, быстрые склейки.", sample:"ШАГ 01"},
  {id:"caption-news", name:"Caption News", family:"ghost-editor · recipe", bestFor:"новости, тезисы, без звука",
   caption:"hype", look:"news", accent:"#ffd23f", graphic:"stamp", motion:"word-slam", maxBeats:3,
   what:"Слова слампаются на ударении, жёлтый блок, штамп источника.", sample:"ПРИЧИНА"},
  {id:"swiss-grid", name:"Swiss Grid", family:"ghost-editor · recipe", bestFor:"глэвы, структура, типографика",
   caption:"neominimal", look:"paper", accent:"#e11d1d", graphic:"lower-third", motion:"rise", maxBeats:3,
   what:"Сетка, один красный цвет, текст слева, тихое движение.", sample:"CHAPTER 01"},
  {id:"data-story", name:"Data Story", family:"ghost-editor · recipe", bestFor:"числа с источником",
   caption:"neominimal", look:"paper", accent:"#d13f34", graphic:"stats", motion:"rise", maxBeats:2,
   what:"Схема рисует число, подпись-источник. Выдуманных цифр нет.", sample:"39%"},
  {id:"halftone", name:"Halftone Dossier", family:"ghost-editor · recipe", bestFor:"дело, миф, разбор",
   caption:"outline", look:"halftone", accent:"#e7c27a", graphic:"stamp", motion:"scramble", maxBeats:3,
   what:"Кремовая бумага, точки, штамп, архивная карточка.", sample:"CASE FILE"},
  {id:"product-launch", name:"Product launch", family:"product-launch-motion", bestFor:"демо сайта или продукта",
   caption:"outline", look:"launch", accent:"#7c5cff", graphic:"ui", motion:"scramble", maxBeats:3,
   what:"Один экран morph-ing в следующий: кнопка → загрузка → результат.", sample:"GET STARTED"},
  {id:"board-face", name:"Board + face", family:"EasyReels · idea", bestFor:"говорящая голова + плашка",
   caption:"karaoke", look:"board", accent:"#5ce1a6", graphic:"lower-third", motion:"rise", maxBeats:2,
   what:"Тёмная доска, зелёные метки, имя и CTA рядом с лицом.", sample:"ЭТО Я"},
  // Дальше — то, что переносится из остальных репозиториев.
  {id:"easy-hook", name:"Хук над головой", family:"EasyReels · kit", bestFor:"сильный первый кадр",
   caption:"hype", look:"board", accent:"#ff5a3c", graphic:"hook", motion:"word-slam", maxBeats:1,
   what:"Жирный хук в верхней плашке, слово бьёт на ударении.", sample:"ЭТОТ РОЛИК"},
  {id:"easy-chips", name:"Всплывашки", family:"EasyReels · kit", bestFor:"цифры, метки, списки",
   caption:"karaoke", look:"board", accent:"#5ce1a6", graphic:"chip", motion:"spring", maxBeats:3,
   what:"Чипсы всплывают рядом с лицом ровно на слове.", sample:"+212%"},
  {id:"easy-cta", name:"Финальная заставка", family:"EasyReels · kit", bestFor:"подписка, ссылка, CTA",
   caption:"clean", look:"board", accent:"#5ce1a6", graphic:"cta", motion:"rise", maxBeats:1,
   what:"Кнопки CTA и кодовое слово в конце ролика.", sample:"ПОДПИШИСЬ"},
  {id:"herk-graph", name:"Graph paper", family:"herk · cards", bestFor:"тезисы, урок, техника",
   caption:"neominimal", look:"graph", accent:"#8ee6b5", graphic:"card", motion:"rise", maxBeats:3,
   what:"Тёмная миллиметровка, спокойные карточки, зелёные акценты.", sample:"STEP 01"},
  {id:"herk-glass", name:"Glass popout", family:"herk · cards", bestFor:"продукт, UI, объяснение",
   caption:"blur", look:"launch", accent:"#7c5cff", graphic:"glass", motion:"scramble", maxBeats:2,
   what:"Матовое стекло с текстом поверх кадра.", sample:"GLASS CARD"},
  {id:"launch-morph", name:"One shape", family:"product-launch", bestFor:"демо продукта за 15 секунд",
   caption:"outline", look:"launch", accent:"#7c5cff", graphic:"morph", motion:"spring", maxBeats:3,
   what:"Одна форма меняет размер и радиус, не разрезая кадр.", sample:"GET STARTED"},
  {id:"animate-riso", name:"Riso print", family:"animate · style", bestFor:"тёплый принт, объяснение",
   caption:"outline", look:"halftone", accent:"#c2703a", graphic:"stamp", motion:"scramble", maxBeats:2,
   what:"Три краски, оверпринт, лёгкое смещение плашек.", sample:"RISO"},
  {id:"animate-cut", name:"Cut paper", family:"animate · style", bestFor:"история, хроника, рассказ",
   caption:"highlighter", look:"paper", accent:"#d13f34", graphic:"card", motion:"rise", maxBeats:3,
   what:"Бумажные слои, мягкие тени, тёплая бумага.", sample:"CUT PAPER"},
];

export const templateById = (id) => KADR_TEMPLATES.find(t => t.id === id) || KADR_TEMPLATES[0];

const NUM = /(\d+(?:[.,]\d+)?\s*%?|\b(один|два|три|четыре|пять|десять|сто|тысяча)\b)/i;
const LIST = /во-первых|во-вторых|наконец|список|топ|три вещи|пять вещей|,/i;
const MYTH = /не |ни |миф|заблуждение|ошибка|нельзя|стоп/i;
const QUOTE = /[«"]|сказал|говорил|цитата/i;

function pickBeat(cue, tpl) {
  const text = String(cue.text || "");
  if (NUM.test(text)) return { type: tpl.graphic === "stats" || tpl.graphic === "number" ? tpl.graphic : "number", value: (text.match(NUM) || [])[0] || "" };
  if (MYTH.test(text) && tpl.id !== "clean-os") return { type: "strike" };
  if (LIST.test(text)) return { type: ["list", "diagram", "chip", "stats"].includes(tpl.graphic) ? tpl.graphic : "list" };
  if (QUOTE.test(text)) return { type: "quote" };
  return { type: tpl.graphic };
}

// Раскадровка из фраз: объекты появляются на словах, не в случайное время.
// Не больше maxBeats, не чаще одного кадра в 1.2 с, без выдуманного текста.
export function planBeats(cues = [], templateId = "clean") {
  const tpl = templateById(templateId);
  const out = [];
  let last = -2;
  for (const cue of cues) {
    if (out.length >= tpl.maxBeats) break;
    if (!(cue.end > cue.start)) continue;
    const at = cue.start + Math.min(0.35, (cue.end - cue.start) * 0.15);
    if (at - last < 1.2) continue;
    const beat = pickBeat(cue, tpl);
    const text = String(cue.text || "").trim();
    const pieces = text.split(/[,;]|\s+-\s+/).map(s => s.trim()).filter(Boolean);
    const item = {
      id: `beat-${out.length + 1}`, type: beat.type, at,
      duration: Math.min(2.8, Math.max(0.9, cue.end - cue.start)),
      label: text.slice(0, 70), value: String(beat.value || "").slice(0, 30),
      steps: pieces.length > 1 ? pieces.slice(0, 5) : [text.slice(0, 50)],
      template: tpl.caption,
    };
    out.push(item);
    last = at;
  }
  return out;
}

// Три готовых примера на встроенном аквариуме: «сырой дубль → стиль».
// Фразы повторяются: видно, как убирается дубль и меняется графика.
export const KADR_EXAMPLES = [
  {
    id: "ex-clean", name: "Сырой дубль → Чистый", template: "clean",
    note: "Два дубля одной фразы → один чистый клип, счёт и крупные слова.",
    cues: [
      { start: 0.2, end: 1.0, text: "Маленький перерыв.", words: [{ text: "Маленький", start: 0.2, end: 0.6 }, { text: "перерыв.", start: 0.6, end: 1.0 }] },
      { start: 1.3, end: 2.1, text: "Маленький перерыв.", words: [{ text: "Маленький", start: 1.3, end: 1.7 }, { text: "перерыв.", start: 1.7, end: 2.1 }] },
      { start: 2.4, end: 2.95, text: "Для больших идей.", words: [{ text: "Для", start: 2.4, end: 2.55 }, { text: "больших", start: 2.55, end: 2.75 }, { text: "идей.", start: 2.75, end: 2.95 }] },
    ],
  },
  {
    id: "ex-news", name: "Тот же дубль → Caption News", template: "caption-news",
    note: "Жёлтый блок, штамп и слова на ударении — читается без звука.",
    cues: [
      { start: 0.2, end: 1.0, text: "Маленький перерыв.", words: [{ text: "Маленький", start: 0.2, end: 0.6 }, { text: "перерыв.", start: 0.6, end: 1.0 }] },
      { start: 1.3, end: 2.1, text: "Маленький перерыв.", words: [{ text: "Маленький", start: 1.3, end: 1.7 }, { text: "перерыв.", start: 1.7, end: 2.1 }] },
      { start: 2.4, end: 2.95, text: "39% идей приходят в голову.", words: [{ text: "39%", start: 2.4, end: 2.55 }, { text: "идей", end: 2.75, start: 2.55 }, { text: "в голову.", start: 2.75, end: 2.95 }] },
    ],
  },
  {
    id: "ex-step", name: "Тот же дубль → Step Deck", template: "step-deck",
    note: "Нумерованная схема из твоих же фраз, без придуманных заявлений.",
    cues: [
      { start: 0.2, end: 0.9, text: "Во-первых, перерыв.", words: [{ text: "Во-первых,", start: 0.2, end: 0.55 }, { text: "перерыв.", start: 0.55, end: 0.9 }] },
      { start: 1.1, end: 1.8, text: "Во-первых, перерыв.", words: [{ text: "Во-первых,", start: 1.1, end: 1.45 }, { text: "перерыв.", start: 1.45, end: 1.8 }] },
      { start: 2.0, end: 2.95, text: "Во-вторых, большие идеи.", words: [{ text: "Во-вторых,", start: 2.0, end: 2.4 }, { text: "большие", start: 2.4, end: 2.65 }, { text: "идеи.", start: 2.65, end: 2.95 }] },
    ],
  },
];
