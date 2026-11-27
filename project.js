// Portable local project container. The video and optional audio/images are
// concatenated without recompressing; no data are uploaded or stored in a DB.
const MAGIC = 'KADRPRJ1';
const HEADER_SIZE = 12;
const MAX_MANIFEST = 2 * 1024 * 1024;
const MAX_ASSETS = 7; // video, voice, music, four images
const roles = new Set(['video', 'voice', 'music', 'image']);
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal:true});

function short(value, fallback, max=240) {
  return typeof value === 'string' && value.length <= max ? value : fallback;
}
function validateAssets(assets) {
  if (!Array.isArray(assets) || assets.length < 1 || assets.length > MAX_ASSETS)
    throw new Error('В проекте неверное количество файлов.');
  const counts = {video:0, voice:0, music:0, image:0}, imageIds=new Set();
  for (const a of assets) {
    if (!a || !roles.has(a.role) || !Number.isSafeInteger(a.size) || a.size <= 0)
      throw new Error('Файл проекта повреждён: не найдены медиа.');
    counts[a.role]++;
    if (a.role === 'image') {
      if (typeof a.id !== 'string' || !a.id || a.id.length > 100 || imageIds.has(a.id))
        throw new Error('Файл проекта повреждён: неверные изображения.');
      imageIds.add(a.id);
    }
    if (a.role === 'voice' && a.size > 40*1024*1024) throw new Error('Аудиофайл озвучки слишком большой.');
    if (a.role === 'music' && a.size > 40*1024*1024) throw new Error('Музыкальный файл слишком большой.');
  }
  if (counts.video !== 1 || counts.voice > 1 || counts.music > 1 || counts.image > 4)
    throw new Error('Файл проекта повреждён: неверные медиа.');
}
function validateSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings))
    throw new Error('В проекте нет настроек.');
  if (settings.graphics !== undefined && (!Array.isArray(settings.graphics) || settings.graphics.length > 12))
    throw new Error('В проекте слишком много графики.');
  if (settings.silences !== undefined && (!Array.isArray(settings.silences) || settings.silences.length > 10000))
    throw new Error('В проекте неверный список пауз.');
  if (settings.srt !== null && settings.srt !== undefined &&
      (!settings.srt || typeof settings.srt !== 'object' || !Array.isArray(settings.srt.cues) || settings.srt.cues.length > 5000))
    throw new Error('В проекте неверные субтитры.');
}

export function createProjectBlob(settings, files) {
  validateSettings(settings);
  if (!Array.isArray(files)) throw new Error('Не удалось подготовить файлы проекта.');
  const assets = files.map((item) => {
    if (!(item?.blob instanceof Blob)) throw new Error('Не удалось прочитать медиа проекта.');
    return {role:item.role, id:short(item.id,'',100), name:short(item.name,'Файл'),
      type:short(item.blob.type,'',120), size:item.blob.size};
  });
  validateAssets(assets);
  const json = encoder.encode(JSON.stringify({format:'kadr-project', version:1, settings, assets}));
  if (json.length > MAX_MANIFEST) throw new Error('Слишком большой список настроек проекта.');
  const header = new Uint8Array(HEADER_SIZE);
  header.set(encoder.encode(MAGIC));
  new DataView(header.buffer).setUint32(8,json.length,true);
  return new Blob([header,json,...files.map(item=>item.blob)], {type:'application/octet-stream'});
}

export async function readProjectFile(file) {
  if (!(file instanceof Blob) || file.size < HEADER_SIZE) throw new Error('Это не файл проекта «Кадр».');
  const header = new Uint8Array(await file.slice(0,HEADER_SIZE).arrayBuffer());
  if (String.fromCharCode(...header.slice(0,8)) !== MAGIC) throw new Error('Это не файл проекта «Кадр» (.kadr).');
  const n = new DataView(header.buffer,header.byteOffset,header.byteLength).getUint32(8,true);
  if (n < 2 || n > MAX_MANIFEST || HEADER_SIZE+n > file.size) throw new Error('Файл проекта повреждён или не полностью скачан.');
  let m;
  try { m=JSON.parse(decoder.decode(await file.slice(HEADER_SIZE,HEADER_SIZE+n).arrayBuffer())); }
  catch { throw new Error('Не удалось прочитать настройки проекта.'); }
  if (!m || m.format !== 'kadr-project' || m.version !== 1)
    throw new Error('Версия проекта не поддерживается.');
  validateSettings(m.settings); validateAssets(m.assets);
  let offset=HEADER_SIZE+n;
  const assets=[];
  for (const a of m.assets) {
    if (offset + a.size > file.size) throw new Error('Файл проекта повреждён или не полностью скачан.');
    const type=short(a.type,'',120);
    assets.push({role:a.role,id:short(a.id,'',100),name:short(a.name,'Файл'),type,
      blob:file.slice(offset,offset+a.size,type)});
    offset += a.size;
  }
  if (offset !== file.size) throw new Error('Файл проекта повреждён: лишние данные.');
  return {settings:m.settings, assets};
}

