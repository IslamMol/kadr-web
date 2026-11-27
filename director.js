// Rule-based storyboard planning from the user's timestamped subtitles.
// This is not an AI or semantic understanding: every visible word/value comes
// verbatim from the cues. The user can edit/delete generated suggestions.
const STOP = new Set((
  'а без бы был была были было быть в вам вас ведь во вот все-таки всё-таки где да для до его ее её если есть же за и из или им их к как ко когда кто ли мне меня мы на нам нас не нет ни но ну о об она они оно он от перед по под при потому поэтому просто с со своя свой своим свое своё свои нашем нашего нашим так также такое то то-то тот у уже чтобы что это этот эта эти я же each a an and are as at be but by for from i in is it of on or so that the this to was were with you your'
).split(/\s+/));
const NUMBER = /(^|\s)(\d+(?:[.,]\d+)?\s*%?)(?=\s|[.,!?;:]|$)/u;
const CONTEXT = new Set('не ни нет без нельзя неясно ошибочно опасно риск страх вероятность возможно вероятно якобы считается кажется сомнительно думаю думают думает говорит сказал сказала почему зачем'.split(' '));
const SUBORDINATE = new Set('что чтобы если потому поскольку хотя когда как'.split(' '));
const normal = s => String(s||'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\p{L}\p{N}%]+/gu,' ').trim();
const stripEdge = s => String(s||'').replace(/^[\s«»"“”'‘’()\[\],;:—–.!?…]+|[\s«»"“”'‘’()\[\],;:—–.!?…]+$/gu,'');
const toInitial = s => s ? s[0].toLocaleUpperCase('ru') + s.slice(1) : '';
const isStop = word => STOP.has(normal(word));
const isBreak = raw => /[,;:!?….][»”"')\]]*$/u.test(raw);
const overlaps = (a,b,gap=0) => a.from < b.to + gap && b.from < a.to + gap;

function tokensForCue(cue) {
  const texts = String(cue.text || '').trim().split(/\s+/).filter(Boolean);
  const start=Number(cue.start), end=Number(cue.end);
  if(!texts.length || !Number.isFinite(start) || !Number.isFinite(end) || end<=start) return [];
  const stamped=Array.isArray(cue.words) && cue.words.length===texts.length && cue.words.every(w=>Number.isFinite(w.start)&&Number.isFinite(w.end));
  return texts.map((raw,i)=>({raw,
    start:stamped ? Math.max(start,Number(cue.words[i].start)) : start+(end-start)*i/texts.length,
    end:stamped ? Math.min(end,Number(cue.words[i].end)) : start+(end-start)*(i+1)/texts.length
  })).filter(t=>t.end>=t.start);
}
function sentences(cues) {
  const out=[]; let cur=[],lastEnd=null;
  const flush=()=>{if(cur.length)out.push(cur);cur=[];};
  for(const cue of cues){
    const words=tokensForCue(cue); if(!words.length)continue;
    if(lastEnd!==null && words[0].start-lastEnd>1.2)flush();
    for(const token of words){cur.push(token);if(/[.!?…][»”"')\]]*$/u.test(token.raw))flush();lastEnd=token.end;}
  }
  flush();return out;
}
function clauses(words) {
  const out=[];let cur=[];
  for(const token of words){cur.push(token);if(isBreak(token.raw)){out.push(cur);cur=[];}}
  if(cur.length)out.push(cur);return out;
}
function firstSentence(cues,start,end) {
  const words=sentences(cues).find(xs=>xs[xs.length-1].end>start);
  if(!words||words[0].start<start-.05||words[0].start>start+3||
     words[words.length-1].end>end+.05||
     !/[.!?…][»”"')\]]*$/u.test(words[words.length-1].raw))return '';
  const text=words.map(x=>x.raw).join(' ').trim();
  return words.length>=2 && words.length<=9 && text.length<=60 ? toInitial(stripEdge(text)) : '';
}
function bestPhrase(words) {
  let best=null;
  for(let i=0;i<words.length;i++)for(let n=2;n<=Math.min(7,words.length-i);n++){
    const part=words.slice(i,i+n), first=stripEdge(part[0].raw), last=stripEdge(part[n-1].raw);
    if(!first||!last||isStop(first)||isStop(last))continue;
    // Excerpts must not silently drop negation, uncertainty, or an
    // attribution such as “fear, that …”. Prefer skipping to inventing.
    const whole=i===0 && n===words.length;
    if(!whole && (n>3 || words.some(w=>CONTEXT.has(normal(w.raw))) || part.some(w=>isStop(w.raw))))continue;
    if(whole && SUBORDINATE.has(normal(words[0].raw)))continue;
    // Short mechanical snippets ending in an infinitive tend to be
    // ungrammatical; keep a few common noun endings intact.
    if(!whole && /(?:ться|ить|ать|ять|еть|нуть|чь)$/u.test(normal(last)) && !/^(?:память|власть|часть|печь)$/u.test(normal(last)))continue;
    const clean=part.map((w,j)=>j===0||j===n-1?stripEdge(w.raw):w.raw).join(' ').trim();
    if(clean.length<7||clean.length>50||part.slice(0,-1).some(w=>isBreak(w.raw)))continue;
    const content=part.filter(w=>!isStop(w.raw)); if(content.length<2)continue;
    const inf=content.reduce((sum,w)=>sum+Math.min(9,normal(w.raw).length)*.32,0);
    const stops=n-content.length;
    const score=inf + content.length*.75 - stops*1.2 - Math.abs(n-3)*.9 + (i+n===words.length?1.0:0)+(i===0?.25:0)+(whole?2.8:0);
    if(!best||score>best.score)best={text:toInitial(clean),start:part[0].start,end:part[n-1].end,score};
  }
  return best;
}
function explicitList(cue) {
  const text=String(cue.text||'').trim();
  const match=text.match(/^(.{3,42}?)\s*[:—]\s*(.{5,})$/u);if(!match)return null;
  const label=stripEdge(match[1]);
  const items=match[2].split(/\s*[,;]\s*|\s+и\s+/iu).map(stripEdge).filter(Boolean);
  if(items.length<2||items.length>3||items.some(s=>s.length>20||s.split(/\s+/).length>3)||label.length>45)return null;
  return {kind:'diagram',label:toInitial(label),value:items.join(' / '),start:Number(cue.start),end:Number(cue.end),priority:4};
}
/** Return suggestions only; caller controls IDs, overwriting, and editing. */
export function planStoryboard({cues=[],start=0,end=0,reserved=[],cuts=[],maxScenes=8}={}) {
  start=Number(start)||0;end=Number(end)||0;
  if(end-start<2 || !Array.isArray(cues) || !cues.length)return {headline:'',scenes:[],reason:'no-cues'};
  const sorted=cues.filter(c=>c&&Number.isFinite(Number(c.start))&&Number.isFinite(Number(c.end))&&Number(c.end)>Number(c.start)&&String(c.text||'').trim())
    .sort((a,b)=>Number(a.start)-Number(b.start));
  const valid=sorted.filter(c=>Number(c.end)>start&&Number(c.start)<end);
  if(!valid.length)return {headline:'',scenes:[],reason:'no-cues'};
  // Do not promote a partial sentence that was chopped by the selected trim.
  const groups=sentences(sorted).filter(xs=>xs[0].start>=start-.05&&xs[xs.length-1].end<=end+.05);
  const headline=firstSentence(sorted,start,end);
  if(maxScenes<=0)return {headline,scenes:[],reason:'no-room'};
  const all=[];
  for(const cue of valid){const list=explicitList(cue);if(list&&Number.isFinite(list.start)&&Number.isFinite(list.end)&&list.start>=start&&list.end<=end)all.push(list);}
  for(const group of groups){
    const wholeText=group.map(w=>w.raw).join(' ').trim();
    const shortWhole=group.length>=2&&group.length<=8&&wholeText.length<=60;
    const risky=group.some(w=>CONTEXT.has(normal(w.raw)));
    let options=[];
    if(shortWhole)options=[{text:toInitial(stripEdge(wholeText)),start:group[0].start,end:group[group.length-1].end}];
    else if(!risky)options=clauses(group).map(bestPhrase).filter(Boolean);
    for(const found of options){
      const m=found.text.match(NUMBER);
      if(m){const value=m[2].replace(/\s/g,'');const label=found.text.replace(m[0],m[1]||' ').replace(/\s+/g,' ').trim();
        all.push({kind:'number',label:toInitial(label),value,start:found.start,end:found.end,priority:2});
      }else all.push({kind:'quote',label:found.text,value:'',start:found.start,end:found.end,priority:1});
    }
  }
  all.sort((a,b)=>a.start-b.start || b.priority-a.priority);
  const occupied=[...reserved,...cuts].filter(x=>Number.isFinite(x.from)&&Number.isFinite(x.to)&&x.to>x.from);
  const scenes=[], seen=new Set();
  for(const candidate of all){
    const id=normal(candidate.label+' '+candidate.value);if(!id||seen.has(id))continue;
    let at=Math.max(start,Number(candidate.start)-.08);
    if(at<start+3.8||at>=end-1.4)continue;
    const removedBefore=cuts.reduce((sum,c)=>sum+Math.max(0,Math.min(at,c.to)-Math.max(start,c.from)),0);
    if(at-start-removedBefore<2.2)continue;
    let dur=Math.max(2.5,Math.min(4.0,Number(candidate.end)-at+.65));
    dur=Math.min(dur,end-at);
    let interval={from:at,to:at+dur};
    if(dur<1.4||occupied.some(o=>overlaps(interval,o,.35)))continue;
    if(scenes.some(s=>Math.abs(at-s.at)<4.6 || overlaps(interval,{from:s.at,to:s.at+s.duration},.6)))continue;
    const variants=['overlay','orbit','framed'];
    scenes.push({kind:candidate.kind,label:candidate.label,value:candidate.value,variant:variants[scenes.length%variants.length],
      at:Number(at.toFixed(2)),duration:Number(dur.toFixed(2)),layout:'card',trigger:'time'});
    seen.add(id);if(scenes.length>=Math.max(0,Math.min(8,maxScenes)))break;
  }
  return {headline,scenes,reason:scenes.length?'ok':'no-room'};
}
