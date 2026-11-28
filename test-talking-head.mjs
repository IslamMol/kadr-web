import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { drawTalkingHead } from "./talking-head.js";

const canvas = createCanvas(216, 384);
const ctx = canvas.getContext("2d");
drawTalkingHead(ctx, 216, 384, 1.2);
const data = ctx.getImageData(0, 0, 216, 384).data;
const colors = new Set();
for (let i = 0; i < data.length; i += 4 * 97) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
assert.ok(colors.size > 8, "макет говорящей головы отрисован");
drawTalkingHead(ctx, 216, 384, 2.4);
assert.ok(ctx.getImageData(108, 150, 1, 1).data[3] === 255, "кадр непрозрачный");
console.log("OK talking-head mockup: deterministic canvas drawing");
