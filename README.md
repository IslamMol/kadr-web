# Кадр 3.0 — студия монтажа разговорных видео

Локальный браузерный редактор для talking-head рилс: загрузил видео → распознал речь → выбрал шаблон → скачал MP4. Без серверов, ключей и загрузки видео в облако.

- Студия: `studio3.html`
- Превью и инструкция: `preview.html`
- GitHub: https://github.com/IslamMol/kadr-web
- Cloudflare Pages: https://kadr-web.pages.dev/
- Windows: https://github.com/IslamMol/kadr-web/releases/latest/download/kadr-desktop.zip

## Что умеет

- Автосубтитры по словам: локальный Whisper, выбор `small` (точно) или `tiny` (быстро).
- Редактор фраз: текст, начало/конец, разделить, слить, удалить, перейти к кадру.
- Автоудаление дублей и длинных пауз, прилипание склеек к словам.
- 25 уникальных шаблонов монтажа с живыми превью на макете говорящей головы.
- Моушен-графика, карточки, схемы, чипы, CTA, плёнка, сетка, стекло.
- Проект `.kadr3` — EDL и исходное видео внутри; открывается в браузере и десктопе.
- Лист проверки перед сборкой.
- Экспорт вертикального MP4 1080×1920, 30 fps, H.264 + AAC.

## Локальный запуск

Открой `studio3.html` в Chrome или Edge. Для распознавания речи нужен интернет на первом запуске — модель скачивается и работает на устройстве.

Сборка:

```bash
npm install
npm run build
npm test
```

`npm run build` не требует Python: если он недоступен, используются уже собранные HTML-файлы из репозитория. Полная пересборка с Python: `npm run build:full`.

## Cloudflare Pages

Подробности — в `CLOUDFLARE.md`. Коротко:

- Build command: `npm run build:cloudflare`
- Deploy command: **пусто**
- Root directory: `/`
- Build output directory: `site`
- Node: `20+`

Папка `site/` содержит только новую версию: `index.html` — это студия, `preview.html` — витрина, `studio3.html` — прямой адрес студии.

## Структура ядра

- `edl.js` — монтажный список
- `frame.js` — рендер кадра для экспорта
- `preview-frame.js` — безопасный рендер превью
- `talking-head.js` — макет говорящей головы
- `templates.js` — 25 систем монтажа
- `project3.js` — формат `.kadr3`
- `silence.js` — поиск пауз
- `ghost.js`, `takes.js`, `snap.js` — правила дублей и склеек
- `hyper-adapter.js` — экспорт EDL в HyperFrames-композицию

Исходники и лицензии сторонних проектов — в `THIRD_PARTY.md`.
