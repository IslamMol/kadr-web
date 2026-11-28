# Кадр 3.0 на Cloudflare Pages

Статический сайт уже лежит в `site/`. Никаких серверов, ключей и environment variables не нужно.

## Через Dashboard

1. Cloudflare → Workers & Pages → Pages → **Create a project** → Connect to Git → `IslamMol/kadr-web`.
2. Framework preset: **None**.
3. Build command: `npm run build:cloudflare` (можно `npm run build` — он теперь тоже работает без Python).
4. **Deploy command оставь ПУСТЫМ.** `npx wrangler deploy` — это Workers, он ломает Pages-сборку.
5. Build output directory: `site`
6. Root directory: `/`
7. Node version: `20` или новее.
8. Save and Deploy.

`npm run build:cloudflare` только проверяет и копирует уже собранные HTML-файлы в `site/`. Он не требует Python, ffmpeg или Windows и не добавляет в Pages 107-МБ архив Windows — тот раздаётся через GitHub Releases.

## Через Wrangler

```bash
npm install
npm run build:cloudflare
npx wrangler pages deploy site --project-name kadr-web
```

Если Wrangler не авторизован:

```bash
npx wrangler login
```

## Структура site/

- `index.html` — старый редактор Кадр 2.0
- `studio3.html` — студия 3.0
- `preview.html` — превью, обложка и инструкция
- `preview-cover.png` — OG-обложка
- `demo-portrait.mp4` — встроенный пример
- `converter/ffmpeg-core.part1..4` — локальный конвертер
- `icons/`, `manifest.webmanifest`, `sw.js` — PWA

## Частые ошибки

- **«Build failed: python: command not found»** — в Dashboard включён старый build command. Поставь `npm run build:cloudflare` или `npm run build` (после обновления репозитория Python не нужен).
- **«Deploy command: npx wrangler deploy»** — удали это поле. Это развёртывание Worker, а не статического Pages-сайта.
- **«File too large»** — в `site/` попал `desktop/kadr-desktop.zip`. Удали его: `npm run build:cloudflare` делает это автоматически.
- **Пустая страница** — проверь, что Build output directory = `site`, а не `/site` или `dist`.
