import assert from "node:assert/strict";
import { LOOKS, CAPTION_TEMPLATES, GRAPHIC_TYPES, MOTION_TYPES, normalizeEdl } from "./edl.js";
import { KADR_TEMPLATES, KADR_EXAMPLES, templateById, planBeats } from "./templates.js";

assert.equal(KADR_TEMPLATES.length, 26, "26 шаблонов из ghost-editor, EasyReels, herk, animate и др.");
for (const t of KADR_TEMPLATES) {
  assert.ok(LOOKS.includes(t.look), `${t.id}: look ${t.look} реален`);
  assert.ok(CAPTION_TEMPLATES.includes(t.caption), `${t.id}: caption ${t.caption} реален`);
  assert.ok(MOTION_TYPES.includes(t.motion), `${t.id}: motion ${t.motion} реален`);
  assert.ok(t.maxBeats >= 1 && t.maxBeats <= 6);
  assert.equal(templateById(t.id).name, t.name);
}

for (const ex of KADR_EXAMPLES) {
  const t = templateById(ex.template);
  assert.ok(t, `${ex.id} ссылается на шаблон`);
  const cues = ex.cues.map(c => ({ ...c, template: t.caption }));
  const beats = planBeats(cues, ex.template);
  assert.ok(beats.length >= 1 && beats.length <= t.maxBeats, `${ex.id}: число сцен`);
  assert.deepEqual(beats, planBeats(cues, ex.template), "раскадровка детерминирована");
  for (const b of beats) {
    assert.ok(GRAPHIC_TYPES.includes(b.type), `${b.type} — реальный тип графики`);
    const cue = cues.find(c => b.at >= c.start && b.at < c.end);
    assert.ok(cue, "сцена стоит внутри фразы");
    assert.equal(b.template, t.caption);
  }
  // Шаблон должен собираться в валидный EDL.
  const edl = normalizeEdl({
    output: { width: 1080, height: 1920, fps: 30 },
    clips: [{ src: "video", in: 0, out: 3 }], captions: cues, graphics: beats,
    look: { preset: t.look, accent: t.accent },
  });
  assert.equal(edl.captions.length, cues.length);
  assert.equal(edl.graphics.length, beats.length);
}
console.log("OK templates:", KADR_TEMPLATES.length, "styles,", KADR_EXAMPLES.length, "examples");
