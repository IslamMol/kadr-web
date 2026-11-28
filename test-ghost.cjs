const assert=require("node:assert/strict");
(async () => {
  const {GHOST_STYLES,GHOST_RECIPES,recipeById,planGhostEdit,buildApprovalSheet,qaGhost,exampleCues}=require("./ghost-bundle.cjs");
  assert.equal(GHOST_STYLES.length,7,"семь стилей ghost-editor");
  assert.equal(GHOST_RECIPES.length,4,"четыре видимых приёма");
  for(const style of GHOST_STYLES){
    assert.ok(style.effect && style.preset && style.scene && style.motion, `${style.id}: полная система`);
    assert.ok(style.accent && style.sample, `${style.id}: есть акцент и пример`);
  }
  for(const recipe of GHOST_RECIPES){
    const style=GHOST_STYLES.find(s=>s.id===recipe.style);
    assert.ok(style,`приём ${recipe.id} ссылается на реальный стиль`);
    assert.equal(recipeById(recipe.id).name,recipe.name);
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
