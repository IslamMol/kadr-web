const assert = require("node:assert/strict");
const {reviewEdit} = require("./quality-test-bundle.cjs");
const test = (label, fn) => { fn(); console.log("OK", label); };
const has = (r, code) => r.warnings.some(w => w.code === code);

test("empty input is safe and does not invent captions", () => {
  const r = reviewEdit({start:0, end:10});
  assert.equal(r.timedCuesInRange, 0);
  assert.deepEqual(r.events, []);
  assert.deepEqual(r.warnings, []);
});
test("captions, trim and enabled cuts are checked", () => {
  const r = reviewEdit({start:1, end:6, cues:[
    {start:.5,end:2,text:"Первая фраза"},
    {start:1.5,end:2.2,text:"Вторая фраза"},
    {start:3,end:3.2,text:"Очень короткий субтитр"},
    {start:4,end:5,text:"Эта фраза слишком длинная для одной секунды"},
    {start:5.5,end:6.7,text:"Последняя фраза"}
  ], cuts:[{from:1.7,to:1.9}]});
  for(const code of ["trim-start","trim-end","caption-overlap","cut-caption","short-caption","fast-caption"])
    assert(has(r, code), code);
  assert.equal(r.timedCuesInRange, 5);
  assert(r.warnings.every(w => w.time >= 1 && w.time <= 6));
});
test("touching intervals are not treated as overlaps", () => {
  const r = reviewEdit({start:0,end:10,cues:[
    {start:0,end:2,text:"Первая"},
    {start:2,end:4,text:"Вторая"}
  ],cuts:[{from:4,to:5}]});
  assert(!has(r,"caption-overlap"));
  assert(!has(r,"cut-caption"));
});
test("overlapping graphics warn and plan seeks past a cut", () => {
  const r = reviewEdit({start:1,end:10,headline:"Тест",
    cuts:[{from:2,to:2.5}],
    graphics:[
      {id:"a",kind:"quote",label:"Раз",duration:3,times:[2]},
      {id:"b",kind:"diagram",label:"Два",duration:2,times:[3]},
    ]});
  assert(has(r,"graphic-overlap"));
  assert(has(r,"graphic-cut"));
  assert.equal(r.events[0].type, "Заголовок");
  assert.equal(r.events.find(e=>e.title==="Раз").seek, 2.5);
});
test("graphics removed by cuts and missing keyword or image are reported", () => {
  const r = reviewEdit({start:0,end:10,cuts:[{from:1,to:5}],graphics:[
    {id:"a",kind:"quote",label:"Вырезано",duration:1,times:[2]},
    {id:"b",kind:"quote",label:"Тоже вырезано",duration:1,times:[2]},
    {id:"c",kind:"quote",label:"Нет слова",trigger:"keyword",keyword:"не найдено",times:[]},
    {id:"d",kind:"image",at:6,hasImage:false,times:[6]}
  ]});
  assert(has(r,"graphic-removed"));
  assert(has(r,"keyword-not-found"));
  assert(has(r,"missing-image"));
  assert(!has(r,"graphic-overlap"),"overlap entirely in a removed cut should not warn");
  assert(r.events.find(e=>e.title==="Вырезано").removed);
});
test("overlapping cuts are merged before checking visible duration", () => {
  const r = reviewEdit({start:0,end:10,cuts:[{from:1,to:2},{from:1.5,to:3}],graphics:[
    {id:"a",kind:"quote",label:"Частично",duration:3,times:[1]}
  ]});
  const e=r.events[0];
  assert.equal(r.selectedCuts,1);
  assert.equal(e.seek,3);
  assert(!e.removed);
});