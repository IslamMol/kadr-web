import assert from "node:assert/strict";
import { findQuietRanges, removeSilences } from "./silence.js";

const sr = 100, length = 300;
const data = new Float32Array(length);
for (let i = 0; i < length; i++) data[i] = (i >= 100 && i < 200) ? 0 : 0.5;
const buffer = { sampleRate: sr, length, numberOfChannels: 1, duration: 3, getChannelData: () => data };
const result = findQuietRanges(buffer);
assert.equal(result.silent, false);
assert.equal(result.ranges.length, 1);
assert.ok(result.ranges[0].from >= 1.1 && result.ranges[0].from <= 1.3);
assert.ok(result.ranges[0].to >= 1.7 && result.ranges[0].to <= 1.9);
assert.equal(findQuietRanges({ ...buffer, getChannelData: () => new Float32Array(length) }).silent, true);

const pieces = [{ from: 0, to: 3 }];
const cut = removeSilences(pieces, result.ranges);
assert.equal(cut.length, 2);
assert.ok(cut[0].to <= 1.3 && cut[1].from >= 1.7);
console.log("OK silence: conservative detection and piece splitting");
