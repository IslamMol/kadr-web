const assert=require('node:assert/strict');
const {createProjectBlob,readProjectFile}=require('./project-test-bundle.cjs');
(async()=>{
  const settings={start:1,end:3,graphics:[{id:'g',kind:'quote',label:'Тест'}],srt:{cues:[{text:'Привет',start:0,end:1}]},silences:[]};
  const files=[{role:'video',name:'фильм.mp4',blob:new Blob(['VIDEO'],{type:'video/mp4'})},
    {role:'voice',id:'v1',name:'голос.wav',blob:new Blob(['VOICE'],{type:'audio/wav'})},
    {role:'music',id:'m1',name:'music.mp3',blob:new Blob(['MUSIC'],{type:'audio/mpeg'})},
    {role:'image',id:'pic1',name:'картинка.png',blob:new Blob(['IMAGE'],{type:'image/png'})}];
  const blob=createProjectBlob(settings,files), loaded=await readProjectFile(blob);
  assert.deepEqual(loaded.settings,settings);assert.equal(loaded.assets.length,4);
  for(let i=0;i<files.length;i++){
    assert.equal(await loaded.assets[i].blob.text(),await files[i].blob.text());
    assert.equal(loaded.assets[i].name,files[i].name);assert.equal(loaded.assets[i].blob.type,files[i].blob.type);
  }
  await assert.rejects(()=>readProjectFile(new Blob(['not kadr'])));
  await assert.rejects(()=>readProjectFile(blob.slice(0,blob.size-1)),/повреждён/);
  await assert.rejects(()=>readProjectFile(new Blob([blob,'x'])),/повреждён/);
  assert.throws(()=>createProjectBlob(settings,[...files,files[0]]),/медиа/);
  assert.throws(()=>createProjectBlob({...settings,graphics:new Array(13)},files),/графики/);
  assert.throws(()=>createProjectBlob(settings,[files[0],files[3],files[3]]),/изображения/);
  console.log('OK project roundtrip, embedded media and damaged-file rejection');
})().catch(e=>{console.error(e);process.exit(1)});
