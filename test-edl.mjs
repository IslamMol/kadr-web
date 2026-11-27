import assert from "node:assert/strict";
import {
  normalizeEdl, frameState, sourceTimeAt, outputTimeForSource,
  mapCuesToOutput, hashEdl, serializeEdl,
} from "./edl.js";

const edl = normalizeEdl({
  name: "тест",
  output: { width: 1080, height: 1920, fps: 30 },
  clips: [
    { id: "a", src: "video", in: 2, out: 5 },
    { id: "b", src: "video", in: 10, out: 11.5 },
  ],
  captions: [{ start: 0.5, end: 2, text: "Вторая фраза", words: [{ text: "Вторая", start: 0.5, end: 1.2 }, { text: "фраза", start: 1.2, end: 2 }] }],
  graphics: [{ type: "quote", at: 0.8, duration: 1, label: "Цитата", value: "", steps: [] }],
  transitions: [{ type: "dissolve", at: 3, duration: 0.4 }],
  look: { preset: "cinematic", grain: 0.1, vignette: 0.3 },
});

assert.equal(edl.duration, 4.5, "длительность = сумма фрагментов");
assert.equal(edl.spans.length, 2);
assert.equal(sourceTimeAt(edl, 0), 2, "начала первого фрагмента");
assert.equal(sourceTimeAt(edl, 3.2), 10.2, "второй фрагмент мапится в исходник");
assert.equal(outputTimeForSource(edl, 4), 2, "обратное преобразование времени");
assert.equal(frameState(edl, 3.49).frame, 105);
assert.equal(frameState(edl, 1).cue?.text, "Вторая фраза");
assert.equal(frameState(edl, 1).graphic?.label, "Цитата");
assert.equal(frameState(edl, 3.1).transition?.type, "dissolve");

const mapped = mapCuesToOutput(edl, [{ text: "привет", start: 10.2, end: 10.9, words: [{ text: "привет", start: 10.2, end: 10.9 }] }]);
assert.equal(mapped.length, 1);
assert.equal(mapped[0].start.toFixed(2), "3.20");
assert.equal(mapped[0].end.toFixed(2), "3.90");

assert.equal(hashEdl(edl), hashEdl(normalizeEdl(JSON.parse(serializeEdl(edl)))), "хэш стабилен");
assert.notEqual(hashEdl(edl), hashEdl({ ...edl, look: { ...edl.look, grain: 0.2 } }));

assert.throws(() => normalizeEdl({ clips: [] }), /fragment|фрагмент/i);
assert.throws(() => normalizeEdl({ clips: [{ in: 2, out: 1 }] }), /фрагмент/i);
const clamped = normalizeEdl({ clips: [{ in: 0, out: 1 }], look: { grain: 9, vignette: -2 } });
assert.equal(clamped.look.grain, 1);
assert.equal(clamped.look.vignette, 0);
console.log("OK edl: spans, mapping, frames, hash and validation");
