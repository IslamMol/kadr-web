// Speech is decoded and recognised on the user's device. Only model/code files
// are fetched via GET after the user explicitly starts recognition.
const WORKER_SOURCE = `
let recognizer;
self.onmessage = async ({data}) => {
  try {
    self.postMessage({type:'loading'});
    const {pipeline,env} = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2');
    env.allowLocalModels = false;
    env.backends.onnx.wasm.numThreads = 1;
    const fast = data.model === 'tiny';
    const model = fast ? 'onnx-community/whisper-tiny_timestamped' : 'onnx-community/whisper-small_timestamped';
    const revision = fast ? 'main' : '65caa70f294b46e1c33ff820aae6b16d048ab818';
    if (!recognizer || !recognizer.modelId?.includes(model)) recognizer = await pipeline('automatic-speech-recognition', model, {
      revision, dtype:'q8', device:'wasm', progress_callback: progress => {
        if(progress.status === 'done') self.postMessage({type:'file', file:progress.file});
      }
    });
    self.postMessage({type:'recognizing'});
    const options = {return_timestamps:'word', chunk_length_s:fast?20:30, stride_length_s:fast?4:5, task:'transcribe'};
    if(data.language !== 'auto') options.language = data.language;
    const result = await recognizer(data.audio, options);
    self.postMessage({type:'complete', result});
  } catch(error) {
    self.postMessage({type:'error', message: String(error && error.message || error)});
  }
};`;
export function createASRWorker(){
  const url=URL.createObjectURL(new Blob([WORKER_SOURCE],{type:'text/javascript'}));
  return {worker:new Worker(url),revoke:()=>URL.revokeObjectURL(url)};
}
const GLUE=new Set(['в','во','на','и','а','но','не','ни','же','то','с','со','к','ко','о','об','у','за','по','из','от','до','для','что','как','это','я','ты','мы','вы','он','она']);
const bare=s=>s.toLocaleLowerCase('ru').replace(/[^а-яёa-z0-9-]/g,'');
const id=()=>Math.random().toString(36).slice(2,11);
/** Group timed words into concise 1–2-line captions; adapted from EasyReels' MIT-licensed Subs.tsx. */
export function wordsToCues(result,duration){
  const chunks=Array.isArray(result?.chunks)?result.chunks:[];
  const words=[]; let prev=0, estimates=0;
  for (const c of chunks){
    const parts=String(c.text||'').trim().split(/\s+/).filter(Boolean);
    if(!parts.length)continue;
    let a=Number(c.timestamp?.[0]), b=Number(c.timestamp?.[1]);
    const invalidStart=c.timestamp?.[0]===null||!Number.isFinite(a);
    const invalidEnd=c.timestamp?.[1]===null||!Number.isFinite(b)||b<=a;
    if(invalidStart||invalidEnd){estimates++;a=invalidStart?prev:a;b=invalidEnd?a+parts.length*.22:b;}
    a=Math.max(prev,Math.min(duration,Math.max(0,a)));
    b=Math.min(duration,Math.max(a+.04,b));
    if(a>=duration||b<=a)continue;
    for(let j=0;j<parts.length;j++)words.push({text:parts[j],start:a+(b-a)*j/parts.length,end:a+(b-a)*(j+1)/parts.length});
    prev=a;
  }
  if(!words.length)throw new Error('Речь не распознана или не удалось получить таймкоды. Проверь звук либо загрузи SRT.');
  const groups=[]; let cur=[];
  for(const w of words){
    const len=cur.map(x=>x.text).join(' ').length + (cur.length?1:0) + w.text.length;
    const gap=cur.length?w.start-cur[cur.length-1].end:0;
    const sentenceEnd=cur.length?/[.!?…]$/.test(cur[cur.length-1].text):false;
    if(cur.length&&(len>24||gap>.7||sentenceEnd)){
      const last=cur[cur.length-1];
      if(!sentenceEnd&&gap<=.7&&cur.length>1&&GLUE.has(bare(last.text))){cur.pop();groups.push(cur);cur=[last];}
      else {groups.push(cur);cur=[];}
    }
    cur.push(w);
  }
  if(cur.length)groups.push(cur);
  const cues=groups.filter(g=>g.length).map((g,i,all)=>{
    const start=g[0].start, last=g[g.length-1];
    const next=all[i+1]?.[0].start??duration;
    const end=Math.min(duration, Math.max(start+.04, Math.min(last.end+.16, next)));
    return {id:id(),start,end,text:g.map(w=>w.text).join(' '),words:g.map(w=>({...w}))};
  });
  return {cues,estimates};
}
function stamp(t){
  let ms=Math.max(0,Math.round(t*1000));const h=Math.floor(ms/3600000);ms-=h*3600000;
  const m=Math.floor(ms/60000);ms-=m*60000;const s=Math.floor(ms/1000);ms-=s*1000;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
}
export function formatSrt(cues){return cues.map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n')}
/** CSS-equivalent object-position for a crop, factoring in user zoom. */
export function frameGeometry(sw,sh,mode,zoom,x,y,target=9/16){
  if(!sw||!sh){sw=720;sh=1280}
  const ar=sw/sh;
  let w,h;
  if(mode==='crop'){
    if(ar>target){h=zoom;w=zoom*ar/target}else{w=zoom;h=zoom*target/ar}
  }else{
    if(ar>target){w=1;h=target/ar}else{h=1;w=ar/target}
    x=y=50;
  }
  return {w,h,left:(1-w)*x/100,top:(1-h)*y/100};
}
export function cropRectangle(sw,sh,zoom,x,y){
  const ratio=9/16;
  let h=Math.min(sh,sw/ratio)/zoom,w=h*ratio;
  w=Math.max(1,Math.min(sw,Math.round(w)));h=Math.max(1,Math.min(sh,Math.round(h)));
  return {left:Math.max(0,Math.min(sw-w,Math.round((sw-w)*x/100))),top:Math.max(0,Math.min(sh-h,Math.round((sh-h)*y/100))),width:w,height:h};
}
