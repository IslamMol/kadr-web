/** Nearest manually specified music beat in the edited output timeline. */
export function nearestBeatOutput(time,duration,bpm,firstBeat=0){
  time=Number(time);duration=Number(duration);bpm=Number(bpm);firstBeat=Number(firstBeat);
  if(!Number.isFinite(time)||!Number.isFinite(duration)||duration<=0)
    throw new Error('Сначала выбери фрагмент видео.');
  if(!Number.isFinite(bpm)||bpm<40||bpm>240)
    throw new Error('Укажи темп музыки от 40 до 240 BPM.');
  if(!Number.isFinite(firstBeat)||firstBeat<0||firstBeat>=duration)
    throw new Error('Первый удар должен находиться внутри ролика.');
  const period=60/bpm, last=Math.floor((duration-firstBeat-1/30)/period+1e-8);
  if(last<0)throw new Error('Первый удар слишком близко к концу ролика.');
  const n=Math.max(0,Math.min(last,Math.round((time-firstBeat)/period)));
  return firstBeat+n*period;
}
