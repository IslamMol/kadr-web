import assert from "node:assert/strict";
import { normalizeEdl } from "./edl.js";
import { buildHyperComposition, hyperProjectFiles } from "./hyper-adapter.js";

const edl = normalizeEdl({
  output: { width: 1080, height: 1920, fps: 30 },
  clips: [{ src: "video", in: 1, out: 3 }, { src: "video", in: 5, out: 6.5 }],
  captions: [{
    start: 0.2, end: 1.6, text: "Привет мир", template: "hype",
    words: [{ text: "Привет", start: 0.2, end: 0.9 }, { text: "мир", start: 0.9, end: 1.6 }],
  }],
  graphics: [{ type: "stats", at: 1.7, duration: 1.2, label: "39%", steps: ["идей", "в голову"] }],
  look: { preset: "news", accent: "#ffd23f" },
});
const html = buildHyperComposition(edl);
assert.match(html, /data-composition-id="kadr"/);
assert.match(html, /data-width="1080"/);
assert.match(html, /data-height="1920"/);
assert.equal((html.match(/class="clip[ "]/g) || []).length, 4, "2 видео + 1 субтитр + 1 сцена");
assert.match(html, /data-media-start="1\.000"/, "trim исходника попал в атрибут");
assert.match(html, /id="kadr-word-0-1"/, "слова субтитров есть в разметке");
assert.match(html, /window\.__timelines\["kadr"\] = tl/);
assert.match(html, /id="kadr-edl" type="application\/json"/);
assert.ok(!/Math\.random|Date\.now/.test(html), "рендер детерминирован");
assert.match(html, /font-family:Arial/, "шрифт не требует @font-face");
assert.ok((html.match(/immediateRender: false/g) || []).length >= 2, "нет нестабильных fromTo");
const files = hyperProjectFiles(edl);
assert.equal(files.length, 1);
assert.equal(files[0].path, "index.html");
assert.equal(files[0].content, html);
console.log("OK hyper adapter: EDL to seekable HTML composition");
