// Кадр 3.0: подготовка папки site для Cloudflare Pages без Python и без Windows.
// Используется как build command в Cloudflare: node tools/build-cloudflare.mjs
import { mkdir, copyFile, access, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const site = path.join(root, "site");
await mkdir(site, { recursive: true });

const copyIfExists = async (from, to) => {
  const src = path.join(root, from), dst = path.join(site, to);
  try { await access(src); await copyFile(src, dst); return true; } catch { return false; }
};

// Уже собранные HTML-файлы хранятся в репозитории — сборка JS не нужна.
const copies = [
  ["kadr.html", "index.html"],
  ["studio3.html", "studio3.html"],
  ["preview.html", "preview.html"],
  ["preview-cover.png", "preview-cover.png"],
  ["demo-portrait.mp4", "demo-portrait.mp4"],
  ["manifest.webmanifest", "manifest.webmanifest"],
];
for (const [from, to] of copies) if (!(await copyIfExists(from, to))) throw new Error(`Нет файла ${from}`);

const required = [
  "site/index.html", "site/studio3.html", "site/preview.html",
  "site/preview-cover.png", "site/demo-portrait.mp4",
  "site/manifest.webmanifest", "site/sw.js",
  "site/converter/ffmpeg-core.part1", "site/converter/ffmpeg-core.part2",
  "site/converter/ffmpeg-core.part3", "site/converter/ffmpeg-core.part4",
];
for (const rel of required) {
  try { await access(path.join(root, rel)); }
  catch { throw new Error(`Cloudflare: отсутствует ${rel}`); }
}

// Архив Windows лежит на GitHub Releases, в Pages он не нужен и слишком велик.
await rm(path.join(site, "desktop", "kadr-desktop.zip"), { force: true });

console.log("Cloudflare Pages output ready:", path.relative(root, site));
console.log("Files checked:", required.length);
