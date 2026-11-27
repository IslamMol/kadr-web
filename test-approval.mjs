import assert from "node:assert/strict";
import { normalizeEdl } from "./edl.js";
import { buildApprovalSheet, qaApproval } from "./approval.js";

const edl = normalizeEdl({
  output: { width: 1080, height: 1920, fps: 30 },
  clips: [{ src: "video", in: 0, out: 2 }, { src: "video", in: 5, out: 7 }],
  captions: [{ start: 0.2, end: 1.8, text: "Привет" }],
  graphics: [{ type: "quote", at: 0.8, duration: 1, label: "Цитата" }],
});
const sheet = buildApprovalSheet(edl);
assert.ok(sheet.some(p => p.kind === "cut"), "склейка есть в листе");
assert.ok(sheet.some(p => p.kind === "scene"), "сцена есть в листе");
assert.ok(sheet.some(p => p.kind === "caption"), "субтитры есть в листе");
assert.ok(sheet.every((p, i) => !i || sheet[i - 1].time <= p.time), "лист отсортирован по времени");
assert.equal(qaApproval(edl, sheet).length, 0, "нормальный ролик без предупреждений");
assert.ok(qaApproval(normalizeEdl({ clips: [{ src: "video", in: 0, out: 3 }] })).some(w => w.title === "Нет субтитров"));
console.log("OK approval: cut, scene and caption checkpoints");
