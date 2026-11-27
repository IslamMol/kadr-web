import {
  Input, ALL_FORMATS, BlobSource, Output, BufferTarget, Mp4OutputFormat,
  EncodedPacketSink, EncodedVideoPacketSource, AudioBufferSource,
} from 'mediabunny';

/** Validate and decode an imported or generated voice without saving it anywhere. */
export async function decodeVoice(blob, {kind='озвучки'}={}) {
  if (!blob || blob.size > 40*1024*1024) throw new Error('Выбери аудиофайл до 40 МБ.');
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('Этот браузер не поддерживает работу со звуком. Открой Chrome или Edge на компьютере.');
  const ctx = new AudioCtx();
  try {
    let buffer;
    try { buffer = await ctx.decodeAudioData(await blob.arrayBuffer()); }
    catch { throw new Error('Не удалось прочитать звук. Попробуй файл WAV, MP3 или M4A.'); }
    if (!Number.isFinite(buffer.duration) || buffer.duration < .05 || buffer.duration > 180)
      throw new Error(`Длительность ${kind} должна быть от 0,05 секунды до 3 минут.`);
    return buffer;
  } finally { try { await ctx.close(); } catch {} }
}

/** Map a moment in the edited timeline back to the original video timeline. */
export function outputToSource(t, start, end, cuts) {
  let local = Math.max(0,Number(t)||0);
  for (const c of cuts || []) {
    if (local + 1e-7 >= c.from) local += Math.max(0,c.to-c.from);
    else break;
  }
  return Math.max(start,Math.min(end,start+local));
}

export function voiceMapKey(voice, start, end, offset, cuts) {
  return JSON.stringify({id:voice?.id||null,start,end,offset,cuts:(cuts||[]).map(x=>[x.from,x.to])});
}

/** Mix audio on the edited timeline. Voice and music never move with source cuts. */
export async function makeVoiceMix({sourceBlob, hasOriginal, voiceBuffer, musicBuffer=null,
  start, end, cuts, outputDuration, voiceOffset=0, originalVolume=100, voiceVolume=90, musicVolume=20}) {
  if (!window.OfflineAudioContext) throw new Error('Для сведения звука открой Chrome или Edge на компьютере.');
  if (!voiceBuffer && !musicBuffer) throw new Error('Сначала добавь озвучку или музыку.');
  if (outputDuration > 180 || sourceBlob.size > 200*1024*1024)
    throw new Error('Экспорт с дополнительным звуком ограничен видео до 3 минут и 200 МБ.');
  if (voiceBuffer && voiceOffset >= outputDuration) throw new Error('Начало озвучки находится за концом видео. Измени время начала.');
  const sr=48000, offline = new OfflineAudioContext(2, Math.max(1,Math.ceil(outputDuration*sr)), sr);
  let original = null, context = null;
  if (hasOriginal && originalVolume > 0) {
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    context = new AudioCtx();
    try {
      try { original = await context.decodeAudioData(await sourceBlob.arrayBuffer()); }
      catch { throw new Error('Не удалось прочитать исходный звук для смешивания. Попробуй MP4 с AAC или поставь громкость исходника на 0%.'); }
    } finally { try { await context.close(); } catch {} }
  }
  if (original) {
    const gain = offline.createGain(); gain.gain.value=originalVolume/100; gain.connect(offline.destination);
    let cursor=0, outputAt=0;
    const add=(from,to)=>{
      const length=Math.max(0,to-from);
      const actual=Math.min(length,Math.max(0,original.duration-(start+from)));
      if(actual>0){const node=offline.createBufferSource();node.buffer=original;node.connect(gain);node.start(outputAt,start+from,actual);}
      outputAt += length;
    };
    for(const c of cuts){if(c.from>cursor)add(cursor,c.from);cursor=Math.max(cursor,c.to);}
    add(cursor,Math.max(cursor,end-start));
  }
  if (voiceBuffer) {
    const gain=offline.createGain(); gain.gain.value=voiceVolume/100; gain.connect(offline.destination);
    const node=offline.createBufferSource(); node.buffer=voiceBuffer; node.connect(gain);
    const usable=Math.min(voiceBuffer.duration,outputDuration-voiceOffset);
    if(usable>0)node.start(voiceOffset,0,usable);
  }
  if (musicBuffer) {
    const gain=offline.createGain(); gain.gain.value=musicVolume/100; gain.connect(offline.destination);
    const node=offline.createBufferSource(); node.buffer=musicBuffer; node.connect(gain);
    const usable=Math.min(musicBuffer.duration,outputDuration);
    if(usable>0)node.start(0,0,usable);
  }
  return await offline.startRendering();
}

/** Copy encoded video packets losslessly and encode exactly one mixed AAC track. */
export async function muxMixedAudio(videoBytes, mixedBuffer, {cancelled=()=>false,onOutput=()=>{}}={}) {
  const input = new Input({source:new BlobSource(new Blob([videoBytes],{type:'video/mp4'})),formats:ALL_FORMATS});
  let output;
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('Не найдена подготовленная видеодорожка.');
    const codec=await video.getCodec(), decoderConfig=await video.getDecoderConfig();
    if(codec !== 'avc' || !decoderConfig) throw new Error('Не удалось подготовить видеодорожку для звука.');
    output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target:new BufferTarget()});
    onOutput(output);
    const videoSource=new EncodedVideoPacketSource('avc'), audioSource=new AudioBufferSource({codec:'aac',bitrate:128_000});
    output.addVideoTrack(videoSource); output.addAudioTrack(audioSource);
    if(cancelled()) throw new Error('cancelled');
    await output.start();
    await Promise.all([
      (async()=>{const sink=new EncodedPacketSink(video);for await(const packet of sink.packets()){
        if(cancelled())throw new Error('cancelled'); await videoSource.add(packet,{decoderConfig});
      } videoSource.close();})(),
      (async()=>{if(cancelled())throw new Error('cancelled');await audioSource.add(mixedBuffer);audioSource.close();})(),
    ]);
    if(cancelled())throw new Error('cancelled');
    await output.finalize();
    const data=output.target.buffer;
    if(!data?.byteLength)throw new Error('Не удалось соединить видео и звук.');
    return data;
  } catch(e) {
    if(output && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(()=>{});
    throw e;
  } finally {input.dispose();}
}
