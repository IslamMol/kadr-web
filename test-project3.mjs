import assert from "node:assert/strict";
import { createProject3, readProject3, normalizeEditor } from "./project3.js";
import { normalizeEdl } from "./edl.js";

const edl = normalizeEdl({
  output: { width: 1080, height: 1920, fps: 30 },
  clips: [{ src: "video", in: 1, out: 3 }],
  captions: [{ start: 0.2, end: 1.8, text: "Привет", template: "hype" }],
  graphics: [{ type: "stamp", at: 0.8, duration: 1, label: "МИФ" }],
  look: { preset: "news", accent: "#ffd23f" },
});
const editor = {
  template: "caption-news", words: "Привет\nМир", start: 1, end: 3,
  cues: [{ id: "a", start: 1.2, end: 2, text: "Привет", words: [{ text: "Привет", start: 1.2, end: 2 }] }],
  excluded: ["old"],
  manualGraphics: [{ id: "m1", type: "stamp", at: 0.8, duration: 1, label: "МИФ", steps: ["a"] }],
  cutDeltas: { "0": { delta: 0.25, base: 2 } },
};
const video = new Blob(["FAKEVIDEO"], { type: "video/mp4" });
const project = createProject3({ edl, editor }, Object.assign(video, { name: "talk.mp4" }));
const loaded = await readProject3(project);

assert.equal(loaded.name, "talk.mp4");
assert.equal(await loaded.blob.text(), "FAKEVIDEO");
assert.equal(loaded.edl.captions[0].template, "hype");
assert.equal(loaded.edl.look.preset, "news");
assert.equal(loaded.editor.template, "caption-news");
assert.equal(loaded.editor.cues.length, 1);
assert.deepEqual(loaded.editor.excluded, ["old"]);
assert.equal(loaded.editor.manualGraphics[0].label, "МИФ");
assert.equal(loaded.editor.cutDeltas["0"].delta, 0.25);
assert.equal(normalizeEditor({ template: "x" }).template, "x");

await assert.rejects(() => readProject3(new Blob(["not a project"])), /не проект/i);
await assert.rejects(() => readProject3(project.slice(0, project.size - 1)), /повреждён/i);
assert.throws(() => createProject3({ edl }, new Blob([])), /нет видео/i);
console.log("OK project3: roundtrip, editor state, media and damage checks");
