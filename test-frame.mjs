import assert from "node:assert/strict";
import { normalizeEdl } from "./edl.js";
import { renderFrame } from "./frame.js";

function stub() {
  const s = {
    ops: [], fillStyle: "#000", strokeStyle: "#000", font: "", globalAlpha: 1,
    textAlign: "left", textBaseline: "top", lineWidth: 1,
    save() { this.ops.push(["save", this.fillStyle, this.globalAlpha]); },
    restore() { this.ops.push(["restore"]); },
    clearRect(...a) { this.ops.push(["clear", ...a]); },
    fillRect(...a) { this.ops.push(["rect", this.fillStyle, this.globalAlpha, ...a]); },
    fillText(t, x, y, m) { this.ops.push(["text", this.fillStyle, this.font, this.globalAlpha, t, x, y, m]); },
    strokeText(t, x, y, m) { this.ops.push(["strokeText", this.strokeStyle, this.lineWidth, t, x, y, m]); },
    measureText(t) { return { width: String(t).length * 26 }; },
    translate(x, y) { this.ops.push(["translate", x, y]); },
    scale(x, y) { this.ops.push(["scale", x, y]); },
    rotate(a) { this.ops.push(["rotate", a]); },
    beginPath() { this.ops.push(["path"]); },
    roundRect(...a) { this.ops.push(["roundRect", ...a]); },
    arc(...a) { this.ops.push(["arc", ...a]); },
    fill() { this.ops.push(["fill", this.fillStyle]); },
    stroke() { this.ops.push(["stroke", this.strokeStyle]); },
    createRadialGradient(...a) {
      const id = this.ops.length;
      this.ops.push(["gradient", id, ...a]);
      return { addColorStop: (p, c) => this.ops.push(["stop", id, p, c]) };
    },
  };
  return s;
}

const edl = normalizeEdl({
  output: { width: 1080, height: 1920, fps: 30 },
  clips: [{ id: "a", src: "video", in: 0, out: 4 }],
  captions: [{
    start: 0.2, end: 3.2, text: "Маленькая идея", template: "highlighter", keyword: "идея",
    words: [
      { text: "Маленькая", start: 0.2, end: 1.4 },
      { text: "идея", start: 1.4, end: 3.2 },
    ],
  }],
  graphics: [{ type: "diagram", at: 1, duration: 2, label: "Три шага", steps: ["Первый", "Второй", "Третий"] }],
  motion: [{ type: "word-slam", at: 0.2, duration: 0.6, target: "" }],
  transitions: [{ type: "flash", at: 2, duration: 0.3 }],
  look: { preset: "cinematic", grain: 0.2, vignette: 0.4 },
});

const a = stub(), b = stub();
const sa = renderFrame(a, edl, 1.5), sb = renderFrame(b, edl, 1.5);
assert.equal(JSON.stringify(a.ops), JSON.stringify(b.ops), "один кадр рендерится одинаково");
assert.equal(sa.frame, 45);
assert.equal(sa.cue?.text, "Маленькая идея");
assert.equal(sa.graphic?.type, "diagram");

const textOps = a.ops.filter(o => o[0] === "text").map(o => o[4]);
assert.ok(textOps.includes("Маленькая"), "слово из субтитров нарисовано");
assert.ok(textOps.some(t => String(t).includes("Три шага")), "графика нарисована");
assert.ok(a.ops.some(o => o[0] === "gradient"), "виньетка включена");
assert.ok(a.ops.some(o => o[0] === "scale"), "motion влияет на кадр");

const quiet = normalizeEdl({ ...JSON.parse(JSON.stringify(edl)), reducedMotion: true, look: { preset: "clean", grain: 0, vignette: 0 }, transitions: [], motion: [] });
const c = stub();
renderFrame(c, quiet, 2.1);
assert.ok(!c.ops.some(o => o[0] === "gradient"), "без grain/vignette градиента нет");
assert.ok(!c.ops.some(o => o[0] === "text" && String(o[4]).includes("FLASH")), "переход не добавляет текст");

console.log("OK frame: deterministic canvas ops, captions, graphics, look and reduced motion");
