# Кадр 3.0 на Cloudflare Pages

Статический сайт уже лежит в `site/`. Никаких серверов, ключей и environment variables не нужно.

## Через Dashboard

1. Cloudflare → Workers & Pages → Pages → **Create a project** → Connect to Git → `IslamMol/kadr-web`.
2. Framework preset: **None**.
3. Build command: `npm run build:cloudflare`
4. Build output directory: `site`
5. Root directory: оставь пустым (по умолчанию `/`).
6. Node version: `20` или новее.
7. Deploy.

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

- **«Build failed: python: command not found»** — включён не тот build command. Nuжен `npm run build:cloudflare`.
- **«File too large»** — в `site/` попал `desktop/kadr-desktop.zip`. Удали его: `npm run build:cloudflare` делает это автоматически.
- **Пустая страница** — проверь, что Build output directory = `site`, а не `/site` или `dist`.
