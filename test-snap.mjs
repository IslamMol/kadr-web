import assert from "node:assert/strict";
import { normalizeEdl } from "./edl.js";
import { wordBoundaries, snapTime } from "./snap.js";

const edl = normalizeEdl({
  clips: [{ src: "video", in: 0, out: 2 }, { src: "video", in: 5, out: 7 }],
  captions: [{
    start: 0.2, end: 1.8, text: "Привет мир",
    words: [{ text: "Привет", start: 0.2, end: 0.9 }, { text: "мир", start: 0.9, end: 1.8 }],
  }],
});
const points = wordBoundaries(edl);
assert.ok(points.includes(0.2) && points.includes(0.9) && points.includes(1.8));
assert.ok(points.includes(2), "граница склейки тоже точка прилипания");
assert.ok(points.includes(0) && points.includes(edl.duration));
assert.equal(snapTime(0.94, points, 0.08).time, 0.9, "прилипло к концу слова");
assert.equal(snapTime(0.94, points, 0.08).snapped, true);
assert.equal(snapTime(1.25, points, 0.08).snapped, false, "далеко — не прилипает");
assert.equal(snapTime(1.25, points, 0.08).time, 1.25);
console.log("OK snap: word boundaries, cuts and tolerance");