// A project is an untrusted local file. Keep the restored values within the
// editor's own limits, and never put unchecked objects into React controls.
export function normalizeProjectSettings(raw, duration) {
  validateSettings(raw);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Не удалось определить длительность видео в проекте.');
  const number = (v, fallback, lo, hi) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo,Math.min(hi,n)) : fallback;
  };
  const text = (v, max) => typeof v === 'string' ? v.slice(0,max) : '';
  const pick = (v, allowed, fallback) => allowed.includes(v) ? v : fallback;
  const from = number(raw.start,0,0,Math.max(0,duration-Math.min(.2,duration)));
  const to = number(raw.end,duration,Math.min(duration,from+.05),duration);
  const wordList = list => Array.isArray(list) ? list.slice(0,200).flatMap(w => {
    if (!w || typeof w !== 'object') return [];
    const a=number(w.start,NaN,0,duration), b=number(w.end,NaN,0,duration);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return [];
    return [{text:text(w.text,100),start:a,end:b}];
  }) : undefined;
  let srt = null;
  if (raw.srt) {
    const cues = raw.srt.cues.flatMap((c,i) => {
      if (!c || typeof c !== 'object') return [];
      const a=number(c.start,NaN,0,duration), b=number(c.end,NaN,0,duration);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return [];
      const item={id:text(c.id,100)||`cue-${i}`,start:a,end:b,text:text(c.text,300)};
      const words=wordList(c.words), template=wordList(c.wordTemplate);
      if (words) item.words=words;
      if (template) item.wordTemplate=template;
      return [item];
    }).sort((a,b)=>a.start-b.start);
    srt={name:text(raw.srt.name,240)||'Субтитры',cues,
      origin:pick(raw.srt.origin,['srt','auto','auto-voice'],'srt'),
      voiceMapKey:typeof raw.srt.voiceMapKey === 'string' ? text(raw.srt.voiceMapKey,5000) : null};
  }
  const silences=(raw.silences||[]).flatMap((c,i)=>{
    if (!c || typeof c !== 'object') return [];
    const a=number(c.from,NaN,0,duration), b=number(c.to,NaN,0,duration);
    return Number.isFinite(a) && Number.isFinite(b) && b>a ?
      [{id:text(c.id,100)||`pause-${i}`,from:a,to:b,enabled:!!c.enabled,guarded:!!c.guarded}] : [];
  });
  const graphics=(raw.graphics||[]).flatMap((g,i)=>{
    if (!g || typeof g !== 'object' || !['quote','icon','diagram','number','image'].includes(g.kind)) return [];
    return [{id:text(g.id,100)||`graphic-${i}`,kind:g.kind,
      icon:pick(g.icon,['spark','chart','check','idea'],'spark'),label:text(g.label,60),value:text(g.value,60),
      layout:pick(g.layout,['card','scene'],'card'),trigger:pick(g.trigger,['time','keyword'],'time'),
      at:number(g.at,0,0,duration),duration:number(g.duration,2.8,.4,12),
      keyword:text(g.keyword,40),assetId:text(g.assetId,100),
      variant:pick(g.variant,['overlay','orbit','framed'],'orbit'),auto:!!g.auto}];
  });
  return {
    start:from,end:to,resolution:pick(raw.resolution,[720,1080],1080),
    mode:pick(raw.mode,['crop','fit'],'crop'),
    frameZoom:number(raw.frameZoom,1,1,2),frameX:number(raw.frameX,50,0,100),frameY:number(raw.frameY,50,0,100),
    style:pick(raw.style,['none','soft','dynamic'],'dynamic'),
    preset:pick(raw.preset,['premium','tech','red','light','ghost-clean','ghost-cinematic','ghost-editorial','ghost-kinetic','ghost-launch','ghost-meme','ghost-pop'],'premium'),
    ghostStyle:pick(raw.ghostStyle,['clean','cinematic','editorial','kinetic','launch','meme','pop'],'clean'),
    textEffect:pick(raw.textEffect,['clean','serif','editorial','pop','type','outline','upper'],'clean'),
    captionPosition:pick(raw.captionPosition,['high','normal','low'],'normal'),
    headline:text(raw.headline,60),autoHeadline:text(raw.autoHeadline,60),manual:text(raw.manual,1200),
    srt,graphics,silences,
    language:pick(raw.language,['russian','english','auto'],'russian'),
    asrSource:pick(raw.asrSource,['source','voice'],'source'),
    voiceText:text(raw.voiceText,600),voicePreset:pick(raw.voicePreset,['F1','M1'],'F1'),
    voiceOffset:number(raw.voiceOffset,0,0,duration),
    voiceVolume:number(raw.voiceVolume,90,0,100),
    originalVolume:number(raw.originalVolume,35,0,100),
    musicVolume:number(raw.musicVolume,20,0,100),
    musicBpm:raw.musicBpm !== '' && Number.isFinite(Number(raw.musicBpm)) &&
      Number(raw.musicBpm) >= 40 && Number(raw.musicBpm) <= 240 ? String(Number(raw.musicBpm)) : '',
    firstBeat:number(raw.firstBeat,0,0,Math.min(60,duration)),
  };
}
