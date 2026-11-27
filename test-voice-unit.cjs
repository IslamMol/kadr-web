const assert=require('node:assert/strict');
const {outputToSource,voiceMapKey}=require('./voice-test-bundle.cjs');
const {requestLocalVoice}=require('./tts-test-bundle.cjs');
(async()=>{
  const cuts=[{from:1,to:2},{from:3,to:3.5}];
  for(const [t,want] of [[0,5],[0.5,5.5],[1,7],[1.25,7.25],[2,8.5],[2.5,9],[3.5,10]])
    assert(Math.abs(outputToSource(t,5,10,cuts)-want)<1e-6);
  assert.notEqual(voiceMapKey({id:'a'},0,5,0,[]),voiceMapKey({id:'a'},0,5,.2,[]));
  assert.notEqual(voiceMapKey({id:'a'},0,5,0,[]),voiceMapKey({id:'b'},0,5,0,[]));
  let mode='success', lastWorker;
  globalThis.Worker=class {
    constructor(url){assert(url.startsWith('blob:'));lastWorker=this;}
    postMessage(data){
      assert.deepEqual(data,{text:'Привет',voice:'F1'});
      if(mode==='success') setTimeout(()=>{
        this.onmessage({data:{type:'loading'}});
        this.onmessage({data:{type:'complete',buffer:new Uint8Array([1,2,3]).buffer}});
      },0);
      if(mode==='error') setTimeout(()=>this.onmessage({data:{type:'error',error:'failed'}}),0);
    }
    terminate(){this.terminated=true;}
  };
  await assert.rejects(()=>requestLocalVoice({text:''}),/текст/);
  await assert.rejects(()=>requestLocalVoice({text:'Я'.repeat(601)}),/600/);
  await assert.rejects(()=>requestLocalVoice({text:'Привет',voice:'invalid'}),/голос/);
  let status='';const blob=await requestLocalVoice({text:'Привет',voice:'F1',onProgress:t=>status=t});
  assert.equal(blob.type,'audio/wav');assert.equal(blob.size,3);assert.match(status,/модель/);assert(lastWorker.terminated);
  mode='hang';const aborter=new AbortController(), pending=requestLocalVoice({text:'Привет',voice:'F1',signal:aborter.signal});aborter.abort();
  await assert.rejects(pending,{name:'AbortError'});assert(lastWorker.terminated);
  mode='error';await assert.rejects(()=>requestLocalVoice({text:'Привет',voice:'F1'}),/не удалось/i);assert(lastWorker.terminated);
  console.log('OK voice timeline mapping, input validation, progress, cancellation and errors');
})().catch(e=>{console.error(e);process.exit(1)});
