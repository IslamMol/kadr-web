// Кадр 3.0: подготовка site/ для Cloudflare Pages. Только новая студия.
import { mkdir, copyFile, access, rm, writeFile, cp, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const site = path.join(root, "site");
await mkdir(site, { recursive: true });

const studio = await readFile(path.join(root, "studio3.html"), "utf8");
const preview = await readFile(path.join(root, "preview.html"), "utf8");
await writeFile(path.join(site, "index.html"), studio, "utf8");
await writeFile(path.join(site, "studio3.html"), studio, "utf8");
await writeFile(path.join(site, "preview.html"), preview, "utf8");

for (const name of ["preview-cover.png", "demo-portrait.mp4", "manifest.webmanifest"]) {
  await copyFile(path.join(root, name), path.join(site, name));
}
await cp(path.join(root, "icons"), path.join(site, "icons"), { recursive: true, force: true });

const version = createHash("sha256").update(studio).digest("hex").slice(0, 16);
const swTemplate = await readFile(path.join(root, "sw-template.js"), "utf8");
await writeFile(path.join(site, "sw.js"), swTemplate.replaceAll("__VERSION__", version), "utf8");
await writeFile(path.join(site, ".nojekyll"), "", "utf8");

for (const old of ["kadr.html", "LICENSES.txt"]) await rm(path.join(site, old), { force: true });
for (const folder of ["converter", "source", "desktop"]) await rm(path.join(site, folder), { recursive: true, force: true });

const required = ["index.html", "studio3.html", "preview.html", "preview-cover.png", "demo-portrait.mp4", "manifest.webmanifest", "sw.js", "icons/icon-192.png"];
for (const rel of required) await access(path.join(site, rel));
console.log("Cloudflare output ready: site/ (only Кадр 3.0)");
