import { planTakes, takesToSilences } from "./takes.js";
import assert from "node:assert";

const cues = [
  {
    start: 0,
    end: 5,
    text: "Привет. Привет. Как дела?",
    words: [
      { text: "Привет.", start: 0.2, end: 0.7 },
      { text: "Привет.", start: 1.5, end: 2.0 },
      { text: "Как", start: 2.5, end: 2.8 },
      { text: "дела?", start: 2.9, end: 3.4 },
    ],
  },
];

const plan = planTakes(cues, { start: 0, end: 5 });
assert.equal(plan.pieces.length, 2, "два предложения");
assert.equal(plan.rejected.length, 1, "один дубль отклонён");
assert.equal(plan.pieces[0].start, 1.5, "выбран поздний дубль");
assert.equal(plan.pieces[1].text, "Как дела?", "второе предложение на месте");
assert.ok(plan.cuts.some((c) => c.from <= 0.2 && c.to >= 0.7), "ранний дубль вырезан");
assert.equal(takesToSilences(plan).length, plan.cuts.length, "вырезы в формате пауз");
console.log("OK takes:", JSON.stringify(plan.pieces));
