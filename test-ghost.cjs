const assert=require("node:assert/strict");
(async () => {
  const {GHOST_STYLES,planGhostEdit,buildApprovalSheet,qaGhost,exampleCues}=require("./ghost-bundle.cjs");
  const {compositionState}=require("./motion-test-bundle.cjs");
  assert.equal(GHOST_STYLES.length,7,"семь стилей ghost-editor");
  for(const style of GHOST_STYLES){
    const state=compositionState(`ghost-${style.id}`,{style:"dynamic",textEffect:style.effect,outputT:0});
    assert.equal(state.textEffect,style.effect,`эффект ${style.id} дошёл до движка`);
    assert.ok(state.rect.w>0&&state.rect.h>0,`геометрия ${style.id}`);
  }
  const cues=exampleCues();
  const plan=planGhostEdit(cues,{start:0,end:6});
  assert.equal(plan.pieces.length,2,"два предложения");
  assert.ok(plan.cuts.length>=1,"склейки между предложениями");
  assert.ok(plan.runs.length>=1,"группы в одном дыхании");
  assert.ok(plan.target.chosen>0,"хронометраж посчитан");
  const sheet=buildApprovalSheet({cuts:plan.cuts,graphics:[{at:2.7,label:"Для больших идей",kind:"quote",duration:2.8}],cues,start:0});
  assert.ok(sheet.some(p=>p.kind==="cut"),"точка склейки");
  assert.ok(sheet.some(p=>p.kind==="graphic"),"точка сцены");
  assert.ok(sheet.every((p,i,a)=>!i||a[i-1].time<=p.time),"лист по времени");
  const warnings=qaGhost({cuts:plan.cuts,graphics:[{at:2.7,label:"x",kind:"quote",layout:"scene",duration:3}],cues,start:0,end:6,faceY:80,captionPosition:"normal",approved:false});
  assert.ok(warnings.some(w=>w.code==="approval"),"согласие обязательно");
  assert.ok(warnings.some(w=>w.code==="face-cover"),"защита лица");
  console.log("OK ghost:",GHOST_STYLES.length,"styles,",sheet.length,"checkpoints");
})();
