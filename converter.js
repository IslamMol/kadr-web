import coreSource from './ffmpeg-core.txt';
import workerSource from './converter-worker.txt';

const EXPECTED_SHA256='9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7';
const CORE_CDN='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm';
export const MAX_CONVERSION_BYTES=200*1024*1024;

function abortError(){return new DOMException('Операция отменена.','AbortError');}
function assertActive(signal){if(signal?.aborted)throw abortError();}
async function getBytes(url,signal){
  const response=await fetch(url,{signal,cache:'force-cache'});
  if(!response.ok) throw new Error('Не удалось загрузить конвертер. Проверь интернет и попробуй ещё раз.');
  return response.arrayBuffer();
}
function hex(bytes){return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}

// The site hosts the exact same core in four <25 MiB pieces so Cloudflare Pages
// and GitHub accept each asset. The local HTML falls back to a pinned CDN URL.
async function getCore({signal,onStatus}){
  const pieces=[];
  if(location.protocol==='file:'){
    onStatus?.({stage:'download',text:'Загружаем конвертер (около 31 МБ)…'});
    pieces.push(await getBytes(CORE_CDN,signal));
  }else{
    for(let i=1;i<=4;i++){
      onStatus?.({stage:'download',text:`Загружаем конвертер: часть ${i} из 4 (всего около 31 МБ)…`});
      const url=new URL(`./converter/ffmpeg-core.part${i}`,document.baseURI);
      pieces.push(await getBytes(url,signal));
    }
  }
  assertActive(signal);
  onStatus?.({stage:'verify',text:'Проверяем файлы конвертера…'});
  const data=await new Blob(pieces,{type:'application/wasm'}).arrayBuffer();
  if(!globalThis.crypto?.subtle) throw new Error('Для безопасной загрузки открой приложение по HTTPS или в Chrome на компьютере.');
  if(hex(await crypto.subtle.digest('SHA-256',data))!==EXPECTED_SHA256)
    throw new Error('Файлы конвертера повреждены. Обнови сайт или загрузи архив заново.');
  assertActive(signal);
  return data;
}

export async function convertVideo(file,{signal,onStatus}={}){
  if(!(file instanceof Blob)||file.size<1)throw new Error('Не удалось прочитать выбранный файл.');
  if(file.size>MAX_CONVERSION_BYTES)throw new Error('Для преобразования выбери файл до 200 МБ. Большой ролик можно подготовить в HandBrake на компьютере.');
  if(!window.Worker||!window.WebAssembly)throw new Error('Этот браузер не поддерживает встроенный конвертер. Попробуй Chrome или Edge на компьютере.');
  assertActive(signal);
  let worker,urls=[];
  try{
    const wasm=await getCore({signal,onStatus});
    const workerURL=URL.createObjectURL(new Blob([coreSource,'\n',workerSource],{type:'application/javascript'})); urls.push(workerURL);
    onStatus?.({stage:'prepare',text:'Подготавливаем видео на устройстве…'});
    const bytes=await file.arrayBuffer(); assertActive(signal);
    worker=new Worker(workerURL);
    return await new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error,value)=>{
        if(settled)return; settled=true;
        signal?.removeEventListener('abort',onAbort);
        if(error)reject(error); else resolve(value);
      };
      const onAbort=()=>{worker.terminate();finish(abortError());};
      signal?.addEventListener('abort',onAbort,{once:true});
      if(signal?.aborted){onAbort();return;}
      worker.onerror=()=>finish(new Error('Конвертер не запустился. Попробуй Chrome или Edge на компьютере.'));
      worker.onmessage=({data})=>{
        if(data.type==='progress')onStatus?.({stage:'convert',progress:data.value,text:'Преобразуем видео на устройстве. Это может занять несколько минут…'});
        else if(data.type==='done')finish(null,new Blob([data.bytes],{type:'video/mp4'}));
        else if(data.type==='error')finish(new Error('Не удалось преобразовать этот файл. Возможно, он повреждён или кодек не поддерживается. Попробуй HandBrake на компьютере.'));
      };
      worker.postMessage({bytes,wasm,name:file.name||'video'},[bytes,wasm]);
    });
  }finally{
    worker?.terminate();
    urls.forEach(url=>URL.revokeObjectURL(url));
  }
}
