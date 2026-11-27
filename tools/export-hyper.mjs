// Экспорт проекта Кадра в папку HyperFrames:
//   node tools/export-hyper.mjs project.kadr3 out/hyper-project
//   node tools/export-hyper.mjs edl.json video.mp4 out/hyper-project
// Потом: npx hyperframes lint && npx hyperframes preview && npx hyperframes render
import { mkdir, writeFile, copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeEdl } from "../edl.js";
import { buildHyperComposition } from "../hyper-adapter.js";
import { readProject3 } from "../project3.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
if (!args.length) {
  console.log("Использование: node tools/export-hyper.mjs <project.kadr3|edl.json> [video.mp4] [outDir]");
  process.exit(1);
}

let edl, videoPath = null, outDir = args[1] || path.join(root, "out", "hyper-project");
const input = path.resolve(root, args[0]);
if (input.endsWith(".kadr3")) {
  const project = await readProject3(await readFile(input));
  edl = project.edl;
  videoPath = path.join(path.dirname(input), "video.mp4");
  await writeFile(videoPath, Buffer.from(await project.blob.arrayBuffer()));
} else {
  const raw = JSON.parse(await readFile(input, "utf8"));
  edl = normalizeEdl(raw.edl || raw);
  if (args[1] && !args[1].endsWith("/") && args[2]) { videoPath = path.resolve(root, args[1]); outDir = args[2]; }
}
if (!videoPath) throw new Error("Укажи видео: project.kadr3 или edl.json video.mp4 outDir");

const target = path.resolve(root, outDir);
await mkdir(path.join(target, "assets"), { recursive: true });
await writeFile(path.join(target, "index.html"), buildHyperComposition(edl, { videoSrc: "assets/video.mp4" }), "utf8");
const ext = path.extname(videoPath) || ".mp4";
await copyFile(videoPath, path.join(target, "assets", `video${ext}`));
console.log(`OK HyperFrames project: ${target}`);
console.log("Дальше: npx hyperframes lint && npx hyperframes preview && npx hyperframes render");
