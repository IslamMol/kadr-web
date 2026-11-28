# Кадр 3.0 на Cloudflare Pages

Репозиторий содержит только новую студию. Старый редактор удалён из репозитория и из `site/`.

## Через Dashboard

1. Workers & Pages → Pages → Create → Connect to Git → `IslamMol/kadr-web`.
2. Framework preset: **None**.
3. Build command: `npm run build:cloudflare`
4. Deploy command: **пусто** (не `npx wrangler deploy` — это Workers).
5. Root directory: `/`
6. Build output directory: `site`
7. Node version: `20+`
8. Save and Deploy.

## Что в `site/`

- `index.html` — студия 3.0 (главная страница)
- `studio3.html` — прямой адрес студии
- `preview.html` — превью, обложка и инструкция
- `preview-cover.png`, `demo-portrait.mp4`
- `manifest.webmanifest`, `sw.js`, `icons/`

Python, ffmpeg и Windows-архив для Cloudflare не нужны.

## Wrangler

```bash
npm install
npm run build:cloudflare
npx wrangler pages deploy site --project-name kadr-web
```

## Частые ошибки

- `python: command not found` — используй `npm run build:cloudflare`.
- `npx wrangler deploy` в Deploy command — удали поле.
- Пустая страница — output directory должен быть `site`, а не `/site` или `dist`.
- Старый интерфейс на корне — сделай Retry build после коммита `eecfbb8` и новее; `site/index.html` теперь студия.
