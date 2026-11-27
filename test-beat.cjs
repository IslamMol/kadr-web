const assert=require('node:assert/strict');const {nearestBeatOutput}=require('./beat-test-bundle.cjs');
assert(Math.abs(nearestBeatOutput(1.17,5,120,.2)-1.2)<1e-9);
assert(Math.abs(nearestBeatOutput(0,5,120,.2)-.2)<1e-9);
assert(Math.abs(nearestBeatOutput(4.99,5,120,0)-4.5)<1e-9);
assert.throws(()=>nearestBeatOutput(1,5,0,0),/темп/i);
assert.throws(()=>nearestBeatOutput(1,5,120,5),/удар/i);
console.log('OK manual beat snapping and boundary validation');
