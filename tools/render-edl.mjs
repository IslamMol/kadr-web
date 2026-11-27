// Доказательство фазы 1: один EDL рендерится в настоящий MP4.
// Использует тот же renderFrame, что будет работать в браузере.
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { normalizeEdl } from "../edl.js";
import { renderFrame } from "../frame.js";

const run = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const font = path.join(root, "fonts", "Manrope.ttf");
if (GlobalFonts.registerFromPath(font, "Kadr Manrope")) console.log("font registered");

const edl = normalizeEdl({
  name: "Kadr EDL proof",
  output: { width: 1080, height: 1920, fps: 30 },
  clips: [
    { id: "a", src: "video", in: 0, out: 2.2 },
    { id: "b", src: "video", in: 4, out: 6 },
  ],
  captions: [{
    id: "hook", start: 0.2, end: 2, text: "МАЛЕНЬКИЙ ПЕРЕРЫВ", template: "karaoke",
    words: [
      { text: "МАЛЕНЬКИЙ", start: 0.2, end: 1.1 },
      { text: "ПЕРЕРЫВ", start: 1.1, end: 2 },
    ],
  }],
  graphics: [
    { id: "card", type: "number", at: 2.4, duration: 1.0, label: "идей в примере", value: "2" },
    { id: "quote", type: "quote", at: 3.3, duration: 0.9, label: "Для больших идей" },
  ],
  motion: [{ id: "slam", type: "word-slam", at: 0.2, duration: 0.7 }],
  transitions: [{ id: "cut", type: "flash", at: 2.2, duration: 0.25 }],
  look: { preset: "cinematic", accent: "#e7c27a", grain: 0.16, vignette: 0.4 },
});

const tmp = path.join(os.tmpdir(), "kadr-edl-proof");
const out = path.join(root, "out");
await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });
await mkdir(out, { recursive: true });

const canvas = createCanvas(edl.output.width, edl.output.height);
const ctx = canvas.getContext("2d");
const frames = Math.round(edl.duration * edl.output.fps);
for (let i = 0; i < frames; i++) {
  renderFrame(ctx, edl, i / edl.output.fps, {});
  await writeFile(path.join(tmp, `f-${String(i).padStart(5, "0")}.png`), await canvas.encode("png"));
}
console.log(`rendered ${frames} frames`);

const ffmpeg = process.env.FFMPEG || "ffmpeg";
const target = path.join(out, "edl-proof.mp4");
await run(ffmpeg, [
  "-y", "-framerate", String(edl.output.fps),
  "-i", path.join(tmp, "f-%05d.png"),
  "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
  "-t", String(edl.duration),
  "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-shortest", target,
]);
await rm(tmp, { recursive: true, force: true });
console.log(`OK ${target}`);
