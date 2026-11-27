// Кадр: visual compositions shared by the live preview and MP4 export.
// The user supplies all actual statements, numbers and images. No stock claims.
// The word-by-word blur/slide entrance below is a Canvas adaptation of
// video-shotcraft's blur-slide shot (Copyright 2026 Wei Yihao, Apache-2.0):
// https://github.com/Vincentwei1021/video-shotcraft
import {LuSparkles, LuChartNoAxesColumnIncreasing, LuCircleCheck, LuLightbulb} from 'react-icons/lu';
import {frameGeometry} from './asr.js';
export const FW=720, FH=1280;
export const CAPTION_POSITIONS={high:.72,normal:.80,low:.86};
export const PRESETS={
  premium:{name:'Тёмный премиум',short:'Премиум',accent:'#dfc49e',note:'Кино · крупные мысли · засечки'},
  tech:{name:'Технологичный',short:'Технологичный',accent:'#ff9e70',note:'Тёмный интерфейс · оранжевый'},
  red:{name:'Чёрно-красный',short:'Чёрно-красный',accent:'#ff4148',note:'Крупный текст · схемы · красный'},
  light:{name:'Светлый',short:'Светлый',accent:'#dc745f',note:'Воздух · блоки · мягкие цвета'},
  // Стили ghost-editor: свои цвета и эффекты текста на тех же проверенных сценах.
  'ghost-clean':{name:'Чистый',short:'Чистый',accent:'#ffd23f',note:'Крупные слова · один акцент · без музыки'},
  'ghost-cinematic':{name:'Кино',short:'Кино',accent:'#e7c27a',note:'Засечки · мягкий свет · редкие сцены'},
  'ghost-editorial':{name:'Редакционный',short:'Редакционный',accent:'#d13f34',note:'Нижний регистр · подсветка слов'},
  'ghost-kinetic':{name:'Кинетический',short:'Кинетический',accent:'#ff5a1f',note:'Одно слово — один кадр'},
  'ghost-launch':{name:'Запуск',short:'Запуск',accent:'#7c5cff',note:'Тёмный интерфейс · моно-метки'},
  'ghost-meme':{name:'Мем',short:'Мем',accent:'#ffd166',note:'Обводка · крупная реакция'},
  'ghost-pop':{name:'Журнал',short:'Журнал',accent:'#ff2e88',note:'ЗАГЛАВНЫЕ · цветной блок'},
};
// Styles are systems, not templates: they reuse a base composition but change
// ink, accent and the way words enter. Nothing on screen is invented by AI.
const STYLE_BASE={'ghost-clean':'premium','ghost-cinematic':'premium','ghost-editorial':'red','ghost-kinetic':'red','ghost-launch':'tech','ghost-meme':'light','ghost-pop':'light'};
const basePreset=p=>STYLE_BASE[p]||p;
const C={premium:{bg:'#0b0d0c',fg:'#f8f4ee',accent:'#dfc49e',muted:'#b9ad9f'},tech:{bg:'#0b0b0e',fg:'#f8f4f1',accent:'#ff9e70',muted:'#b6aaa5'},red:{bg:'#08090b',fg:'#f8f6f3',accent:'#ff4148',muted:'#b2a6a6'},light:{bg:'#f8f0eb',fg:'#17181d',accent:'#dc745f',muted:'#877e7d'},
  'ghost-clean':{bg:'#0b0d0c',fg:'#f8f4ee',accent:'#ffd23f',muted:'#b9ad9f'},
  'ghost-cinematic':{bg:'#0f0f10',fg:'#ede6da',accent:'#e7c27a',muted:'#b7ad9e'},
  'ghost-editorial':{bg:'#08090b',fg:'#f8f6f3',accent:'#d13f34',muted:'#b2a6a6'},
  'ghost-kinetic':{bg:'#141414',fg:'#fff4df',accent:'#ff5a1f',muted:'#c3bdb3'},
  'ghost-launch':{bg:'#0e0e12',fg:'#f6f4ff',accent:'#7c5cff',muted:'#b6b2c5'},
  'ghost-meme':{bg:'#f8f0eb',fg:'#17181d',accent:'#ffd166',muted:'#877e7d'},
  'ghost-pop':{bg:'#fff0f6',fg:'#111111',accent:'#ff2e88',muted:'#7f6972'}};

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// A deterministic cubic Bézier for the same timing in preview and export.
// Solve the x coordinate, then evaluate y; this avoids a rendering dependency
// for a single easing function and lands exactly at the endpoints.
const ease=t=>{
  t=clamp(t,0,1);if(t===0||t===1)return t;
  let lo=0,hi=1;
  for(let i=0;i<18;i++){
    const u=(lo+hi)/2,v=1-u;
    const x=3*v*v*u*.16+3*v*u*u*.3+u*u*u;
    if(x<t)lo=u;else hi=u;
  }
  return 1-Math.pow(1-(lo+hi)/2,3);
};
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
// A small damped spring, evaluated from time rather than accumulated frames.
// It keeps the motion deterministic in both live preview and MP4 export.
export function springProgress(t){
  const x=Math.max(0,Number(t)||0);
  if(x>=1)return 1;
  return 1-Math.exp(-7*x)*(Math.cos(11*x)+(7/11)*Math.sin(11*x));
}
const mix=(a,b,t)=>a+(b-a)*t;
const clock=t=>{const n=Math.floor(Math.max(0,t||0));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`};
const mixRect=(a,b,t)=>Object.fromEntries(['x','y','w','h','r'].map(k=>[k,mix(a[k],b[k],t)]));
const NORMAL={premium:{x:0,y:0,w:720,h:1280,r:0},tech:{x:20,y:35,w:680,h:1209,r:15},red:{x:0,y:0,w:720,h:1280,r:0},light:{x:28,y:150,w:664,h:1088,r:24}};
const INTRO={premium:{x:70,y:125,w:580,h:600,r:23},tech:{x:90,y:140,w:540,h:545,r:24},red:{x:55,y:670,w:610,h:520,r:18},light:{x:52,y:736,w:616,h:490,r:28}};
const GRAPH={premium:{x:70,y:115,w:580,h:580,r:23},tech:{x:74,y:120,w:572,h:550,r:24},red:{x:55,y:690,w:610,h:525,r:18},light:{x:52,y:690,w:616,h:535,r:28}};
for(const id of Object.keys(STYLE_BASE)){NORMAL[id]=NORMAL[STYLE_BASE[id]];INTRO[id]=INTRO[STYLE_BASE[id]];GRAPH[id]=GRAPH[STYLE_BASE[id]];}
function rounded(ctx,x,y,w,h,r=0){ctx.beginPath();ctx.roundRect(x,y,Math.max(.01,w),Math.max(.01,h),Math.max(0,r))}
function line(ctx,x1,y1,x2,y2,color,width=1){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke()}
function radial(ctx,x,y,r,color){let g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'rgba(0,0,0,0)');return g}
function fillRound(ctx,x,y,w,h,r,color){rounded(ctx,x,y,w,h,r);ctx.fillStyle=color;ctx.fill()}
function strokeRound(ctx,x,y,w,h,r,color,width=1){rounded(ctx,x,y,w,h,r);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()}
function font(p,size,weight=800){return p==='premium'?`italic 600 ${size}px "Kadr Playfair", Georgia, serif`:`${weight} ${size}px "Kadr Manrope", sans-serif`}
function sans(size,weight=800){return `${weight} ${size}px "Kadr Manrope", sans-serif`}
function wrap(ctx,text,width){
  const words=String(text||'').trim().split(/\s+/).filter(Boolean), lines=[];let cur='';
  for(const word of words){const next=cur?`${cur} ${word}`:word;if(cur&&ctx.measureText(next).width>width){lines.push(cur);cur=word}else cur=next}
  if(cur)lines.push(cur);return lines;
}
function textBox(ctx,text,{x,y,w,h,size=60,min=25,preset='tech',color,align='left',lineHeight=1.12,maxLines=3,upper=false,weight=800}){
  const str=upper?String(text||'').toLocaleUpperCase('ru'):String(text||'');
  let f=size,rows=[];do{ctx.font=font(preset,f,weight);rows=wrap(ctx,str,w);if(rows.length<=maxLines&&rows.length*f*lineHeight<=h&&rows.every(s=>ctx.measureText(s).width<=w))break;f-=2}while(f>min);
  if(rows.length>maxLines)rows=[...rows.slice(0,maxLines-1),rows.slice(maxLines-1).join(' ')];
  ctx.font=font(preset,f,weight);ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='top';const px=align==='center'?x+w/2:x;
  rows.forEach((s,i)=>ctx.fillText(s,px,y+i*f*lineHeight,w));
  return {height:Math.min(maxLines,rows.length)*f*lineHeight,size:f,lines:rows};
}
// All three channels share one eased progress per word; the stagger is capped
// for long titles so the last word is not delayed past the opening shot.
function revealTitle(ctx,text,{x,y,w,h,size,min,preset,color,lineHeight,maxLines},elapsed){
  let f=size,rows;
  while(true){
    ctx.font=font(preset,f);rows=wrap(ctx,text,w);
    const fits=rows.length<=maxLines&&rows.length*f*lineHeight<=h&&rows.every(s=>ctx.measureText(s).width<=w);
    if(fits||f<=min)break;
    f=Math.max(min,f-2);
  }
  if(rows.length>maxLines)rows=[...rows.slice(0,maxLines-1),rows.slice(maxLines-1).join(' ')];
  ctx.font=font(preset,f);ctx.fillStyle=color;ctx.textAlign='left';ctx.textBaseline='top';
  const count=rows.reduce((n,row)=>n+row.split(/\s+/).filter(Boolean).length,0);
  const gap=count>1?Math.min(.10,.42/(count-1)):0;
  let index=0;
  rows.forEach((row,lineIndex)=>{
    const width=ctx.measureText(row).width,scale=width>w?w/width:1;
    let prefix='';
    for(const word of row.split(/\s+/).filter(Boolean)){
      const progress=ease((elapsed-.20-index*gap)/.42);
      const offset=ctx.measureText(prefix).width*scale;
      const left=x+(w-width*scale)/2+offset;
      if(progress>.001){
        ctx.save();ctx.globalAlpha*=progress;
        ctx.translate(left,y+lineIndex*f*lineHeight+(1-progress)*f*.25);ctx.scale(scale,1);
        if(progress<.999)ctx.filter=`blur(${((1-progress)*Math.min(8,f*.12)).toFixed(2)}px)`;
        ctx.fillText(word,0,0);ctx.restore();
      }
      prefix+=`${word} `;index++;
    }
  });
}
// Matches are literal and use the source timeline, not guessed semantic matches.
export const normalizeMatch=s=>String(s||'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
export function graphicTimes(g,srt){
  if(g.trigger!=='keyword')return [Number(g.at)||0];
  const needle=normalizeMatch(g.keyword);if(!needle||!srt?.cues)return [];
  return srt.cues.flatMap(c=>{const normalized=normalizeMatch(c.text),at=normalized.indexOf(needle);if(at<0)return [];
    const prefix=normalized.slice(0,at),index=prefix.trim().split(/\s+/).filter(Boolean).length-(prefix&&!/\s$/.test(prefix)?1:0),count=normalized.split(/\s+/).filter(Boolean).length;
    return [c.words?.[index]?.start??c.start+(c.end-c.start)*index/Math.max(count,1)];});
}
export function findGraphic(graphics=[],srt,sourceTime){
  for(const g of graphics){
    if(g.kind==='number'&&!String(g.value||'').trim()&&!String(g.label||'').trim())continue;
    if(g.kind==='quote'&&!String(g.label||'').trim())continue;
    for(const start of graphicTimes(g,srt))if(sourceTime>=start&&sourceTime<start+(Number(g.duration)||2.8))return {item:g,start};
  }return null;
}
function graphicPhase(active,sourceTime,motion){
  if(!active||active.item.layout==='scene')return 0;
  const age=sourceTime-active.start,d=clamp(Number(active.item.duration)||2.8,.4,12);
  if(age<0||age>=d)return 0;if(!motion)return 1;
  return Math.min(ease(age/.42),smooth((d-age)/.36));
}
export function compositionState(preset,opts={}){
  const p=NORMAL[preset]?preset:'premium',base=basePreset(p),motion=opts.style!=='none',time=Math.max(0,opts.outputT||0);
  // Start on the full speaker, then physically move into the title layout.
  // The same state is used in preview and in the MP4 render.
  const intro=String(opts.headline||'').trim()?
    (motion?ease((time-1.27)/.24)*(1-smooth((time-3.25)/.58)):(time<3.5?1:0)):0;
  let active=opts.active===undefined?findGraphic(opts.graphics||[],opts.srt,opts.sourceTime??0):opts.active;
  if(active?.item.kind==='image'&&!opts.images?.some(i=>i.id===active.item.assetId&&i.image))active=null;
  const graphic=graphicPhase(active,opts.sourceTime??0,motion);
  let rect=mixRect(NORMAL[p],INTRO[p],intro);
  let graphRect=GRAPH[p];
  if(p==='premium'&&active?.item.kind==='quote'){
    graphRect=active.item.variant==='overlay'?NORMAL[p]:
      active.item.variant==='framed'?GRAPH[p]:{x:145,y:300,w:430,h:430,r:215};
  }
  rect=mixRect(rect,graphRect,graphic);
  return {rect,intro:intro*(1-graphic),graphic,active,motion,motionStyle:opts.style,base,textEffect:opts.textEffect||'clean'};
}
export function rectFor(p,opts={}){return compositionState(p,opts).rect}
export function drawBackground(ctx,preset,clear=true){
  preset=basePreset(preset);
  const p=C[preset]||C.premium;if(clear)ctx.clearRect(0,0,FW,FH);ctx.fillStyle=p.bg;ctx.fillRect(0,0,FW,FH);
  if(preset==='premium'){
    ctx.fillStyle=radial(ctx,590,270,650,'rgba(127,96,66,.26)');ctx.fillRect(0,0,FW,FH);
    ctx.fillStyle=radial(ctx,140,970,620,'rgba(70,63,53,.18)');ctx.fillRect(0,0,FW,FH);
  }else if(preset==='tech'){
    ctx.fillStyle=radial(ctx,370,510,720,'rgba(143,72,46,.26)');ctx.fillRect(0,0,FW,FH);
    ctx.fillStyle=radial(ctx,600,980,520,'rgba(92,49,41,.13)');ctx.fillRect(0,0,FW,FH);
    for(let x=60;x<FW;x+=60)line(ctx,x,0,x,FH,'rgba(245,217,200,.025)',1);
    for(let y=60;y<FH;y+=60)line(ctx,0,y,FW,y,'rgba(245,217,200,.025)',1);
  }else if(preset==='red'){
    ctx.fillStyle=radial(ctx,90,100,650,'rgba(154,20,29,.38)');ctx.fillRect(0,0,FW,FH);
  }else{
    ctx.fillStyle=radial(ctx,640,90,700,'rgba(239,193,202,.56)');ctx.fillRect(0,0,FW,FH);
    ctx.fillStyle=radial(ctx,10,940,670,'rgba(203,218,226,.30)');ctx.fillRect(0,0,FW,FH);
  }
}
const iconNodes={spark:LuSparkles({}).props.children,chart:LuChartNoAxesColumnIncreasing({}).props.children,check:LuCircleCheck({}).props.children,idea:LuLightbulb({}).props.children};
function drawIcon(ctx,kind,x,y,size,color){
  ctx.save();ctx.translate(x,y);ctx.scale(size/24,size/24);ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.lineCap='round';ctx.lineJoin='round';
  for(const node of iconNodes[kind]||iconNodes.spark){const p=node.props;if(node.type==='path')ctx.stroke(new Path2D(p.d));else if(node.type==='line')line(ctx,+p.x1,+p.y1,+p.x2,+p.y2,color,1.6);else if(node.type==='circle'){ctx.beginPath();ctx.arc(+p.cx,+p.cy,+p.r,0,Math.PI*2);ctx.stroke()}}
  ctx.restore();
}
function imageIn(ctx,image,x,y,w,h,r=14,fit='contain'){
  if(!image)return;const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;if(!iw||!ih)return;
  ctx.save();rounded(ctx,x,y,w,h,r);ctx.clip();const s=fit==='cover'?Math.max(w/iw,h/ih):Math.min(w/iw,h/ih);ctx.drawImage(image,x+(w-iw*s)/2,y+(h-ih*s)/2,iw*s,ih*s);ctx.restore();
}
function presentedValue(raw,age,motion){let value=String(raw||'').slice(0,18),n=value.match(/^(-?\d+(?:[.,]\d+)?)(%?)$/);if(n&&motion){const decimals=(n[1].split(/[.,]/)[1]||'').length,v=Number(n[1].replace(',','.'))*ease(age/.8);value=v.toFixed(decimals).replace('.',n[1].includes(',')?',':'.')+n[2]}return value;}
function progressLine(ctx,x,y,w,p,color,dim){line(ctx,x,y,x+w,y,dim,2);if(p>0)line(ctx,x,y,x+w*clamp(p,0,1),y,color,3)}
function chrome(ctx,preset,state,outputT,total){
  const r=state.rect,p=C[preset];ctx.save();
  rounded(ctx,r.x,r.y,r.w,r.h,r.r);ctx.clip();
  // A short, feathered scrim lives inside the footage, never over another layout.
  let g=ctx.createLinearGradient(0,r.y+r.h*.52,0,r.y+r.h);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.65,'rgba(0,0,0,.10)');g.addColorStop(1,'rgba(0,0,0,.24)');ctx.fillStyle=g;ctx.fillRect(r.x,r.y+r.h*.52,r.w,r.h*.48);
  if(preset==='red'&&state.intro<.05&&state.graphic<.05){let t=ctx.createLinearGradient(0,0,0,180);t.addColorStop(0,'rgba(0,0,0,.58)');t.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=t;ctx.fillRect(0,0,FW,180)}
  ctx.restore();
  const overlayQuote=preset==='premium'&&state.active?.item.kind==='quote'&&state.active.item.variant==='overlay';
  const inset=Math.max(state.intro,overlayQuote?0:state.graphic);
  if(r.r>2){strokeRound(ctx,r.x+.7,r.y+.7,r.w-1.4,r.h-1.4,r.r,preset==='light'?'rgba(40,30,30,.14)':'rgba(255,255,255,.19)',1.4)}
  ctx.save();ctx.globalAlpha=inset;
  if(preset==='premium'){
    line(ctx,70,73,296,73,'rgba(223,196,158,.45)',1);line(ctx,424,73,650,73,'rgba(223,196,158,.45)',1);
    ctx.fillStyle=p.accent;ctx.beginPath();ctx.arc(360,73,3.5,0,Math.PI*2);ctx.fill();
  }else if(preset==='tech'){
    strokeRound(ctx,r.x-12,r.y+12,r.w+24,r.h-24,26,'rgba(255,158,112,.18)',1.5);
    ctx.fillStyle=p.accent;ctx.beginPath();ctx.arc(78,70,4,0,Math.PI*2);ctx.fill();
    progressLine(ctx,96,70,540,outputT/Math.max(.01,total),p.accent,'rgba(255,255,255,.17)');
  }else if(preset==='red'){
    ctx.fillStyle=p.accent;ctx.beginPath();ctx.moveTo(55,86);ctx.lineTo(64,66);ctx.lineTo(73,86);ctx.closePath();ctx.fill();line(ctx,89,77,650,77,'rgba(255,65,72,.42)',2);
  }else{
    ctx.fillStyle=p.accent;ctx.beginPath();ctx.arc(63,78,4,0,Math.PI*2);ctx.fill();line(ctx,78,78,658,78,'rgba(75,61,57,.17)',1);
  }ctx.restore();
  if(preset==='red'&&inset<.05){ctx.save();ctx.globalAlpha=.85;ctx.fillStyle=p.accent;ctx.beginPath();ctx.moveTo(55,71);ctx.lineTo(63,53);ctx.lineTo(71,71);ctx.closePath();ctx.fill();progressLine(ctx,55,90,610,outputT/Math.max(.01,total),p.accent,'rgba(255,65,72,.35)');ctx.restore()}
}
function accentHeadline(ctx,text,x,y,w,h,size,preset){
  const words=String(text||'').trim().toLocaleUpperCase('ru').split(/\s+/).filter(Boolean);if(!words.length)return;
  const last=words.length>1?words.pop():words[0],first=words.length>1?words.join(' '):(words.length===1&&words[0]!==last?words[0]:'');
  if(first){const m=textBox(ctx,first,{x,y,w,h:h*.62,size,min:32,preset,color:C[preset].fg,upper:false,maxLines:2,lineHeight:1.02});textBox(ctx,last,{x,y:y+m.height+3,w,h:h-m.height,size,min:32,preset,color:C[preset].accent,maxLines:1,lineHeight:1});}
  else textBox(ctx,last,{x,y,w,h,size,min:32,preset,color:C[preset].accent,maxLines:2,lineHeight:1.02});
}
function introTitle(ctx,preset,title,state,outputT,total){
  if(!title?.trim())return;
  // In the premium treatment the thought starts over the full-frame speaker,
  // then stays in place as the speaker moves into the smaller window.
  const hero=preset==='premium'&&state.motion&&outputT<3.83;
  if(state.intro<=.001&&!hero)return;
  const settled=state.motion?smooth((state.intro-.80)/.20):state.intro;
  const a=hero?ease((outputT-.20)/.32)*(1-smooth((outputT-3.25)/.58))*(1-state.graphic):
    settled*(state.motion?ease(outputT/.5):1);
  const p=C[preset];ctx.save();ctx.globalAlpha=a;ctx.translate(0,(1-a)*16);
  if(preset==='premium'){
    if(hero&&state.intro<.8){ctx.shadowColor='rgba(0,0,0,.88)';ctx.shadowBlur=14;ctx.shadowOffsetY=3}
    const titleBox={x:50,y:hero?mix(970,785,state.intro):785,w:620,h:132,size:64,min:31,preset,color:p.accent,align:'center',maxLines:2,lineHeight:1.04};
    if(state.motion)revealTitle(ctx,title,titleBox,outputT);else textBox(ctx,title,titleBox);
  }else if(preset==='tech'){
    textBox(ctx,title,{x:80,y:815,w:560,h:180,size:74,min:34,preset,color:p.fg,maxLines:3,lineHeight:1.03});
    fillRound(ctx,80,1030,560,150,15,'rgba(23,22,23,.92)');strokeRound(ctx,80,1030,560,150,15,'rgba(255,158,112,.26)',1);
    smallTag(ctx,'Ход ролика',104,1052,'tech');ctx.font=sans(19,700);ctx.fillStyle='#bcb1ad';ctx.textAlign='right';ctx.textBaseline='top';ctx.fillText(`${clock(outputT)} / ${clock(total)}`,614,1052);
    progressLine(ctx,105,1122,510,outputT/Math.max(.01,total),p.accent,'rgba(255,255,255,.16)');
  }else if(preset==='red'){
    accentHeadline(ctx,title,56,150,610,365,84,preset);line(ctx,56,510,663,510,'rgba(255,65,72,.55)',2);ctx.fillStyle=p.accent;ctx.fillRect(56,508,150,5);
  }else{
    textBox(ctx,title,{x:62,y:150,w:590,h:190,size:74,min:34,preset,color:p.fg,maxLines:3,lineHeight:1.02});
    line(ctx,63,355,657,355,'rgba(80,64,58,.15)',2);ctx.fillStyle=p.accent;ctx.fillRect(63,353,96,4);
    fillRound(ctx,65,610,590,66,13,'rgba(255,255,255,.72)');ctx.font=sans(16,700);ctx.textBaseline='middle';ctx.fillStyle='#837a78';ctx.textAlign='left';ctx.fillText(clock(outputT),82,643);ctx.textAlign='right';ctx.fillText(clock(total),638,643);
    progressLine(ctx,151,643,417,outputT/Math.max(.01,total),p.accent,'rgba(87,72,67,.15)');
  }ctx.restore();
}
function captionWords(cue){
  const plain=String(cue?.text||'').trim().split(/\s+/).filter(Boolean);if(!plain.length)return [];
  if(cue.words?.length===plain.length&&cue.words.every(w=>Number.isFinite(w.start)&&Number.isFinite(w.end)))return cue.words.map((w,i)=>({...w,text:plain[i]}));
  return plain.map((text,i)=>({text,start:cue.start+(cue.end-cue.start)*i/plain.length,end:cue.start+(cue.end-cue.start)*(i+1)/plain.length}));
}
// Word treatment from ghost-editor styles. Deterministic: preview and MP4
// get the same state from the same timestamp, no timers or random values.
function capWord(text,fx){
  const s=String(text||'');
  if(fx==='editorial')return s.toLocaleLowerCase('ru');
  if(fx==='upper')return s.toLocaleUpperCase('ru');
  return s;
}
function paintCaptionWord(ctx,text,x,y,maxWidth,size,accent,ink,fx,progress,active){
  const shown=capWord(text,fx);
  if(fx==='serif')ctx.font=font('premium',size*1.04,600);
  else ctx.font=sans(size,fx==='outline'?900:800);
  ctx.save();
  ctx.globalAlpha*=fx==='type'?progress:fx==='blur'?.35+.65*progress:1;
  if(fx==='blur'&&progress<.98)ctx.filter=`blur(${((1-progress)*4).toFixed(2)}px)`;
  if(fx==='pop'&&active){ctx.translate(x+maxWidth/2,y);ctx.scale(1+.08*progress,1+.08*progress);ctx.translate(-x-maxWidth/2,-y)}
  if(fx==='outline'){
    ctx.lineWidth=Math.max(2,size*.075);ctx.lineJoin='round';
    ctx.strokeStyle=active?accent:'rgba(8,8,10,.92)';ctx.strokeText(shown,x,y,maxWidth);
    ctx.fillStyle=active?accent:'#fff';ctx.fillText(shown,x,y,maxWidth);
  }else{
    ctx.fillStyle=active?accent:(ink?'#202027':'#fff');ctx.fillText(shown,x,y,maxWidth);
    if(fx==='editorial'&&active){ctx.shadowColor='transparent';ctx.fillStyle=accent;ctx.fillRect(x,y+size*.56,maxWidth,2.5)}
  }
  ctx.restore();
}
function drawCaptions(ctx,cue,t,preset,position,state){
  const all=captionWords(cue);if(!all.length)return;
  const fx=state.textEffect||'clean';
  const groups=[];let group=[],length=0;for(const word of all){const add=(group.length?1:0)+word.text.length;if(group.length&&length+add>26){groups.push(group);group=[];length=0}group.push(word);length+=(group.length>1?1:0)+word.text.length}if(group.length)groups.push(group);
  let gi=groups.findIndex((g,i)=>t<(groups[i+1]?.[0].start??cue.end));if(gi<0)gi=groups.length-1;const words=groups[gi];
  const entrance=state.motion?ease((t-Math.max(cue.start,words[0].start))/.12):1;
  const hi=words.findIndex((w,i)=>t>=w.start-.03&&t<(words[i+1]?.start??(w.end+.12))-.03);
  const overlayQuote=preset==='premium'&&state.active?.item.kind==='quote'&&state.active.item.variant==='overlay';
  const compact=state.fullScene?0:Math.max(state.intro,overlayQuote?0:state.graphic),offset=position==='high'?-45:position==='low'?40:0;
  const premiumBar=preset==='premium'&&state.active?.item.kind==='quote'&&state.active.item.variant!=='overlay'&&state.active.item.variant!=='framed'&&state.graphic>.5&&!state.fullScene;
  const premiumCard=preset==='premium'&&state.intro>.5&&state.graphic<.5&&!state.fullScene;
  const target=preset==='premium'?(premiumCard?1039:premiumBar?950:755):preset==='tech'?722:preset==='red'?(state.graphic>state.intro?653:620):655;
  // Cross-fade the caption between safe zones; never drag it through the new title.
  let cy=state.fullScene?1162+offset*.35:(compact>.5?target+(premiumCard?offset*.4:offset):FH*(CAPTION_POSITIONS[position]||.80));
  if(preset==='premium'&&state.heroTitle&&!state.fullScene&&state.intro<.5&&state.graphic<.01)cy=905+offset*.35;
  const transitionVisibility=state.motion?smooth(Math.abs(compact-.5)*2):1;
  let panel=preset==='light'&&state.intro>.5&&state.graphic<.5&&!state.fullScene;
  if(panel)cy=475;
  let size=panel?38:premiumCard?32:mix(42,preset==='red'?32:34,compact),max=panel?495:(premiumBar||premiumCard)?450:(preset==='light'&&state.graphic>.7)?480:mix(520,560,compact),rows=[];
  function layout(){ctx.font=fx==='serif'?font('premium',size*1.04,600):sans(size,fx==='outline'?900:800);const space=ctx.measureText(' ').width,out=[];let curr=[],width=0;
    words.forEach((word,i)=>{const ww=Math.min(max,ctx.measureText(capWord(word.text,fx)).width),add=(curr.length?space:0)+ww;if(curr.length&&width+add>max){out.push({items:curr,width});curr=[];width=0}curr.push({...word,i,width:ww});width+=(curr.length>1?space:0)+ww});if(curr.length)out.push({items:curr,width});return out;}
  do{rows=layout();if(rows.length<=2)break;size-=2}while(size>26);rows=layout();const lh=size*1.22,startY=cy-(rows.length-1)*lh/2;
  ctx.save();ctx.globalAlpha=entrance*transitionVisibility;ctx.translate(0,(1-entrance)*6);
  if(premiumCard){
    ctx.save();ctx.shadowColor='rgba(0,0,0,.32)';ctx.shadowBlur=24;ctx.shadowOffsetY=8;fillRound(ctx,93,930,534,192,16,'rgba(26,27,25,.97)');ctx.restore();
    strokeRound(ctx,93,930,534,192,16,'rgba(223,196,158,.27)',1.4);smallTag(ctx,'Из речи',117,953,'premium');line(ctx,117,986,603,986,'rgba(223,196,158,.22)',1);
    line(ctx,117,1095,603,1095,'rgba(223,196,158,.14)',1);
  }
  if(panel){
    ctx.save();ctx.shadowColor='rgba(96,68,61,.12)';ctx.shadowBlur=24;ctx.shadowOffsetY=9;fillRound(ctx,65,395,590,170,22,'rgba(255,255,255,.94)');ctx.restore();
    ctx.fillStyle=C.light.accent;ctx.font='italic 80px Georgia, serif';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText('“',88,405);
    progressLine(ctx,105,536,510,clamp(t/Math.max(cue.end,.01),0,1),C.light.accent,'rgba(75,61,57,.13)');
  }
  const ink=(panel||(preset==='light'&&(compact>.7||state.fullScene)));
  if(preset==='light'&&state.graphic>.7){fillRound(ctx,95,cy-34,530,69,9,'rgba(255,255,255,.91)')}
  if(premiumBar){fillRound(ctx,86,cy-42,548,84,42,'rgba(30,31,29,.93)');strokeRound(ctx,86,cy-42,548,84,42,'rgba(223,196,158,.28)',1);drawIcon(ctx,'spark',105,cy-16,32,C.premium.accent)}
  ctx.font=sans(size,800);ctx.textAlign='left';ctx.textBaseline='middle';ctx.lineJoin='round';
  if(!ink){ctx.shadowColor='rgba(0,0,0,.9)';ctx.shadowBlur=11;ctx.shadowOffsetY=2}
  const space=ctx.measureText(' ').width,accent=C[preset].accent;
  rows.forEach((r,k)=>{let x=(FW-r.width)/2+(premiumBar?20:0),y=startY+k*lh;r.items.forEach(item=>{
    const active=item.i===hi;
    const progress=state.motion?(fx==='type'?ease((t-item.start)/.12):fx==='blur'?ease((t-item.start)/.16):1):1;
    ctx.save();ctx.globalAlpha=entrance*transitionVisibility*(hi>=0&&item.i>hi?.65:1);
    paintCaptionWord(ctx,item.text,x,y,item.width,size,accent,ink,fx,progress,active);
    ctx.restore();x+=item.width+space})});ctx.restore();
}
function smallTag(ctx,text,x,y,preset){ctx.font=sans(17,800);ctx.textBaseline='top';ctx.textAlign='left';ctx.fillStyle=C[preset].accent;ctx.fillText(text.toLocaleUpperCase('ru'),x,y)}
function actualSteps(g){return String(g.value||'').split('/').map(s=>s.trim()).filter(Boolean).slice(0,3)}
function kindName(g){return ({icon:'АКЦЕНТ',diagram:'СХЕМА',number:'ЦИФРА',image:'ИЗОБРАЖЕНИЕ',quote:'ФРАЗА'})[g.kind]||'АКЦЕНТ'}
function drawStages(ctx,stages,{x,y,w,rowH=86,gap=15,preset='red',age=0,motion=true,style='rows'}){
  const p=C[preset];if(!stages.length)return;
  if(style==='columns'){
    const gap=12,cell=(w-gap*(stages.length-1))/stages.length;stages.forEach((s,i)=>{const a=motion?ease((age-.18*i)/.45):1;ctx.save();ctx.globalAlpha*=a;ctx.translate(0,(1-a)*16);
      const cx=x+i*(cell+gap);fillRound(ctx,cx,y,cell,rowH,12,preset==='light'?'rgba(247,239,235,.9)':'rgba(255,255,255,.055)');
      ctx.fillStyle=p.accent;ctx.font=sans(16);ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText(String(i+1).padStart(2,'0'),cx+14,y+13);
      textBox(ctx,s,{x:cx+13,y:y+39,w:cell-26,h:rowH-42,size:26,min:17,preset:preset==='premium'?'premium':'tech',color:p.fg,maxLines:2,lineHeight:1.08});ctx.restore();});
  }else stages.forEach((s,i)=>{const a=motion?ease((age-.16*i)/.4):1;ctx.save();ctx.globalAlpha*=a;ctx.translate((1-a)*-18,0);let yy=y+i*(rowH+gap);
    fillRound(ctx,x,yy,w,rowH,preset==='light'?12:3,preset==='light'?'rgba(255,255,255,.94)':'rgba(30,30,31,.95)');
    line(ctx,x,yy,x+w,yy,preset==='light'?'rgba(210,181,172,.7)':p.accent,2);
    ctx.textBaseline='middle';ctx.textAlign='left';ctx.font=sans(18);ctx.fillStyle=p.accent;ctx.fillText(String(i+1).padStart(2,'0'),x+20,yy+rowH/2);
    ctx.font=sans(29);ctx.fillStyle=p.fg;ctx.fillText(s,x+82,yy+rowH/2,w-100);ctx.restore();});
}
function drawGraphPremium(ctx,g,age,motion,images){
  const p=C.premium,label=String(g.label||'').trim(),pic=images.find(i=>i.id===g.assetId)?.image;
  if(g.kind!=='quote')line(ctx,70,1077,650,1077,'rgba(223,196,158,.3)',1);
  if(g.kind==='quote'){
    if(g.variant==='overlay'){
      const shade=ctx.createLinearGradient(0,0,0,350);shade.addColorStop(0,'rgba(0,0,0,.62)');shade.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=shade;ctx.fillRect(0,0,FW,350);
      ctx.save();ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=16;
      textBox(ctx,label,{x:62,y:115,w:596,h:180,size:62,min:31,preset:'premium',color:p.accent,align:'center',maxLines:2,lineHeight:1.06});
      ctx.restore();
      return;
    }
    if(g.variant==='framed'){
      textBox(ctx,label,{x:70,y:820,w:580,h:180,size:62,min:31,preset:'premium',color:p.accent,align:'center',maxLines:3,lineHeight:1.08});
      line(ctx,210,1050,510,1050,'rgba(223,196,158,.25)',1);
      ctx.fillStyle=p.accent;ctx.beginPath();ctx.arc(360,1050,3,0,Math.PI*2);ctx.fill();
      return;
    }
    textBox(ctx,label,{x:62,y:145,w:596,h:130,size:69,min:31,preset:'premium',color:p.accent,align:'center',maxLines:2,lineHeight:1.04});
    // A decorative orbit around a round portrait: no inferred family facts or counts.
    const cx=360,cy=515,rad=252;ctx.beginPath();ctx.arc(cx,cy,rad,0,Math.PI*2);ctx.strokeStyle='rgba(223,196,158,.21)';ctx.lineWidth=1.2;ctx.stroke();
    for(let i=0;i<8;i++){const angle=-Math.PI/2+i*Math.PI/4+(motion?age*.05:0),x=cx+Math.cos(angle)*rad,y=cy+Math.sin(angle)*rad;
      const a=motion?ease((age-i*.08)/.26):1;ctx.save();ctx.globalAlpha*=a;ctx.translate(x,y);ctx.scale(.75+a*.25,.75+a*.25);
      ctx.beginPath();ctx.arc(0,0,22,0,Math.PI*2);ctx.fillStyle='rgba(21,23,21,.95)';ctx.fill();ctx.strokeStyle='rgba(223,196,158,.34)';ctx.lineWidth=1.3;ctx.stroke();
      ctx.beginPath();ctx.arc(0,0,3.5,0,Math.PI*2);ctx.fillStyle=p.accent;ctx.fill();ctx.restore();}
  }else if(g.kind==='number'){
    const v=presentedValue(g.value,age,motion);ctx.font=sans(v.length>6?74:110);ctx.fillStyle=p.accent;ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText(v,76,839,250);
    textBox(ctx,label,{x:330,y:856,w:310,h:150,size:40,min:23,preset:'premium',color:p.fg,maxLines:3});
  }else if(g.kind==='diagram'){
    textBox(ctx,label,{x:75,y:816,w:570,h:84,size:50,min:28,preset:'premium',color:p.fg,maxLines:2});
    drawStages(ctx,actualSteps(g),{x:75,y:926,w:570,rowH:110,preset:'premium',age,motion,style:'columns'});
  }else if(g.kind==='image'){
    fillRound(ctx,74,810,202,210,13,'rgba(255,255,255,.06)');imageIn(ctx,pic,78,814,194,202,10);
    textBox(ctx,label,{x:305,y:844,w:332,h:175,size:48,min:25,preset:'premium',color:p.fg,maxLines:3});
  }else{
    drawIcon(ctx,g.icon||'spark',79,849,65,p.accent);textBox(ctx,label,{x:170,y:840,w:465,h:180,size:59,min:28,preset:'premium',color:p.fg,maxLines:3});
  }
}
function drawGraphTech(ctx,g,age,motion,images){
  const p=C.tech,label=String(g.label||'').trim(),pic=images.find(i=>i.id===g.assetId)?.image;
  // A layered interface, not a generic floating label over the face.
  fillRound(ctx,72,781,576,279,18,'rgba(5,5,7,.34)');strokeRound(ctx,80,773,576,279,18,'rgba(255,158,112,.18)',1.5);
  fillRound(ctx,64,757,576,279,18,'rgba(24,22,23,.96)');strokeRound(ctx,64,757,576,279,18,'rgba(255,158,112,.36)',1.4);
  smallTag(ctx,kindName(g),90,780,'tech');line(ctx,90,810,614,810,'rgba(255,255,255,.12)',1);
  if(g.kind==='number'){
    const v=presentedValue(g.value,age,motion);ctx.font=sans(v.length>6?69:96);ctx.textBaseline='top';ctx.fillStyle=p.accent;ctx.fillText(v,88,835,235);
    textBox(ctx,label,{x:328,y:845,w:280,h:130,size:38,min:22,preset:'tech',color:p.fg,maxLines:3});
  }else if(g.kind==='diagram'){
    textBox(ctx,label,{x:90,y:829,w:520,h:57,size:34,min:21,preset:'tech',color:p.fg,maxLines:1});
    drawStages(ctx,actualSteps(g),{x:90,y:894,w:520,rowH:101,preset:'tech',age,motion,style:'columns'});
  }else if(g.kind==='image'){
    fillRound(ctx,88,830,175,175,10,'rgba(255,255,255,.07)');imageIn(ctx,pic,91,833,169,169,8);
    textBox(ctx,label,{x:284,y:850,w:326,h:140,size:42,min:23,preset:'tech',color:p.fg,maxLines:3});
  }else if(g.kind==='icon'){
    fillRound(ctx,88,835,100,100,22,'rgba(255,158,112,.14)');drawIcon(ctx,g.icon||'spark',109,856,58,p.accent);
    textBox(ctx,label,{x:211,y:843,w:396,h:150,size:48,min:24,preset:'tech',color:p.fg,maxLines:3});
  }else{
    textBox(ctx,label,{x:90,y:836,w:520,h:155,size:50,min:25,preset:'tech',color:p.fg,maxLines:3});
  }
  progressLine(ctx,90,1011,520,Math.min(1,age/1),p.accent,'rgba(255,255,255,.10)');
}
function drawGraphRed(ctx,g,age,motion,images){
  const p=C.red,label=String(g.label||'').trim(),pic=images.find(i=>i.id===g.assetId)?.image;
  if(g.kind==='number'){
    const v=presentedValue(g.value,age,motion);ctx.font=sans(v.length>6?120:174);ctx.textBaseline='top';ctx.fillStyle=p.accent;ctx.fillText(v,57,155,595);
    textBox(ctx,label,{x:60,y:365,w:590,h:160,size:57,min:28,preset:'red',color:p.fg,upper:true,maxLines:2,lineHeight:1.04});line(ctx,58,550,660,550,'rgba(255,65,72,.75)',2);
  }else if(g.kind==='diagram'){
    textBox(ctx,label,{x:56,y:140,w:606,h:112,size:61,min:28,preset:'red',color:p.fg,upper:true,maxLines:2,lineHeight:1.02});
    drawStages(ctx,actualSteps(g),{x:56,y:275,w:608,rowH:86,gap:14,preset:'red',age,motion});
  }else if(g.kind==='image'){
    textBox(ctx,label,{x:56,y:140,w:606,h:105,size:59,min:28,preset:'red',color:p.fg,upper:true,maxLines:2,lineHeight:1.02});
    fillRound(ctx,56,262,608,350,4,'rgba(255,255,255,.06)');imageIn(ctx,pic,58,264,604,346,4);line(ctx,56,262,664,262,p.accent,4);
  }else if(g.kind==='icon'){
    textBox(ctx,label,{x:56,y:150,w:606,h:200,size:72,min:30,preset:'red',color:p.fg,upper:true,maxLines:3,lineHeight:1.02});
    fillRound(ctx,56,399,608,133,4,'rgba(31,31,32,.96)');line(ctx,56,399,664,399,p.accent,3);drawIcon(ctx,g.icon||'spark',82,432,67,p.accent);line(ctx,185,466,600,466,'rgba(255,65,72,.32)',2);
  }else{accentHeadline(ctx,label,56,153,605,330,76,'red');line(ctx,56,520,664,520,'rgba(255,65,72,.7)',2);ctx.fillStyle=p.accent;ctx.fillRect(56,518,190*ease(age/.7),5)}
}
function drawGraphLight(ctx,g,age,motion,images){
  const p=C.light,label=String(g.label||'').trim(),pic=images.find(i=>i.id===g.assetId)?.image;
  if(g.kind==='quote'){
    smallTag(ctx,'Фраза',62,150,'light');ctx.save();ctx.shadowColor='rgba(102,77,72,.12)';ctx.shadowBlur=24;ctx.shadowOffsetY=10;fillRound(ctx,59,205,602,380,24,'rgba(255,255,255,.95)');ctx.restore();
    ctx.fillStyle=p.accent;ctx.font='italic 110px Georgia, serif';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText('“',88,233);
    textBox(ctx,label,{x:90,y:320,w:530,h:210,size:63,min:30,preset:'light',color:p.fg,maxLines:3,lineHeight:1.07});
  }else{
    textBox(ctx,label,{x:62,y:143,w:594,h:135,size:63,min:28,preset:'light',color:p.fg,maxLines:2,lineHeight:1.03});
    ctx.save();ctx.shadowColor='rgba(102,77,72,.12)';ctx.shadowBlur=24;ctx.shadowOffsetY=10;fillRound(ctx,59,294,602,327,24,'rgba(255,255,255,.94)');ctx.restore();
    if(g.kind==='number'){
      const v=presentedValue(g.value,age,motion);ctx.font=sans(v.length>6?98:142);ctx.textBaseline='top';ctx.fillStyle=p.accent;ctx.fillText(v,91,345,525);
      const m=String(g.value||'').match(/^(\d+(?:[.,]\d+)?)%$/);if(m)progressLine(ctx,91,555,530,clamp(Number(m[1].replace(',','.'))/100,0,1)*(motion?ease(age/.8):1),p.accent,'rgba(89,72,68,.14)');
    }else if(g.kind==='diagram')drawStages(ctx,actualSteps(g),{x:87,y:350,w:546,rowH:171,preset:'light',age,motion,style:'columns'});
    else if(g.kind==='image')imageIn(ctx,pic,72,307,576,300,15);
    else {fillRound(ctx,104,352,140,140,30,'rgba(231,135,113,.12)');drawIcon(ctx,g.icon||'spark',136,384,76,p.accent);line(ctx,278,422,605,422,'rgba(220,116,95,.28)',3)}
  }
}
function drawGraphic(ctx,active,sourceTime,preset,state,images){
  if(!active||state.graphic<=.001)return;const g=active.item,age=sourceTime-active.start;
  const visual=state.motion?smooth((state.graphic-.80)/.20):state.graphic;
  const spring=state.motion && state.motionStyle==='dynamic' ? springProgress(Math.max(0,age-.16)) : 1;
  const lift=state.motionStyle==='dynamic' ? (1-spring)*26 : (1-visual)*18;
  const scale=state.motionStyle==='dynamic' ? .96+.04*spring : 1;
  ctx.save();ctx.globalAlpha=visual;
  ctx.translate(FW/2,FH/2+lift);ctx.scale(scale,scale);ctx.translate(-FW/2,-FH/2);
  if(state.motion&&visual<.999)ctx.filter=`blur(${((1-visual)*2.5).toFixed(2)}px)`;
  if(preset==='premium')drawGraphPremium(ctx,g,age,state.motion,images);
  else if(preset==='tech')drawGraphTech(ctx,g,age,state.motion,images);
  else if(preset==='red')drawGraphRed(ctx,g,age,state.motion,images);
  else drawGraphLight(ctx,g,age,state.motion,images);ctx.restore();
}
function diagramScene(ctx,g,age,motion,preset){
  const p=C[preset],label=String(g.label||'').trim(),stages=actualSteps(g);
  if(preset==='premium'){
    textBox(ctx,label,{x:65,y:230,w:590,h:165,size:75,min:32,preset,color:p.accent,maxLines:2,lineHeight:1.03});
    line(ctx,118,451,118,920,'rgba(223,196,158,.35)',2);
    stages.forEach((text,i)=>{const a=motion?ease((age-.15*i)/.45):1;ctx.save();ctx.globalAlpha*=a;const y=470+i*175;
      ctx.beginPath();ctx.arc(118,y,28,0,Math.PI*2);ctx.fillStyle='#141613';ctx.fill();ctx.strokeStyle='rgba(223,196,158,.8)';ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle=p.accent;ctx.font=sans(20);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1).padStart(2,'0'),118,y);
      textBox(ctx,text,{x:180,y:y-27,w:440,h:80,size:53,min:25,preset,color:p.fg,maxLines:2});
      line(ctx,179,y+73,622,y+73,'rgba(223,196,158,.18)',1);ctx.restore();});
  }else if(preset==='tech'){
    textBox(ctx,label,{x:65,y:230,w:590,h:150,size:68,min:30,preset,color:p.fg,maxLines:2,lineHeight:1.03});
    ctx.save();ctx.translate(360,695);ctx.rotate(-.045);ctx.transform(1,-.015,.055,1,0,0);
    fillRound(ctx,-291,-230,582,485,20,'rgba(255,158,112,.10)');fillRound(ctx,-305,-246,582,485,20,'rgba(32,27,27,.97)');strokeRound(ctx,-305,-246,582,485,20,'rgba(255,158,112,.42)',2);
    fillRound(ctx,-285,-225,542,53,10,'rgba(255,255,255,.04)');
    for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(-263+i*19,-199,4,0,Math.PI*2);ctx.fillStyle=i===0?p.accent:'rgba(255,255,255,.25)';ctx.fill()}
    smallTag(ctx,'Схема',-185,-210,preset);
    stages.forEach((text,i)=>{const a=motion?ease((age-.18*i)/.4):1;ctx.save();ctx.globalAlpha*=a;let y=-145+i*105;
      fillRound(ctx,-275,y,522,83,10,'rgba(255,255,255,.055)');ctx.fillStyle=p.accent;ctx.font=sans(18);ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillText(String(i+1).padStart(2,'0'),-252,y+42);
      ctx.font=sans(32);ctx.fillStyle=p.fg;ctx.fillText(text,-195,y+42,420);ctx.restore();});ctx.restore();
  }else if(preset==='red'){
    ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle=p.accent;ctx.font=sans(190);ctx.fillText(String(stages.length||''),64,225,170);
    textBox(ctx,label,{x:250,y:248,w:405,h:150,size:54,min:28,preset,color:p.fg,maxLines:3,upper:true,lineHeight:1.01});
    line(ctx,65,432,655,432,p.accent,3);
    drawStages(ctx,stages,{x:65,y:457,w:590,rowH:125,gap:24,preset,age,motion});
  }else{
    textBox(ctx,label,{x:65,y:230,w:590,h:160,size:69,min:31,preset,color:p.fg,maxLines:2,lineHeight:1.03});
    const n=Math.max(1,stages.length),gap=14,w=(590-gap*(n-1))/n;
    stages.forEach((text,i)=>{const a=motion?ease((age-.15*i)/.4):1;ctx.save();ctx.globalAlpha*=a;ctx.translate(0,(1-a)*18);const x=65+i*(w+gap),y=465+(i%2)*26;
      ctx.shadowColor='rgba(92,64,58,.12)';ctx.shadowBlur=24;ctx.shadowOffsetY=8;fillRound(ctx,x,y,w,310,18,'rgba(255,255,255,.96)');ctx.shadowColor='transparent';
      fillRound(ctx,x+18,y+20,45,45,14,'rgba(222,119,100,.12)');ctx.fillStyle=p.accent;ctx.font=sans(18);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1).padStart(2,'0'),x+40,y+42);
      textBox(ctx,text,{x:x+19,y:y+105,w:w-38,h:160,size:39,min:20,preset,color:p.fg,maxLines:3});ctx.restore();});
  }
}
function quoteScene(ctx,g,age,motion,preset){
  const p=C[preset],label=String(g.label||'').trim();
  if(preset==='tech'){
    ctx.save();ctx.translate(360,635);ctx.rotate(-.035);fillRound(ctx,-290,-265,580,525,24,'rgba(29,26,27,.96)');strokeRound(ctx,-290,-265,580,525,24,'rgba(255,158,112,.45)',2);
    smallTag(ctx,'Фраза',-253,-225,preset);line(ctx,-253,-186,253,-186,'rgba(255,255,255,.14)',1);
    textBox(ctx,label,{x:-252,y:-125,w:505,h:275,size:66,min:31,preset,color:p.fg,maxLines:4,lineHeight:1.06});progressLine(ctx,-253,185,505,ease(age/.8),p.accent,'rgba(255,255,255,.15)');ctx.restore();
  }else if(preset==='red'){
    accentHeadline(ctx,label,65,315,590,410,90,preset);line(ctx,65,795,655,795,p.accent,3);ctx.fillStyle=p.accent;ctx.fillRect(65,793,180*ease(age/.7),6);
  }else if(preset==='light'){
    ctx.save();ctx.shadowColor='rgba(102,77,72,.13)';ctx.shadowBlur=30;ctx.shadowOffsetY=14;fillRound(ctx,65,320,590,520,26,'rgba(255,255,255,.96)');ctx.restore();
    ctx.fillStyle=p.accent;ctx.font='italic 160px Georgia, serif';ctx.textBaseline='top';ctx.fillText('“',100,355);
    textBox(ctx,label,{x:101,y:500,w:510,h:260,size:70,min:30,preset,color:p.fg,maxLines:4,lineHeight:1.06});
  }else{
    ctx.fillStyle=p.accent;ctx.font='italic 220px Georgia, serif';ctx.textBaseline='top';ctx.fillText('“',65,300);
    textBox(ctx,label,{x:68,y:495,w:585,h:330,size:90,min:32,preset,color:p.fg,maxLines:4,lineHeight:1.06});line(ctx,68,925,480,925,p.accent,3);
  }
}
function drawScene(ctx,active,sourceTime,preset,motion,images,motionStyle){
  const g=active.item,age=sourceTime-active.start,d=clamp(Number(g.duration)||2.8,.4,12),a=motion?Math.min(ease(age/.35),smooth((d-age)/.25)):1;
  const pic=images.find(i=>i.id===g.assetId)?.image;if(g.kind==='image'&&!pic)return;
  const p=C[preset],label=String(g.label||'').trim();ctx.save();ctx.globalAlpha=a;drawBackground(ctx,preset,false);ctx.globalAlpha=a;
  smallTag(ctx,kindName(g),65,120,preset);line(ctx,65,157,655,157,preset==='light'?'rgba(65,55,52,.2)':'rgba(255,255,255,.25)',1.5);ctx.fillStyle=p.accent;ctx.fillRect(65,155,105,4);
  const reveal=motion?ease((age-.08)/.45):1;
  const spring=motion && motionStyle==='dynamic' ? springProgress(Math.max(0,age-.08)) : 1;
  ctx.save();ctx.globalAlpha*=reveal;ctx.translate(0,(1-reveal)*18+(1-spring)*15);
  if(g.kind==='number'){
    const v=presentedValue(g.value,age,motion);ctx.font=sans(v.length>6?125:190);ctx.fillStyle=p.accent;ctx.textBaseline='top';ctx.textAlign='left';ctx.fillText(v,63,340,590);
    textBox(ctx,label,{x:65,y:565,w:590,h:170,size:64,min:30,preset,color:p.fg,maxLines:3,lineHeight:1.05});
    const m=String(g.value||'').match(/^(\d+(?:[.,]\d+)?)%$/);if(m)progressLine(ctx,66,820,588,clamp(Number(m[1].replace(',','.'))/100,0,1)*(motion?ease(age/.8):1),p.accent,preset==='light'?'rgba(65,55,52,.18)':'rgba(255,255,255,.15)');
  }else if(g.kind==='diagram'){
    diagramScene(ctx,g,age,motion,preset);
  }else if(g.kind==='image'){
    textBox(ctx,label,{x:65,y:230,w:590,h:140,size:68,min:30,preset,color:p.fg,maxLines:2,lineHeight:1.03});
    fillRound(ctx,65,410,590,555,18,preset==='light'?'rgba(255,255,255,.95)':'rgba(255,255,255,.06)');imageIn(ctx,pic,75,420,570,535,12);
  }else if(g.kind==='quote'){
    quoteScene(ctx,g,age,motion,preset);
  }else{
    fillRound(ctx,66,330,210,210,32,preset==='light'?'rgba(255,255,255,.95)':'rgba(255,255,255,.06)');drawIcon(ctx,g.icon||'spark',116,380,110,p.accent);
    textBox(ctx,label,{x:65,y:630,w:590,h:250,size:78,min:32,preset,color:p.fg,maxLines:3,lineHeight:1.05});
  }
  ctx.restore();
  line(ctx,65,1100,655,1100,preset==='light'?'rgba(65,55,52,.17)':'rgba(255,255,255,.16)',1);ctx.restore();
}
export function drawOverlay(ctx,opts,clear=true){
  const {preset,headline,outputT,outputDuration,sourceTime,cue,cueTime,style,graphics,srt,images=[],captionPosition}=opts;
  if(clear)ctx.clearRect(0,0,FW,FH);const state=compositionState(preset,opts),active=state.active,base=state.base;
  if(active?.item.layout==='scene'){
    drawScene(ctx,active,sourceTime,base,state.motion,images,state.motionStyle);
    if(cue)drawCaptions(ctx,cue,cueTime,preset,captionPosition,{...state,fullScene:true,intro:0,graphic:0});
    return;
  }
  chrome(ctx,base,state,outputT,outputDuration);introTitle(ctx,base,headline,state,outputT,outputDuration);
  drawGraphic(ctx,active,sourceTime,base,state,images);if(cue)drawCaptions(ctx,cue,cueTime,preset,captionPosition,{...state,heroTitle:!!String(headline||'').trim()&&outputT<3.83});
}
export function drawComposition(ctx,sample,sourceT,outputT,settings,styleAt,getCue){
  const {preset,style,start,end,manual,srt,outputDuration,mode,frameZoom,frameX,frameY}=settings;
  const opts={...settings,sourceTime:start+sourceT,outputT},rect=rectFor(preset,opts),effect=styleAt(style,outputT);
  const geom=frameGeometry(sample.displayWidth,sample.displayHeight,mode,frameZoom,frameX,frameY,rect.w/rect.h);
  drawBackground(ctx,preset);ctx.save();rounded(ctx,rect.x,rect.y,rect.w,rect.h,rect.r);ctx.clip();ctx.fillStyle='#090b0f';ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
  ctx.translate(rect.x+rect.w/2,rect.y+rect.h/2);ctx.scale(effect.zoom,effect.zoom);ctx.filter=effect.filter;
  sample.draw(ctx,-rect.w/2+geom.left*rect.w,-rect.h/2+geom.top*rect.h,geom.w*rect.w,geom.h*rect.h);ctx.restore();
  const cueTime=srt?start+sourceT:outputT,cue=srt?getCue(manual,srt,cueTime,start,end):getCue(manual,null,cueTime,0,outputDuration);
  drawOverlay(ctx,{...opts,cue,cueTime},false);
}
