import helperSource from './supertonic-helper.txt';

// The example inference code is adapted from Supertonic's MIT web example.
// The 3.x model is loaded separately under OpenRAIL-M, not bundled here.
export const LOCAL_VOICES = [
  {id:'F1', label:'Женский'},
  {id:'M1', label:'Мужской'},
];
const VALID_VOICES = new Set(LOCAL_VOICES.map(v => v.id));
const WORKER_CODE = helperSource + `
const SUPER_BASE = 'https://huggingface.co/supertone-oss-archive/supertonic-3/resolve/aafc6e32416a594460b32413efc49d7fe4ce6d46';
self.onmessage = async ({data}) => {
  try {
    self.postMessage({type:'loading'});
    ort = await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.wasm.min.mjs');
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
    const {textToSpeech} = await loadTextToSpeech(SUPER_BASE + '/onnx', {executionProviders:['wasm']},
      (name, i, n) => self.postMessage({type:'model', i, n}));
    const style = await loadVoiceStyle([SUPER_BASE + '/voice_styles/' + data.voice + '.json']);
    self.postMessage({type:'synthesizing'});
    const {wav,duration} = await textToSpeech.call(data.text,'ru',style,5,1.05,.3,
      (step,n) => self.postMessage({type:'step',step,n}));
    if (!duration || !Number.isFinite(duration[0]) || duration[0] < .05 || duration[0] > 180)
      throw new Error('duration');
    const pcm = wav.slice(0, Math.floor(textToSpeech.sampleRate * duration[0]));
    const out = writeWavFile(pcm, textToSpeech.sampleRate);
    self.postMessage({type:'complete',buffer:out},[out]);
  } catch (error) {
    self.postMessage({type:'error',error:String(error?.message || error)});
  }
};`;

/** Generate narration locally in an isolated worker; only model/code GETs use the network. */
export async function requestLocalVoice({text, voice='F1', signal, onProgress=()=>{}}) {
  const script = String(text || '').trim();
  if (!script || script.length > 600) throw new Error('Введи текст озвучки — от 1 до 600 символов.');
  if (!VALID_VOICES.has(voice)) throw new Error('Выбери доступный голос.');
  if (!globalThis.Worker) throw new Error('Для озвучки открой Chrome или Edge на компьютере.');
  if (signal?.aborted) throw new DOMException('Отменено', 'AbortError');
  const url = URL.createObjectURL(new Blob([WORKER_CODE], {type:'text/javascript'}));
  let worker;
  try { worker = new Worker(url); }
  catch (error) { URL.revokeObjectURL(url); throw new Error('Не удалось запустить озвучку. Открой Chrome или Edge на компьютере.'); }
  return await new Promise((resolve,reject) => {
    let finished=false;
    const cleanup = () => {worker.terminate(); URL.revokeObjectURL(url); signal?.removeEventListener('abort',abort);};
    const finish = (error, result) => {
      if (finished) return;
      finished=true; cleanup();
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(new DOMException('Отменено', 'AbortError'));
    signal?.addEventListener('abort',abort,{once:true});
    if (signal?.aborted) return abort();
    worker.onerror = () => finish(new Error('Не удалось запустить озвучку. Проверь интернет и память устройства.'));
    worker.onmessage = ({data}) => {
      if (data.type === 'loading') onProgress('Загружаем голосовую модель и библиотеки — около 400 МБ.');
      else if (data.type === 'model') onProgress(`Загружаем голосовую модель: файл ${data.i} из ${data.n}.`);
      else if (data.type === 'synthesizing') onProgress('Создаём озвучку на устройстве. Это может занять несколько минут.');
      else if (data.type === 'step') onProgress(`Создаём озвучку на устройстве: шаг ${data.step} из ${data.n}.`);
      else if (data.type === 'complete') finish(null,new Blob([data.buffer],{type:'audio/wav'}));
      else if (data.type === 'error') finish(new Error(data.error === 'duration'
        ? 'Озвучка получилась слишком длинной. Сократи текст и попробуй снова.'
        : 'Не удалось загрузить модель или создать звук. Проверь интернет и память устройства; можно загрузить готовый аудиофайл.'));
    };
    worker.postMessage({text:script,voice});
  });
}
