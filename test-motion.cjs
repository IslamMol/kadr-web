const assert=require('node:assert/strict');const {springProgress,compositionState}=require('./motion-test-bundle.cjs');
assert.equal(springProgress(0),0);assert(springProgress(.3)>1);assert.equal(springProgress(1),1);
assert.equal(springProgress(.2),springProgress(.2));
assert.equal(compositionState('premium',{style:'none'}).motion,false);
assert.equal(compositionState('premium',{style:'dynamic'}).motionStyle,'dynamic');
console.log('OK deterministic spring motion and reduced-motion state');
