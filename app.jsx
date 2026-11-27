import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Input,
  ALL_FORMATS,
  BlobSource,
  Output,
  BufferTarget,
  Mp4OutputFormat,
  Conversion,
  canEncodeAudio,
  VideoSample,
  AudioSample,
} from "mediabunny";
import { registerAacEncoder } from "@mediabunny/aac-encoder";
import { PRESETS, CAPTION_POSITIONS, rectFor, drawBackground, drawOverlay, drawComposition, graphicTimes } from "./visuals.js";
import { createASRWorker, wordsToCues, formatSrt, frameGeometry } from "./asr.js";
import { planStoryboard } from "./director.js";
import { reviewEdit } from "./quality.js";
import { decodeVoice, outputToSource, voiceMapKey, makeVoiceMix, muxMixedAudio } from "./voice.js";
import { LOCAL_VOICES, requestLocalVoice } from "./local-tts.js";
import { createProjectBlob, readProjectFile, normalizeProjectSettings } from "./project.js";
import { planTakes, takesToSilences } from "./takes.js";
import { GHOST_RECIPES, GHOST_STYLES, styleById, recipeById, planGhostEdit, buildApprovalSheet, qaGhost, exampleCues } from "./ghost.js";
import { nearestBeatOutput } from "./beat.js";
import { convertVideo, MAX_CONVERSION_BYTES } from "./converter.js";
import {
  LuClapperboard,
  LuUpload,
  LuPlay,
  LuPause,
  LuScissors,
  LuScan,
  LuDownload,
  LuVideo,
  LuSparkles,
 LuFileVideo,
 LuImagePlus,
  LuCaptions,
  LuWandSparkles,
  LuX,
  LuFileText,
  LuHash,
  LuWorkflow,
  LuCircleCheck,
  LuLightbulb,
  LuChartNoAxesColumnIncreasing,
  LuVolume2,
  LuMusic2,
  LuFolderOpen,
  LuSave,
  LuArrowRight,
} from "react-icons/lu";

const W = 720,
  H = 1280,
  clamp = (n, min, max) => Math.min(max, Math.max(min, n));
function time(t) {
  if (!Number.isFinite(t)) return "0:00";
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function preciseTime(t) {
  const m = Math.floor(Math.max(0, t) / 60), sec = Math.max(0, t) - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
}
function styleAt(style, t) {
  if (style === "none") return { zoom: 1, filter: "none" };
  if (style === "soft")
    return {
      zoom:
        1.008 +
        0.018 * (0.5 - 0.5 * Math.cos((2 * Math.PI * Math.max(0, t)) / 10)),
      filter: "saturate(1.03) contrast(1.02)",
    };
  // Continuous, deliberately restrained camera movement without zoom resets.
  const wave = .5 - .5 * Math.cos(2 * Math.PI * Math.max(0, t) / 7.5);
  return { zoom: 1.01 + .035 * wave, filter: "saturate(1.06) contrast(1.03)" };
}
// Non-AI edit map: both audio and video use the same cut intervals.
function selectedCuts(silences, start, end) {
  const ranges = [];
  for (const c of silences) {
    if (!c.enabled || c.to <= start || c.from >= end) continue;
    const a = Math.ceil((Math.max(start, c.from) - start) * 30 - 1e-6) / 30;
    const b = Math.floor((Math.min(end, c.to) - start) * 30 + 1e-6) / 30;
    if (b - a >= 1 / 30 - 1e-7) ranges.push({from: a, to: b});
  }
  return ranges.sort((a, b) => a.from - b.from);
}
function mapTime(t, cuts) {
  let removed = 0;
  for (const c of cuts) removed += Math.max(0, Math.min(t, c.to) - c.from);
  return Math.max(0, t - removed);
}
function isInCut(t, cuts) { return cuts.some((c) => t >= c.from - 1e-7 && t < c.to - 1e-7); }
function audioPieces(sample, cuts) {
  const t = sample.timestamp, sr = sample.sampleRate;
  const n = sample.numberOfFrames, channels = sample.numberOfChannels;
  let kept = [[0, n]];
  for (const c of cuts) {
    const a = Math.max(0, Math.min(n, Math.ceil((c.from - t) * sr - 1e-6)));
    const b = Math.max(0, Math.min(n, Math.ceil((c.to - t) * sr - 1e-6)));
    if (b <= a) continue;
    kept = kept.flatMap(([x, y]) => {
      if (b <= x || a >= y) return [[x, y]];
      const out = []; if (a > x) out.push([x, a]); if (b < y) out.push([b, y]); return out;
    });
  }
  if (!kept.length) return null;
  if (kept.length === 1 && kept[0][0] === 0 && kept[0][1] === n) {
    sample.setTimestamp(mapTime(t, cuts));
    return sample;
  }
  return kept.map(([x, y]) => {
    const count = y - x;
    const data = new Float32Array(count * channels);
    for (let ch = 0; ch < channels; ch++) {
      sample.copyTo(data.subarray(ch * count, (ch + 1) * count), {
        planeIndex: ch, format: "f32-planar", frameOffset: x, frameCount: count,
      });
    }
    return new AudioSample({data, format: "f32-planar", numberOfChannels: channels,
      sampleRate: sr, timestamp: mapTime(t + x / sr, cuts)});
  });
}
function findQuietRanges(buffer) {
  const sr = buffer.sampleRate, channels = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
  const hop = Math.max(1, Math.round(sr * .02)), frames = buffer.length;
  const threshold = Math.pow(10, -40 / 20), runs = [];
  let quietStart = null, loudBlocks = 0;
  function finish(endIndex) {
    if (quietStart === null) return;
    const from = quietStart / sr, to = Math.min(buffer.duration, endIndex / sr);
    if (to - from >= .8) {
      const a = from + .2, b = to - .2;
      if (b > a + .08) runs.push({from: a, to: b, enabled: true, id: runs.length + 1});
    }
    quietStart = null;
  }
  for (let i = 0; i < frames; i += hop) {
    const n = Math.min(frames, i + hop); let highest = 0;
    for (const data of channels) {
      let sum = 0, count = 0;
      for (let j = i; j < n; j += 4) { sum += data[j] * data[j]; count++; }
      highest = Math.max(highest, Math.sqrt(sum / Math.max(count, 1)));
    }
    if (highest < threshold) { if (quietStart === null) quietStart = i; }
    else { loudBlocks++; finish(i); }
  }
  finish(frames);
  // Never turn an inaudible/no-track video into an almost empty clip.
  if (loudBlocks < 10) return {silent: true, ranges: []};
  return {silent: false, ranges: runs};
}
function chunkPhrase(text, max = 28) {
  const words = text.trim().split(/\s+/).filter(Boolean),
    out = [];
  let line = "";
  for (const w of words) {
    const next = line ? line + " " + w : w;
    if (next.length > max && line) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}
function parseSrt(text) {
  const blocks = text
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .trim()
    .split(/\n\s*\n/);
  const cues = [];
  function stamp(s) {
    const m = s.trim().match(/^(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{1,3})/);
    if (!m) return null;
    return (
      +(m[1] || 0) * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, "0") / 1000
    );
  }
  for (const block of blocks) {
    const lines = block.split("\n");
    const k = lines.findIndex((x) => x.includes("-->"));
    if (k < 0) continue;
    const bits = lines[k].split("-->");
    const from = stamp(bits[0]),
      to = stamp(bits[1]);
    const body = lines
      .slice(k + 1)
      .join(" ")
      .replace(/<[^>]*>/g, "")
      .replace(/\{\\[^}]*\}/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (from !== null && to !== null && to > from && body) {
      const parts = chunkPhrase(body);
      let passed = 0;
      const count = parts.reduce((n, part) => n + part.split(/\s+/).length, 0);
      parts.forEach((part) => {
        const n = part.split(/\s+/).length;
        cues.push({ id: Math.random().toString(36).slice(2), start: from + (to - from) * passed / count,
          end: from + (to - from) * (passed + n) / count, text: part });
        passed += n;
      });
    }
  }
  return cues.sort((a, b) => a.start - b.start);
}
function getCue(manual, srt, sourceTime, start, end) {
  if (sourceTime < start || sourceTime >= end || end <= start) return null;
  if (srt) {
    const cue = srt.cues.find(
      (c) => sourceTime >= c.start && sourceTime < c.end,
    );
    if (!cue) return null;
    return cue;
  }
  const lines = manual.split("\n").flatMap((x) => chunkPhrase(x));
  if (!lines.length) return null;
  const size = (end - start) / lines.length,
    idx = Math.min(lines.length - 1, Math.floor((sourceTime - start) / size));
  return {
    text: lines[idx],
    start: start + idx * size,
    end: start + (idx + 1) * size,
  };
}
function newGraphic(kind, at, assetId = "") {
  return {id: Math.random().toString(36).slice(2), kind, icon: "spark", label: "",
    value: "", layout: "card", trigger: "time", at: Number(Math.max(0, at).toFixed(1)),
    duration: 2.8, keyword: "", assetId};
}
function App() {
  const videoRef = useRef(null),
    videoInput = useRef(null),
    anyVideoInput = useRef(null),
    videoImportAbort = useRef(null),
    videoHelpRef = useRef(null),
    projectDirtyRef = useRef(false),
    imageInput = useRef(null),
    srtInput = useRef(null),
    stageRef = useRef(null),
    backgroundRef = useRef(null),
    overlayRef = useRef(null),
    abortRef = useRef(null),
    asrWorkerRef = useRef(null),
    asrCancelRef = useRef(null),
    asrToken = useRef(0),
    busyRef = useRef(false),
    analysisToken = useRef(0),
    draftToken = useRef(0),
    draftRef = useRef(false),
    autoHeadlineRef = useRef(null),
    latestRef = useRef(null),
    imagesRef = useRef([]),
    voiceAudioRef = useRef(null),
    voiceInput = useRef(null),
    voiceAbortRef = useRef(null),
    voiceToken = useRef(0),
    musicAudioRef = useRef(null),
    musicInput = useRef(null),
    musicToken = useRef(0),
    sourceToken = useRef(0),
    quickToken = useRef(0),
    projectInput = useRef(null),
    tabsRef = useRef(null),
    pendingRestoreRef = useRef(null),
    markRestoredRef = useRef(false);
  const [source, setSource] = useState(null),
    [activeTab, setActiveTab] = useState("load"),
    [resolution, setResolution] = useState(1080),
    [ready, setReady] = useState(false),
    [duration, setDuration] = useState(0),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(0),
    [startDraft, setStartDraft] = useState(""),
    [endDraft, setEndDraft] = useState(""),
    [position, setPosition] = useState(0),
    [playing, setPlaying] = useState(false),
    [mode, setMode] = useState("crop"),
    [videoSize, setVideoSize] = useState({w: 720, h: 1280}),
    [frameZoom, setFrameZoom] = useState(1),
    [frameX, setFrameX] = useState(50),
    [frameY, setFrameY] = useState(50),
    [style, setStyle] = useState(() =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "none"
        : "dynamic",
    ),
    [manual, setManual] = useState(""),
    [preset, setPreset] = useState("premium"),
    [ghostStyle, setGhostStyle] = useState("clean"),
    [ghostRecipe, setGhostRecipe] = useState("clean"),
    [textEffect, setTextEffect] = useState("clean"),
    [kinetic, setKinetic] = useState("headline"),
    [film, setFilm] = useState("none"),
    [approved, setApproved] = useState(false),
    [captionPosition, setCaptionPosition] = useState("normal"),
    [headline, setHeadline] = useState(""),
    [srt, setSrt] = useState(null),
    [images, setImages] = useState([]),
    [graphics, setGraphics] = useState([]),
    [fontsReady, setFontsReady] = useState(false),
    [language, setLanguage] = useState("russian"),
    [asrBusy, setAsrBusy] = useState(false),
    [asrInfo, setAsrInfo] = useState(null),
    [busy, setBusy] = useState(false),
    [pct, setPct] = useState(0),
    [result, setResult] = useState(null),
    [message, setMessage] = useState(null),
    [silences, setSilences] = useState([]),
    [analysisBusy, setAnalysisBusy] = useState(false),
    [analysisInfo, setAnalysisInfo] = useState(null),
    [draftBusy, setDraftBusy] = useState(false),
    [draftInfo, setDraftInfo] = useState(null),
    [safeGuide, setSafeGuide] = useState(false),
    [takesPlan, setTakesPlan] = useState(null),
    [faceY, setFaceY] = useState(29),
    [autosaved, setAutosaved] = useState(false),
    [voice, setVoice] = useState(null),
    [voiceTab, setVoiceTab] = useState("generate"),
    [voiceText, setVoiceText] = useState(""),
    [voicePreset, setVoicePreset] = useState("F1"),
    [voiceBusy, setVoiceBusy] = useState(false),
    [voiceInfo, setVoiceInfo] = useState(null),
    [voiceOffset, setVoiceOffset] = useState(0),
    [voiceVolume, setVoiceVolume] = useState(90),
    [originalVolume, setOriginalVolume] = useState(35),
    [asrSource, setAsrSource] = useState("source"),
    [music, setMusic] = useState(null),
    [musicVolume, setMusicVolume] = useState(20),
    [musicBpm, setMusicBpm] = useState(""),
    [firstBeat, setFirstBeat] = useState(0),
    [beatInfo, setBeatInfo] = useState(null),
    [musicBusy, setMusicBusy] = useState(false),
    [musicInfo, setMusicInfo] = useState(null),
    [projectBusy, setProjectBusy] = useState(false),
    [projectInfo, setProjectInfo] = useState(null),
    [savedSignature, setSavedSignature] = useState(""),
    [confirmReplace, setConfirmReplace] = useState(null),
    [quickBusy, setQuickBusy] = useState(false),
    [quickInfo, setQuickInfo] = useState(null),
    [videoImportBusy, setVideoImportBusy] = useState(false),
    [videoImportStatus, setVideoImportStatus] = useState(""),
    [videoImportProgress, setVideoImportProgress] = useState(null),
    [videoCandidate, setVideoCandidate] = useState(null),
    [videoInfo, setVideoInfo] = useState(null),
    [installPrompt, setInstallPrompt] = useState(() => window.__kadrInstallPrompt || null),
    [installHelp, setInstallHelp] = useState(false),
    [isInstalled, setIsInstalled] = useState(() =>
      window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true);
  latestRef.current = {source, ready, srt, graphics, headline, start, end, voice};
  const projectSettings = useMemo(() => ({
    start,end,resolution,mode,frameZoom,frameX,frameY,style,manual,preset,captionPosition,ghostStyle,ghostRecipe,textEffect,kinetic,film,
    headline,autoHeadline:autoHeadlineRef.current || "",srt,graphics,silences,language,asrSource,
    voiceText,voicePreset,voiceOffset,voiceVolume,originalVolume,musicVolume,musicBpm,firstBeat,
  }), [start,end,resolution,mode,frameZoom,frameX,frameY,style,manual,preset,captionPosition,ghostStyle,ghostRecipe,textEffect,kinetic,film,
    headline,srt,graphics,silences,language,asrSource,voiceText,voicePreset,voiceOffset,
    voiceVolume,originalVolume,musicVolume,musicBpm,firstBeat]);
  const projectSignature = useMemo(() => JSON.stringify({
    settings:projectSettings,
    video:source ? [source.name,source.blob?.size,source.blob?.type] : null,
    voice:voice ? [voice.id,voice.name,voice.blob?.size] : null,
    music:music ? [music.id,music.name,music.blob?.size] : null,
    images:images.map(i=>[i.id,i.name]),
  }), [projectSettings,source,voice,music,images]);
  const projectDirty = ready && projectSignature !== savedSignature;
  projectDirtyRef.current = projectDirty;
  const captionY = CAPTION_POSITIONS[captionPosition] ?? .8,
    captionHitsFace = Math.abs(captionY - faceY / 100) < .18,
    effectiveCaptionPosition = captionHitsFace ? (faceY < 55 ? "low" : "high") : captionPosition;
  const cuts = useMemo(() => selectedCuts(silences, start, end), [silences, start, end]);
  const visibleSilences = useMemo(() => silences.filter(c => c.to > start && c.from < end), [silences, start, end]);
  const clipDuration = Math.max(0, end - start);
  const outputDuration = mapTime(clipDuration, cuts);
  const currentVoiceMapKey = voiceMapKey(voice, start, end, voiceOffset, cuts);
  const review = useMemo(() => reviewEdit({
    start, end, headline, cues: srt?.cues || [],
    cuts: cuts.map(c => ({from: c.from + start, to: c.to + start})),
    graphics: graphics.map(g => ({...g, times: graphicTimes(g, srt),
      hasImage: images.some(i => i.id === g.assetId && i.image)})),
  }), [start, end, headline, srt, cuts, graphics, images]);
  const absoluteCuts = useMemo(() => cuts.map(c => ({from:c.from + start, to:c.to + start})), [cuts,start]);
  const approvalSheet = useMemo(() => buildApprovalSheet({cuts:absoluteCuts, graphics, cues:srt?.cues || [], start:0}),
    [absoluteCuts,graphics,srt]);
  const ghostWarnings = useMemo(() => qaGhost({cuts:absoluteCuts,graphics,cues:srt?.cues || [],start,end,
    faceY,captionPosition:effectiveCaptionPosition,approved}),
    [absoluteCuts,graphics,srt,start,end,faceY,effectiveCaptionPosition,approved]);
  useEffect(() => {
    if (ready && markRestoredRef.current) {
      markRestoredRef.current = false;
      setSavedSignature(projectSignature);
    }
  }, [ready,projectSignature]);
  useEffect(() => {
    if (!projectDirty) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload",warn);
    return () => window.removeEventListener("beforeunload",warn);
  }, [projectDirty]);
  useEffect(() => {
    if (!ready) return;
    setAutosaved(false);
    const timer = setTimeout(() => { try { localStorage.setItem("kadr-autosave-v2", JSON.stringify({settings:projectSettings, videoName:source?.name || ""})); setAutosaved(true); } catch {} }, 1000);
    return () => clearTimeout(timer);
  }, [projectSettings, ready]);
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem("kadr-autosave-v2") || "null")?.settings; if (!s) return;
      if (s.preset) setPreset(s.preset); if (s.ghostStyle) setGhostStyle(s.ghostStyle); if (s.ghostRecipe) setGhostRecipe(s.ghostRecipe); if (s.textEffect) setTextEffect(s.textEffect); if (s.kinetic) setKinetic(s.kinetic); if (s.film) setFilm(s.film); if (s.captionPosition) setCaptionPosition(s.captionPosition);
      if (s.style) setStyle(s.style); if (s.mode) setMode(s.mode); if (typeof s.headline === "string") setHeadline(s.headline);
      if (typeof s.manual === "string") setManual(s.manual); if (s.language) setLanguage(s.language);
      if (typeof s.voiceText === "string") setVoiceText(s.voiceText); if (s.voicePreset) setVoicePreset(s.voicePreset);
      if (Number.isFinite(s.frameZoom)) setFrameZoom(s.frameZoom); if (Number.isFinite(s.frameX)) setFrameX(s.frameX); if (Number.isFinite(s.frameY)) setFrameY(s.frameY);
      setAutosaved(true);
    } catch {}
  }, []);
  useEffect(() => {
    const available = () => setInstallPrompt(window.__kadrInstallPrompt || null);
    const installed = () => { window.__kadrInstallPrompt = null; setInstallPrompt(null); setIsInstalled(true); };
    window.addEventListener("kadr-install-ready", available);
    window.addEventListener("appinstalled", installed);
    available();
    return () => {
      window.removeEventListener("kadr-install-ready", available);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  useEffect(() => {
    if (videoCandidate && !videoCandidate.ready && !videoImportBusy) {
      const frame = requestAnimationFrame(() =>
        videoHelpRef.current?.scrollIntoView({behavior:"smooth",block:"center"}));
      return () => cancelAnimationFrame(frame);
    }
  }, [videoCandidate,videoImportBusy]);
  useEffect(() => {
    let live = true;
    Promise.all([document.fonts.load('800 42px "Kadr Manrope"'),
      document.fonts.load('italic 600 59px "Kadr Playfair"')])
      .then(() => { if (live) setFontsReady(true); }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => () => {
    videoImportAbort.current?.abort();
    asrToken.current++;
    asrCancelRef.current?.();
    asrWorkerRef.current?.terminate();
    voiceToken.current++;
    voiceAbortRef.current?.abort();
    musicToken.current++;
  }, []);
  useEffect(() => () => {
    if (voice?.url) URL.revokeObjectURL(voice.url);
  }, [voice]);
  useEffect(() => () => {
    if (music?.url) URL.revokeObjectURL(music.url);
  }, [music]);
  useEffect(
    () => () => {
      if (source?.url?.startsWith("blob:")) URL.revokeObjectURL(source.url);
    },
    [source],
  );
  useEffect(
    () => () => {
      if (result?.url) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(
    () => () =>
      imagesRef.current.forEach((x) => {
        if (x.url.startsWith("blob:")) URL.revokeObjectURL(x.url);
      }),
    [],
  );
  useEffect(() => {
    if (!playing) return;
    let id;
    const loop = () => {
      const v = videoRef.current;
      if (v) {
        const local = v.currentTime - start;
        const cut = cuts.find((c) => local >= c.from && local < c.to - .01);
        if (cut) v.currentTime = start + cut.to;
        if (v.currentTime >= end) v.pause();
        setPosition(v.currentTime);
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [playing, cuts, start, end]);
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = voice || music ? originalVolume / 100 : 1;
    if (voiceAudioRef.current) voiceAudioRef.current.volume = voiceVolume / 100;
    if (musicAudioRef.current) musicAudioRef.current.volume = musicVolume / 100;
  }, [voice, music, originalVolume, voiceVolume, musicVolume, ready]);
  useEffect(() => {
    const a = voiceAudioRef.current, v = videoRef.current;
    if (!a || !v) return;
    if (!voice || !playing) {
      a.pause();
      return;
    }
    let live = true, raf = 0, pending = false, blocked = false;
    const sync = () => {
      if (!live) return;
      const outputT = mapTime(Math.max(0, v.currentTime - start), cuts);
      const t = outputT - voiceOffset;
      const active = v.currentTime >= start && v.currentTime < end && t >= 0 && t < voice.duration;
      if (active) {
        if (Math.abs(a.currentTime - t) > .18 || (a.paused && !pending)) {
          try { a.currentTime = Math.max(0, t); } catch {}
        }
        if (a.paused && !pending && !blocked) {
          pending = true;
          a.play().catch(() => {
            if (live) {
              blocked = true;
              setVoiceInfo({error:true, text:"Браузер заблокировал звук. Нажми паузу и воспроизведение ещё раз."});
            }
          }).finally(() => { pending = false; });
        }
      } else if (!a.paused) a.pause();
      raf = requestAnimationFrame(sync);
    };
    sync();
    return () => { live = false; cancelAnimationFrame(raf); a.pause(); };
  }, [voice, playing, voiceOffset, start, end, cuts]);
  useEffect(() => {
    const a = musicAudioRef.current, v = videoRef.current;
    if (!a || !v) return;
    if (!music || !playing) { a.pause(); return; }
    let live = true, raf = 0, pending = false, blocked = false;
    const sync = () => {
      if (!live) return;
      const t = mapTime(Math.max(0, v.currentTime - start), cuts);
      const active = v.currentTime >= start && v.currentTime < end && t < music.duration;
      if (active) {
        if (Math.abs(a.currentTime - t) > .18 || (a.paused && !pending)) {
          try { a.currentTime = Math.max(0, t); } catch {}
        }
        if (a.paused && !pending && !blocked) {
          pending = true;
          a.play().catch(() => {
            if (live) {
              blocked = true;
              setMusicInfo({error:true, text:"Браузер заблокировал музыку. Нажми паузу и воспроизведение ещё раз."});
            }
          }).finally(() => { pending = false; });
        }
      } else if (!a.paused) a.pause();
      raf = requestAnimationFrame(sync);
    };
    sync();
    return () => { live = false; cancelAnimationFrame(raf); a.pause(); };
  }, [music, playing, start, end, cuts]);
  function invalidate() {
    setResult(null);
    setMessage(null);
    setApproved(false);
  }
  function stopAsr(showNotice = true) {
    asrToken.current++;
    asrCancelRef.current?.();
    asrWorkerRef.current?.terminate();
    asrWorkerRef.current = null;
    setAsrBusy(false);
    if (showNotice) setAsrInfo({text: "Распознавание отменено. Предыдущие субтитры сохранены."});
  }
  function requestReplace(action) {
    if (busy || projectBusy || asrBusy || voiceBusy || musicBusy || analysisBusy || draftBusy || quickBusy || videoImportAbort.current) return;
    if (projectDirtyRef.current) setConfirmReplace(() => action);
    else action();
  }
  async function installApp() {
    const prompt = window.__kadrInstallPrompt;
    if (!prompt) { setInstallHelp(v => !v); return; }
    try { await prompt.prompt(); await prompt.userChoice; } catch { setInstallHelp(true); }
    window.__kadrInstallPrompt = null;
    setInstallPrompt(null);
  }
  function goTab(tab) {
    setActiveTab(tab);
    requestAnimationFrame(() => tabsRef.current?.scrollIntoView({behavior:"smooth",block:"start"}));
  }
  async function saveProject() {
    if (!ready || !source?.blob || projectBusy || busy || asrBusy || voiceBusy || musicBusy || analysisBusy || draftBusy || quickBusy) return;
    const signature = projectSignature, settings = projectSettings;
    setProjectBusy(true);
    setProjectInfo({text:"Подготавливаем файл проекта…"});
    try {
      const files = [{role:"video",name:source.name,blob:source.blob}];
      if (voice) files.push({role:"voice",id:voice.id,name:voice.name,blob:voice.blob});
      if (music) files.push({role:"music",id:music.id,name:music.name,blob:music.blob});
      for (const image of images) {
        const response = await fetch(image.url);
        if (!response.ok) throw new Error("Не удалось сохранить одну из картинок. Попробуй добавить её заново.");
        files.push({role:"image",id:image.id,name:image.name,blob:await response.blob()});
      }
      const blob = createProjectBlob(settings,files);
      const name = String(source.name || "проект").replace(/\.[^.]+$/,"")
        .replace(/[<>:"/\\|?*\x00-\x1f]/g,"_").slice(0,70) || "проект";
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = `Кадр — ${name}.kadr`; a.click();
      setTimeout(() => URL.revokeObjectURL(url),60000);
      setSavedSignature(signature);
      setProjectInfo({text:"Проект подготовлен к скачиванию. Проверь папку «Загрузки». Чтобы продолжить позже, нажми «Открыть проект»."});
    } catch (error) {
      setProjectInfo({error:true,text:error?.message || "Не удалось сохранить проект. Проверь свободное место и попробуй ещё раз."});
    } finally { setProjectBusy(false); }
  }
  function probeVideo(blob, {signal} = {}) {
    return new Promise((resolve,reject) => {
      const element = document.createElement("video"), url = URL.createObjectURL(blob);
      let done = false;
      const finish = (error,value) => {
        if (done) return;
        done = true; clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        element.removeAttribute("src"); element.load(); URL.revokeObjectURL(url);
        if (error) reject(error); else resolve(value);
      };
      const onAbort = () => finish(new DOMException("Проверка остановлена.", "AbortError"));
      const timer = setTimeout(() => finish(new Error("Видео внутри проекта не открылось. Попробуй Chrome или Edge.")),20000);
      element.preload = "metadata";
      element.onloadedmetadata = () => Number.isFinite(element.duration) && element.duration > 0 && element.videoWidth
        ? finish(null,element.duration) : finish(new Error("Не удалось определить длительность видео в проекте."));
      element.onerror = () => finish(new Error("Браузер не смог открыть видео внутри проекта."));
      signal?.addEventListener("abort", onAbort, {once:true});
      if (signal?.aborted) { onAbort(); return; }
      element.src = url; element.load();
    });
  }
  async function probeEditCodecs(blob, signal) {
    // A browser may display a video but be unable to decode its audio or video
    // when exporting. Detect that before the user spends time editing.
    if (!window.VideoDecoder || !window.VideoEncoder) return null;
    const input = new Input({source:new BlobSource(blob),formats:ALL_FORMATS});
    try {
      const video = await input.getPrimaryVideoTrack();
      if (!video) throw new Error("В файле не найдена подходящая видеодорожка. Попробуй преобразовать его.");
      if (!(await video.canDecode())) throw new Error("Изображение открывается, но его кодек не подходит для экспорта. Попробуй преобразовать видео.");
      const audio = await input.getPrimaryAudioTrack();
      if (audio && !(await audio.canDecode())) {
        if (!window.AudioDecoder) return "Этот браузер может не поддерживать звук при экспорте. Для надёжной работы попробуй Chrome или Edge на компьютере.";
        throw new Error("Изображение открывается, но звуковая дорожка не подходит для экспорта. Попробуй преобразовать видео.");
      }
      if (signal?.aborted) throw new DOMException("Проверка остановлена.", "AbortError");
      return null;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      if (/не найдена подходящая|не подходит для экспорта/.test(error?.message || "")) throw error;
      throw new Error("Редактор не смог прочитать формат этого видео для экспорта. Попробуй его преобразовать.");
    } finally { input.dispose(); }
  }
  // Inspect the new file before replacing the current edit. A bad video must
  // never destroy a working project.
  function openPreparedVideo(candidate) {
    setVideoCandidate(candidate);
    const commit = () => {
      if (loadVideo(candidate.blob, candidate.name)) {
        setVideoCandidate(null);
        setVideoInfo(candidate.converted
          ? {text:"Видео преобразовано на устройстве. Проверь звук, цвет и поворот кадра." + (candidate.warning ? " " + candidate.warning : "")}
          : candidate.warning ? {error:true,text:candidate.warning} : null);
      }
    };
    if (projectDirtyRef.current) {
      setVideoInfo({text:"Видео готово к открытию. Текущий проект пока не изменён."});
      setConfirmReplace(() => commit);
    } else commit();
  }
  async function chooseVideoFile(file) {
    if (!file || videoImportAbort.current || projectBusy || busy || asrBusy ||
        voiceBusy || musicBusy || analysisBusy || draftBusy || quickBusy) return;
    if (videoInput.current) videoInput.current.value = "";
    if (anyVideoInput.current) anyVideoInput.current.value = "";
    if (!file.size) { setVideoInfo({error:true,text:"Файл пустой. Выбери другое видео."}); return; }
    const controller = new AbortController();
    videoImportAbort.current = controller;
    setVideoCandidate(null); setVideoInfo(null); setVideoImportProgress(null);
    setVideoImportStatus("Проверяем, может ли браузер открыть видео…");
    setVideoImportBusy(true);
    let nativePlayable = false;
    try {
      await probeVideo(file, {signal:controller.signal});
      nativePlayable = true;
      const warning = await probeEditCodecs(file,controller.signal);
      if (controller.signal.aborted) return;
      openPreparedVideo({blob:file,name:file.name || "Видео",converted:false,ready:true,warning});
    } catch (error) {
      if (controller.signal.aborted) {
        setVideoInfo({text:"Проверка остановлена. Текущий проект не изменён."});
      } else {
        setVideoCandidate({blob:file,name:file.name || "Видео",ready:false});
        setVideoInfo({error:true,text:nativePlayable
          ? error?.message || "Редактор не смог подготовить это видео для экспорта."
          : "Браузер не смог открыть это видео напрямую. Попробуй преобразовать его на устройстве."});
      }
    } finally {
      if (videoImportAbort.current === controller) {
        videoImportAbort.current = null;
        setVideoImportBusy(false); setVideoImportProgress(null);
      }
    }
  }
  async function convertCandidate() {
    const candidate = videoCandidate;
    if (!candidate?.blob || videoImportAbort.current) return;
    if (candidate.blob.size > MAX_CONVERSION_BYTES) {
      setVideoInfo({error:true,text:"Для встроенного преобразования выбери файл до 200 МБ. Большой ролик можно подготовить в HandBrake на компьютере."});
      return;
    }
    const controller = new AbortController();
    videoImportAbort.current = controller;
    setVideoImportBusy(true); setVideoImportProgress(null);
    setVideoImportStatus("Подготавливаем конвертер…");
    try {
      const output = await convertVideo(candidate.blob, {
        signal:controller.signal,
        onStatus:status => {
          setVideoImportStatus(status.text);
          setVideoImportProgress(Number.isFinite(status.progress) ? Math.round(status.progress * 100) : null);
        },
      });
      await probeVideo(output,{signal:controller.signal});
      const warning = await probeEditCodecs(output,controller.signal);
      if (controller.signal.aborted) return;
      const name = String(candidate.name || "Видео").replace(/\.[^.]+$/,"") + " — подготовлено.mp4";
      openPreparedVideo({blob:output,name,converted:true,ready:true,warning});
    } catch (error) {
      setVideoInfo(controller.signal.aborted
        ? {text:"Преобразование остановлено. Текущий проект не изменён."}
        : {error:true,text:error?.message || "Не удалось преобразовать видео. Попробуй Chrome или Edge на компьютере."});
    } finally {
      if (videoImportAbort.current === controller) {
        videoImportAbort.current = null;
        setVideoImportBusy(false); setVideoImportProgress(null);
      }
    }
  }
  async function openProject(file) {
    if (!file || projectBusy || busy || asrBusy || voiceBusy || musicBusy || analysisBusy || draftBusy || quickBusy) return;
    setProjectBusy(true);
    setProjectInfo({text:"Открываем проект…"});
    const urls = [];
    try {
      const parsed = await readProjectFile(file);
      const video = parsed.assets.find(a => a.role === "video");
      const d = await probeVideo(video.blob);
      const settings = normalizeProjectSettings(parsed.settings,d);
      const restoredImages = [];
      for (const item of parsed.assets.filter(a => a.role === "image")) {
        const url = URL.createObjectURL(item.blob); urls.push(url);
        const decoded = await decodeImage(url,item.name);
        restoredImages.push({...decoded,id:item.id});
      }
      const restoreAudio = async (role) => {
        const item = parsed.assets.find(a => a.role === role);
        if (!item) return null;
        const buffer = await decodeVoice(item.blob,{kind:role === "music" ? "музыки" : "озвучки"});
        const url = URL.createObjectURL(item.blob); urls.push(url);
        return {id:item.id || Math.random().toString(36).slice(2),blob:item.blob,buffer,
          url,duration:buffer.duration,name:item.name};
      };
      const restoredVoice = await restoreAudio("voice"), restoredMusic = await restoreAudio("music");
      if (!restoredVoice && settings.asrSource === "voice") settings.asrSource = "source";
      pendingRestoreRef.current = {settings,images:restoredImages,voice:restoredVoice,music:restoredMusic};
      if (!loadVideo(video.blob,video.name)) {
        pendingRestoreRef.current = null;
        throw new Error("Формат видео в проекте не поддерживается. Текущий монтаж не изменён.");
      }
      urls.length = 0; // URLs are now owned by pendingRestoreRef / React state.
    } catch (error) {
      urls.forEach(url => URL.revokeObjectURL(url));
      const reason = error?.message || "Не удалось открыть проект.";
      setProjectInfo({error:true,text:`${reason} Текущий монтаж не изменён.`});
    } finally {
      if (!pendingRestoreRef.current) setProjectBusy(false);
      if (projectInput.current) projectInput.current.value = "";
    }
  }
  function loadVideo(f, name) {
    if (!f) return;
    if (busyRef.current) return false;
    setVideoCandidate(null);
    setVideoInfo(null);
    sourceToken.current++;
    quickToken.current++;
    setQuickBusy(false);
    setQuickInfo(null);
    voiceToken.current++;
    voiceAbortRef.current?.abort();
    voiceAbortRef.current = null;
    setVoiceBusy(false);
    setVoice(null);
    setVoiceOffset(0);
    setVoiceInfo(null);
    musicToken.current++;
    setMusicBusy(false);
    setMusic(null);
    setMusicInfo(null);
    setMusicBpm("");
    setFirstBeat(0);
    setBeatInfo(null);
    setAsrSource("source");
    stopAsr(false);
    setAsrInfo(null);
    setSrt(null);
    setManual("");
    setGraphics([]);
    setImages(prev => {
      prev.forEach(item => { if (item.url?.startsWith("blob:")) URL.revokeObjectURL(item.url); });
      return [];
    });
    setHeadline("");
    setFrameZoom(1); setFrameX(50); setFrameY(50);
    analysisToken.current++;
    draftToken.current++;
    draftRef.current = false;
    setDraftBusy(false);
    setDraftInfo(null);
    setAnalysisBusy(false);
    setAnalysisInfo(null);
    setSilences([]);
    setTakesPlan(null);
    autoHeadlineRef.current = null;
    if (!pendingRestoreRef.current) setProjectInfo(null);
    videoRef.current?.pause();
    setReady(false);
    setDuration(0);
    setStart(0);
    setEnd(0);
    setStartDraft("");
    setEndDraft("");
    setPosition(0);
    setPlaying(false);
    setSavedSignature("");
    invalidate();
    setSource({
      url: URL.createObjectURL(f),
      name: name || f.name || "Видео",
      blob: f,
    });
    if (videoInput.current) videoInput.current.value = "";
    return true;
  }
  function decodeImage(url, name) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () =>
        resolve({ url, name, image, id: Math.random().toString(36).slice(2) });
      image.onerror = reject;
      image.src = url;
    });
  }
  async function loadDemo() {
    const requested = ++sourceToken.current;
    try {
      const blob = await (await fetch(window.DEMO_VIDEO)).blob();
      if (requested !== sourceToken.current) return;
      if (!loadVideo(blob, "Аквариум · пример.mp4")) return;
      const active = sourceToken.current;
      setAnalysisInfo({text: "В примере нет речи. Для автонарезки загрузи видео с голосом."});
      setManual("Маленький перерыв\nдля больших идей ✨");
      const sticker = await decodeImage(window.DEMO_STICKER,"Рыбка · пример");
      if (active !== sourceToken.current) return;
      setImages([sticker]);
      setGraphics([{...newGraphic("image", 1, sticker.id), label: "Детали в движении"}]);
      setHeadline("Время для идей");
      setStyle(
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "none"
          : "dynamic",
      );
    } catch {
      setMessage({
        error: true,
        text: "Не удалось открыть пример. Попробуй загрузить своё видео.",
      });
    }
  }
  function loaded() {
    const v = videoRef.current;
    if (!Number.isFinite(v.duration) || v.duration <= 0 || !v.videoWidth) {
      setMessage({
        error: true,
        text: "Не удалось определить длительность видео. Попробуй другой файл.",
      });
      setReady(false);
      if (pendingRestoreRef.current) failVideo();
      return;
    }
    const d = v.duration;
    setVideoSize({w: v.videoWidth, h: v.videoHeight});
    setDuration(d);
    const restored = pendingRestoreRef.current;
    pendingRestoreRef.current = null;
    if (restored) {
      const s = restored.settings;
      imagesRef.current.forEach(i => { if (i.url?.startsWith("blob:")) URL.revokeObjectURL(i.url); });
      setImages(restored.images); setVoice(restored.voice); setMusic(restored.music);
      setStart(s.start); setEnd(s.end);
      setStartDraft(String(Number(s.start.toFixed(2)))); setEndDraft(String(Number(s.end.toFixed(2))));
      setPosition(s.start);
      try { v.currentTime = s.start; } catch {}
      setResolution(s.resolution); setMode(s.mode);
      setFrameZoom(s.frameZoom); setFrameX(s.frameX); setFrameY(s.frameY);
      setStyle(s.style); setManual(s.manual); setPreset(s.preset);
      setGhostStyle(s.ghostStyle || "clean"); setGhostRecipe(s.ghostRecipe || "clean"); setTextEffect(s.textEffect || "clean");
      setKinetic(s.kinetic || "headline"); setFilm(s.film || "none");
      setCaptionPosition(s.captionPosition); setHeadline(s.headline);
      autoHeadlineRef.current = s.autoHeadline || null;
      setSrt(s.srt); setGraphics(s.graphics); setSilences(s.silences);
      setLanguage(s.language); setAsrSource(s.asrSource);
      setVoiceText(s.voiceText); setVoicePreset(s.voicePreset); setVoiceOffset(s.voiceOffset);
      setVoiceVolume(s.voiceVolume); setOriginalVolume(s.originalVolume); setMusicVolume(s.musicVolume);
      setMusicBpm(s.musicBpm); setFirstBeat(s.firstBeat); setBeatInfo(null);
      markRestoredRef.current = true;
      setProjectInfo({text:"Проект открыт. Видео, настройки и добавленные медиа восстановлены."});
      setProjectBusy(false);
    } else {
      setStart(0);
      setEnd(d);
      setStartDraft("0");
      setEndDraft(String(Number(d.toFixed(1))));
      setPosition(0);
    }
    setReady(true);
    setMessage(null);
  }
  function failVideo() {
    if (pendingRestoreRef.current) {
      const p = pendingRestoreRef.current;
      [p.voice?.url,p.music?.url,...p.images.map(i=>i.url)].filter(Boolean).forEach(url=>URL.revokeObjectURL(url));
      pendingRestoreRef.current = null;
      setProjectInfo({error:true,text:"Не удалось открыть видео из проекта. Попробуй Chrome или Edge."});
      setProjectBusy(false);
    }
    if (source) {
      setVideoCandidate({blob:source.blob,name:source.name,ready:false});
      setVideoInfo({error:true,text:"Браузер не смог открыть это видео. Попробуй преобразовать его на устройстве."});
      setMessage({
        error: true,
        text: "Видео не открылось. Во вкладке «Видео» можно попробовать его преобразовать.",
      });
    }
    setReady(false);
  }
  function setTrimStart(raw) {
    if (!ready) return;
    const gap = Math.min(0.2, duration),
      n = clamp(Number(raw) || 0, 0, Math.max(0, duration - gap));
    setStart(n);
    setStartDraft(String(Number(n.toFixed(1))));
    if (n > end - gap) {
      const v = Math.min(
        duration,
        n + Math.max(gap, Math.min(30, end - start)),
      );
      setEnd(v);
      setEndDraft(String(Number(v.toFixed(1))));
    }
    videoRef.current.currentTime = n;
    setPosition(n);
    invalidate();
  }
  function setTrimEnd(raw) {
    if (!ready) return;
    const gap = Math.min(0.2, duration),
      n = clamp(Number(raw) || 0, gap, duration);
    setEnd(n);
    setEndDraft(String(Number(n.toFixed(1))));
    if (n < start + gap) {
      const v = Math.max(0, n - gap);
      setStart(v);
      setStartDraft(String(Number(v.toFixed(1))));
    }
    if (videoRef.current.currentTime > n) {
      videoRef.current.currentTime = n;
      setPosition(n);
    }
    invalidate();
  }
  async function togglePlayback() {
    const v = videoRef.current;
    if (!ready || busy) return;
    if (!v.paused) {
      v.pause();
      return;
    }
    if (v.currentTime < start || v.currentTime >= end - 0.04)
      v.currentTime = start;
    try {
      await v.play();
    } catch {
      setMessage({
        error: true,
        text: "Не удалось воспроизвести видео в этом браузере.",
      });
    }
  }
  function updatePosition() {
    const v = videoRef.current;
    setPosition(v.currentTime);
    if (!busyRef.current && !v.paused && v.currentTime >= end) v.pause();
  }
  async function addPictures(fileList) {
    if (busyRef.current) return;
    const files = Array.from(fileList || []).filter((f) =>
      f.type.startsWith("image/"),
    );
    const room = 4 - images.length;
    if (!files.length) {
      setMessage({
        error: true,
        text: "Выбери изображения JPG, PNG или WebP.",
      });
      return;
    }
    if (room <= 0) {
      setMessage({
        error: true,
        text: "В этой версии можно добавить до 4 картинок.",
      });
      return;
    }
    const added = [];
    for (const f of files.slice(0, room)) {
      const url = URL.createObjectURL(f);
      try {
        added.push(await decodeImage(url, f.name));
      } catch {
        URL.revokeObjectURL(url);
      }
    }
    if (added.length) {
      setImages((prev) => [...prev, ...added].slice(0, 4));
      setGraphics((prev) => [...prev, ...added.map(item => newGraphic("image", position, item.id))].slice(0, 12));
      invalidate();
      if (files.length > room)
        setMessage({
          text: "Добавлены первые картинки: в этой версии их может быть до четырёх.",
        });
    } else
      setMessage({
        error: true,
        text: "Не удалось открыть картинки. Попробуй JPG или PNG.",
      });
    if (imageInput.current) imageInput.current.value = "";
  }
  function removePicture(id) {
    setImages((prev) => {
      const item = prev.find((x) => x.id === id);
      if (item?.url.startsWith("blob:")) URL.revokeObjectURL(item.url);
      return prev.filter((x) => x.id !== id);
    });
    setGraphics(prev => prev.filter(item => item.assetId !== id));
    invalidate();
  }
  function addGraphic(kind, assetId = "") {
    if (graphics.length >= 12) {
      setMessage({error: true, text: "В прототипе можно добавить до 12 графических элементов."}); return;
    }
    setGraphics(prev => [...prev, newGraphic(kind, position, assetId)]);
    invalidate();
  }
  function suggestAccentPhrases() {
    if (!srt?.cues?.length) return;
    const glue = new Set(["в","во","на","и","а","но","не","ни","с","со","к","ко","о","об","у","за","по","из","от","до","для","что","как","это"]);
    const room = Math.min(4, 12 - graphics.length), selected = [];
    for (const cue of srt.cues) {
      const text = String(cue.text || "").trim().replace(/[.,;:!?…]+$/, "");
      const tokens = text.split(/\s+/).filter(Boolean), last = (tokens[tokens.length-1] || "").toLocaleLowerCase("ru").replace(/[^а-яёa-z0-9-]/g, "");
      const t = Number(cue.start);
      if (!Number.isFinite(t) || t < start + 4 || t + 2.8 > end || text.length < 12 || text.length > 58 || tokens.length < 2 || glue.has(last)) continue;
      if (selected.some(x => Math.abs(x.at - t) < 8) || graphics.some(g => g.trigger === "time" && Math.abs(Number(g.at) - t) < 3.5)) continue;
      selected.push({...newGraphic("quote", t), label:text, duration:2.8});
      if (selected.length >= room) break;
    }
    if (!selected.length) {setMessage({text:"Не нашлось подходящих коротких фраз. Можно добавить фразу вручную."});return;}
    setGraphics(prev => [...prev, ...selected]); invalidate();
    setMessage({text:`Добавлено фраз: ${selected.length}. Это буквальные фрагменты субтитров — проверь текст и время.`});
  }
  function updateGraphic(id, patch) {
    // An edited suggestion becomes a manual item and survives later drafts.
    setGraphics(prev => prev.map(g => g.id === id ? {...g, ...patch, auto:false} : g));
    invalidate();
  }
  function snapGraphicToBeat(g) {
    if (!music || g.trigger !== "time") return;
    try {
      const local = clamp(Number(g.at) - start,0,Math.max(0,end-start));
      const current = mapTime(local,cuts);
      const beat = nearestBeatOutput(current,outputDuration,musicBpm,firstBeat);
      const sourceTime = outputToSource(beat,start,end,cuts);
      updateGraphic(g.id,{at:Number(sourceTime.toFixed(3))});
      setBeatInfo({id:g.id,text:`Акцент привязан к ${beat.toFixed(2)} сек готового ролика. Прослушай совпадение.`});
    } catch (error) {
      setBeatInfo({id:g.id,error:true,text:error?.message || "Не удалось выбрать удар."});
    }
  }
  function jumpTo(t) {
    if (!ready || !videoRef.current) return;
    const seek = clamp(t, start, Math.max(start, end - .05));
    videoRef.current.currentTime = seek; setPosition(seek);
    if (window.matchMedia("(max-width: 700px)").matches)
      stageRef.current?.scrollIntoView({behavior: "smooth", block: "start"});
  }
  async function importSrt(file) {
    if (!file) return;
    try {
      const cues = parseSrt(await file.text());
      if (!cues.length) throw Error();
      setSrt({ name: file.name, cues, origin: "srt" });
      setAsrInfo(null);
      invalidate();
    } catch {
      setMessage({
        error: true,
        text: "Не удалось прочитать SRT. Проверь, что в файле есть фразы и время.",
      });
    }
    if (srtInput.current) srtInput.current.value = "";
  }
  async function installVoice(blob, name, token) {
    const buffer = await decodeVoice(blob);
    if (token !== voiceToken.current) return false;
    setVoice({id: Math.random().toString(36).slice(2), blob, buffer,
      url: URL.createObjectURL(blob), duration: buffer.duration, name});
    setVoiceOffset(0);
    setOriginalVolume(35);
    setVoiceVolume(90);
    setAsrSource("voice");
    invalidate();
    return true;
  }
  async function importVoice(file) {
    if (!file || busyRef.current || voiceBusy || asrBusy) return;
    const token = ++voiceToken.current;
    setVoiceBusy(true);
    setVoiceInfo({text:"Открываем аудиофайл…"});
    try {
      if (await installVoice(file, file.name || "Озвучка", token))
        setVoiceInfo({text:"Дорожка добавлена. Прослушай её вместе с видео и проверь громкость."});
    } catch (error) {
      if (token === voiceToken.current) setVoiceInfo({error:true, text:error?.message || "Не удалось открыть аудиофайл."});
    } finally {
      if (token === voiceToken.current) setVoiceBusy(false);
      if (voiceInput.current) voiceInput.current.value = "";
    }
  }
  async function importMusic(file) {
    if (!file || busyRef.current || musicBusy || voiceBusy || asrBusy) return;
    const token = ++musicToken.current;
    setMusicBusy(true);
    setMusicInfo({text:"Открываем музыку…"});
    try {
      const buffer = await decodeVoice(file, {kind:"музыки"});
      if (token !== musicToken.current) return;
      setMusic({id:Math.random().toString(36).slice(2), blob:file, buffer,
        url:URL.createObjectURL(file), duration:buffer.duration, name:file.name || "Музыка"});
      if (!voice) setOriginalVolume(100);
      setMusicVolume(20);
      setMusicBpm("");
      setFirstBeat(0);
      setBeatInfo(null);
      setMusicInfo({text:"Музыка добавлена. Включи предпросмотр и проверь громкость."});
      invalidate();
    } catch (error) {
      if (token === musicToken.current)
        setMusicInfo({error:true, text:error?.message || "Не удалось открыть музыку. Попробуй MP3, WAV или M4A."});
    } finally {
      if (token === musicToken.current) setMusicBusy(false);
      if (musicInput.current) musicInput.current.value = "";
    }
  }
  function removeMusic() {
    if (musicBusy || busyRef.current) return;
    musicAudioRef.current?.pause();
    setMusic(null);
    setMusicInfo({text:"Музыка убрана."});
    setMusicBpm("");
    setFirstBeat(0);
    setBeatInfo(null);
    invalidate();
  }
  async function generateVoice() {
    if (!ready || busyRef.current || voiceBusy || asrBusy || !voiceText.trim()) return;
    const token = ++voiceToken.current, controller = new AbortController();
    voiceAbortRef.current = controller;
    setVoiceBusy(true);
    setVoiceInfo({text:"Готовим локальную озвучку…"});
    try {
      const blob = await requestLocalVoice({text:voiceText, voice:voicePreset, signal:controller.signal,
        onProgress:text => {if (token === voiceToken.current) setVoiceInfo({text});}});
      if (token !== voiceToken.current) return;
      if (await installVoice(blob, `Supertonic · ${voicePreset}.wav`, token))
        setVoiceInfo({text:"Озвучка создана. Прослушай её вместе с видео и проверь громкость."});
    } catch (error) {
      if (token === voiceToken.current) {
        const text = error?.name === "AbortError" ? "Создание отменено; предыдущая дорожка сохранена."
          : (error?.message || "Не удалось создать озвучку. Попробуй ещё раз.");
        setVoiceInfo({error:error?.name !== "AbortError", text});
      }
    } finally {
      if (token === voiceToken.current) {setVoiceBusy(false); voiceAbortRef.current = null;}
    }
  }
  function removeVoice() {
    if (voiceBusy || busyRef.current || asrBusy) return;
    voiceAudioRef.current?.pause();
    setVoice(null);
    setAsrSource("source");
    setVoiceInfo({text:"Озвучка убрана. Исходный звук снова воспроизводится как раньше."});
    invalidate();
  }
  async function transcribe() {
    if (!ready || busyRef.current || asrBusy || analysisBusy || !source?.blob) return;
    const targetVoice = asrSource === "voice" ? voice : null;
    if (asrSource === "voice" && !targetVoice) {
      setAsrInfo({error:true, text:"Добавь озвучку или выбери исходный звук."}); return;
    }
    const inputBlob = targetVoice ? targetVoice.blob : source.blob;
    const inputDuration = targetVoice ? targetVoice.duration : duration;
    if (inputDuration > 180 || inputBlob.size > 200 * 1024 * 1024) {
      setAsrInfo({error:true, text:"Для распознавания выбери звук до 3 минут и 200 МБ."}); return;
    }
    const id = ++asrToken.current;
    setAsrBusy(true);
    setAsrInfo({text:"Готовим звуковую дорожку на устройстве…"});
    let audioContext;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx || !window.OfflineAudioContext || !window.Worker)
        throw new Error("Для распознавания открой файл в актуальном Chrome или Edge на компьютере.");
      audioContext = new AudioCtx();
      let decoded;
      try { decoded = await audioContext.decodeAudioData(await inputBlob.arrayBuffer()); }
      catch { throw new Error("Не удалось прочитать звуковую дорожку. Попробуй WAV/MP3 или MP4 со звуком AAC, либо загрузи SRT."); }
      if (id !== asrToken.current) throw new Error("cancelled");
      const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
      const node = offline.createBufferSource();
      node.buffer = decoded; node.connect(offline.destination); node.start();
      const resampled = await offline.startRendering();
      if (id !== asrToken.current) throw new Error("cancelled");
      const audio = resampled.getChannelData(0).slice();
      let power = 0;
      for (let i = 0; i < audio.length; i += 32) power += audio[i] * audio[i];
      if (Math.sqrt(power / Math.ceil(audio.length / 32)) < .0005)
        throw new Error("Звуковая дорожка почти беззвучна. Попробуй видео с речью.");
      try { await audioContext.close(); } catch {}
      audioContext = null;
      setAsrInfo({text:"Загружаем модель и библиотеки (около 250 МБ). Нужен интернет; видео и звук не отправляются."});
      const {worker, revoke} = createASRWorker();
      asrWorkerRef.current = worker;
      const recognized = await new Promise((resolve, reject) => {
        let done = false; const downloadedModels = new Set();
        const finish = (error, value) => {
          if (done) return;
          done = true; worker.terminate(); revoke();
          if (asrWorkerRef.current === worker) asrWorkerRef.current = null;
          asrCancelRef.current = null;
          if (error) reject(error); else resolve(value);
        };
        asrCancelRef.current = () => finish(new Error("cancelled"));
        worker.onerror = () => finish(new Error("Не удалось запустить модель. Проверь интернет, память устройства и открой Chrome или Edge."));
        worker.onmessage = ({data}) => {
          if (id !== asrToken.current) return finish(new Error("cancelled"));
          if (data.type === "recognizing")
            setAsrInfo({text:"Распознаём речь на устройстве. Это может занять несколько минут — оставь страницу открытой."});
          else if (data.type === "file" && /onnx\/(encoder_model_quantized|decoder_model_merged_quantized)\.onnx$/.test(data.file || "")) {
            downloadedModels.add(data.file);
            setAsrInfo({text:`Загрузка модели: ${downloadedModels.size} из 2 больших файлов. Нужен интернет; видео и звук не отправляются.`});
          }
          else if (data.type === "complete") finish(null, data.result);
          else if (data.type === "error")
            finish(new Error("Не удалось загрузить или запустить модель. Проверь интернет и память устройства; можно загрузить SRT."));
        };
        worker.postMessage({audio, language}, [audio.buffer]);
      });
      if (id !== asrToken.current) throw new Error("cancelled");
      const parsed = wordsToCues(recognized, inputDuration);
      let cues = parsed.cues;
      if (targetVoice) {
        const map = t => outputToSource(t + voiceOffset, start, end, cuts);
        cues = cues.filter(c => c.start + voiceOffset < outputDuration).map(c => {
          const words = (c.words || []).filter(w => w.start + voiceOffset < outputDuration)
            .map(w => ({...w, start:map(w.start), end:map(Math.min(w.end, outputDuration - voiceOffset))}));
          return {...c, start:map(c.start), end:map(Math.min(c.end, outputDuration - voiceOffset)), words};
        }).filter(c => c.end > c.start);
        if (!cues.length) throw new Error("Озвучка находится за пределами выбранного видео.");
      }
      const resultSrt = {name:targetVoice ? "Автосубтитры · озвучка" : "Автосубтитры", cues,
        origin:targetVoice ? "auto-voice" : "auto",
        voiceMapKey:targetVoice ? voiceMapKey(targetVoice,start,end,voiceOffset,cuts) : null};
      setSrt(resultSrt);
      invalidate();
      setAsrInfo({text:`Готово: ${cues.length} фраз. Обязательно прослушай и исправь ошибки.${parsed.estimates ? " Некоторые тайминги приблизительные." : ""}`});
      return resultSrt;
    } catch (error) {
      if (id === asrToken.current && error?.message !== "cancelled")
        setAsrInfo({error:true, text:error?.message || "Не удалось распознать речь. Попробуй Chrome или Edge либо загрузи SRT."});
    } finally {
      try { await audioContext?.close(); } catch {}
      if (id === asrToken.current) setAsrBusy(false);
    }
  }
  function updateCueText(index, value) {
    setSrt(prev => {
      if (!prev) return prev;
      const cues = prev.cues.slice(), cue = cues[index], text = value.replace(/\n/g, " ");
      const parts = text.trim().split(/\s+/).filter(Boolean);
      const wordTemplate = cue.wordTemplate || cue.words;
      cues[index] = {...cue, text, wordTemplate, words: wordTemplate?.length === parts.length
        ? wordTemplate.map((w, i) => ({...w, text:parts[i]})) : undefined};
      return {...prev, cues};
    });
    invalidate();
  }
  function updateCueTime(index, which, value) {
    const val = Number(value);
    const current = srt?.cues[index];
    if (!current) return 0;
    if (!Number.isFinite(val)) return current[which];
    const minStart = Math.max(0, Math.min(current.end - .05, srt.cues[index-1]?.end ?? 0));
    const maxEnd = Math.max(current.start + .05, srt.cues[index+1]?.start ?? Math.max(duration, current.end));
    const from = which === "start" ? clamp(val, minStart, current.end - .05) : current.start;
    const to = which === "end" ? clamp(val, current.start + .05, maxEnd) : current.end;
    setSrt(prev => {
      if (!prev) return prev;
      const cues = prev.cues.slice(), cue = cues[index];
      const oldSpan = Math.max(.001, cue.end - cue.start), newSpan = to - from;
      const remap = items => items?.map(w => ({...w,
        start: from + clamp((w.start - cue.start) / oldSpan, 0, 1) * newSpan,
        end: from + clamp((w.end - cue.start) / oldSpan, 0, 1) * newSpan}));
      cues[index] = {...cue, start:from, end:to, words:remap(cue.words), wordTemplate:remap(cue.wordTemplate)};
      return {...prev, cues};
    });
    invalidate();
    return which === "start" ? from : to;
  }
  function downloadSrt() {
    if (!srt?.cues.length) return;
    const url = URL.createObjectURL(new Blob(["\uFEFF" + formatSrt(srt.cues.filter(c => c.text.trim()))], {type:"text/plain;charset=utf-8"}));
    const a = document.createElement("a"); a.href = url; a.download = "kadr-subtitles-original.srt"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function addCue() {
    if (!srt || !ready) return;
    const at = clamp(position, 0, Math.max(0, duration - .1));
    if (srt.cues.some(c => at >= c.start && at < c.end)) {
      setAsrInfo({error:true, text:"Чтобы добавить фразу, поставь ползунок в свободный участок между субтитрами."}); return;
    }
    const next = srt.cues.find(c => c.start > at);
    const to = Math.min(duration, next?.start ?? duration, at + 2);
    if (to - at < .1) {
      setAsrInfo({error:true, text:"Здесь мало места для новой фразы. Выбери свободный участок подлиннее."}); return;
    }
    setSrt(prev => ({...prev, cues:[...prev.cues, {id:Math.random().toString(36).slice(2),start:at,end:to,text:""}].sort((a,b)=>a.start-b.start)}));
    setAsrInfo({text:"Новая фраза добавлена на текущем времени. Впиши текст и при необходимости поправь границы."});
    invalidate();
  }
  async function analyzePauses() {
    if (!ready || busyRef.current || analysisBusy || asrBusy || !source?.blob) return;
    if (duration > 180 || source.blob.size > 200 * 1024 * 1024) {
      setAnalysisInfo({error: true, text: "Для первого теста выбери видео до 3 минут и 200 МБ."}); return;
    }
    const id = ++analysisToken.current;
    setAnalysisBusy(true); setAnalysisInfo({text: "Слушаем громкость дорожки на устройстве…"});
    let audioContext;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error("Браузер не поддерживает анализ звука. Открой редактор в Chrome или Edge на компьютере.");
      audioContext = new AudioCtx();
      const bytes = await source.blob.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(bytes);
      if (analysisToken.current !== id) return;
      const result = findQuietRanges(decoded);
      if (analysisToken.current !== id) return;
      setSilences(result.ranges);
      invalidate();
      if (result.silent) setAnalysisInfo({error: true, text: "Слышимого звука не найдено. Ничего не вырезали — проверь дорожку."});
      else if (!result.ranges.length) setAnalysisInfo({text: "Длинных тихих пауз не найдено. Фоновая музыка или шум могут их скрывать."});
      else setAnalysisInfo({text: `Найдено пауз: ${result.ranges.length}. Прослушай монтаж и сними отметку с тех, которые нужно оставить.`});
      return result;
    } catch (err) {
      if (analysisToken.current === id) {
        setSilences([]);
        setAnalysisInfo({error: true, text: err?.message?.includes("Браузер") ? err.message : "Не удалось прочитать звуковую дорожку. Попробуй MP4 со звуком в Chrome или Edge."});
      }
    } finally {
      try { await audioContext?.close(); } catch {}
      if (analysisToken.current === id) setAnalysisBusy(false);
    }
  }
  function toggleSentence(sentence) {
    const covering = silences.filter(c => c.enabled && c.from < sentence.end && c.to > sentence.start);
    if (covering.length) setSilences(prev => prev.map(c => covering.some(x => x.id === c.id) ? {...c, enabled:false} : c));
    else setSilences(prev => [...prev, {id:"take-sentence-" + sentence.start.toFixed(2), from:Math.max(start, sentence.start - .12), to:Math.min(end, sentence.end + .25), enabled:true}]);
    invalidate();
  }
  function swapTake(sentence) {
    const key = s => String(s.text || "").trim().toLowerCase();
    const alt = takesPlan?.rejected?.find(r => key(r) === key(sentence));
    if (!alt) return;
    setSilences(prev => [...prev.map(c => c.enabled && c.from < alt.end && c.to > alt.start ? {...c, enabled:false} : c),
      {id:"take-swap-" + sentence.start.toFixed(2), from:Math.max(start, sentence.start - .12), to:Math.min(end, sentence.end + .25), enabled:true}]);
    setTakesPlan(prev => ({...prev, sentences:prev.sentences.map(s => s === sentence ? alt : s), rejected:prev.rejected.map(r => r === alt ? sentence : r)}));
    invalidate();
  }
  async function createDraft(knownSrt = null) {
    if (!ready || busyRef.current || asrBusy || analysisBusy || draftRef.current) return;
    const token = ++draftToken.current, sourceAtStart = source;
    draftRef.current = true; setDraftBusy(true);
    setDraftInfo({text:"Ищем тихие паузы на устройстве…"});
    try {
      let audio = await analyzePauses();
      if (draftToken.current !== token || latestRef.current?.source !== sourceAtStart) return;
      if (!audio && latestRef.current?.voice && duration <= 180 && source.blob.size <= 200*1024*1024) {
        audio = {ranges:[],silent:true,unavailable:true};
        setAnalysisInfo({text:"В исходном видео нет доступного звука. Паузы оставлены без изменений; озвучка сохранена."});
      }
      if (!audio) {
        setDraftInfo({error:true,text:"Черновик не создан. Проверь сообщение выше."});
        return;
      }
      const now = latestRef.current;
      const subtitles = now?.srt?.cues?.length ? now.srt :
        (Array.isArray(knownSrt?.cues) ? knownSrt : null);
      if (!now?.ready || !subtitles?.cues?.length) {
        setDraftInfo({text:`Найдено пауз: ${audio.ranges.length}. Чтобы предложить графику, загрузи SRT или создай автосубтитры и нажми кнопку ещё раз.`});
        return;
      }
      // Timestamped speech is a conservative second check: keep, rather than
      // automatically cut, quiet regions touching any subtitle. Timings can be
      // wrong, so this is not a substitute for listening to the result.
      const plan = planGhostEdit(subtitles.cues, {start: now.start, end: now.end});
      setTakesPlan(plan.sentences.length ? plan : null);
      const takeSilences = takesToSilences(plan);
      const quietGuarded = audio.ranges.map(c => {
        const touchesSpeech = subtitles.cues.some(q =>
          Number(q.start) < c.to + .1 && Number(q.end) > c.from - .1);
        return {...c, enabled:!now.voice && !touchesSpeech, guarded:touchesSpeech};
      });
      const byKey = new Map();
      for (const c of [...quietGuarded, ...takeSilences]) byKey.set(c.from.toFixed(3) + "-" + c.to.toFixed(3), c);
      const guarded = [...byKey.values()].sort((a, b) => a.from - b.from);
      setSilences(guarded);
      const manualItems = now.graphics.filter(g => !g.auto);
      const reserved = manualItems.flatMap(g => graphicTimes(g, subtitles).map(t =>
        ({from:t, to:t + (Number(g.duration) || 2.8)})));
      const removed = selectedCuts(guarded, now.start, now.end).map(c =>
        ({from:now.start + c.from, to:now.start + c.to}));
      const storyboardPlan = planStoryboard({cues:subtitles.cues, start:now.start, end:now.end,
        reserved, cuts:removed, maxScenes:Math.max(0,12-manualItems.length)});
      const generated = storyboardPlan.scenes.map(s => ({...newGraphic(s.kind,s.at),...s,auto:true}));
      setGraphics(prev => [...prev.filter(g => !g.auto), ...generated].slice(0,12));
      if (!now.headline.trim() || now.headline === autoHeadlineRef.current) {
        setHeadline(storyboardPlan.headline);
        autoHeadlineRef.current = storyboardPlan.headline || null;
      }
      invalidate();
      const pauseNotice = audio.silent ? "Слышимого звука исходника не найдено; паузы не вырезаны." :
        now.voice ? `Найдено пауз: ${audio.ranges.length}. При добавленной озвучке они оставлены без вырезания.` :
        `Найдено пауз: ${audio.ranges.length}; рядом с субтитрами оставлено: ${guarded.filter(c=>c.guarded).length}.`;
      setDraftInfo({text:`${pauseNotice} Автоакцентов: ${generated.length}. Это буквальные фрагменты субтитров, не понимание смысла: проверь текст, время и склейки.`});
      return true;
    } catch {
      if (draftToken.current === token) setDraftInfo({error:true,text:"Не удалось создать черновик. Проверь субтитры и попробуй ещё раз."});
    } finally {
      if (draftToken.current === token) {draftRef.current=false;setDraftBusy(false);}
    }
  }
  async function quickDraft() {
    if (!ready || busyRef.current || projectBusy || asrBusy || voiceBusy || musicBusy || analysisBusy || draftBusy || quickBusy) return;
    if (duration > 180 || source.blob.size > 200*1024*1024) {
      setQuickInfo({error:true,text:"Для быстрого черновика выбери исходное видео до 3 минут и 200 МБ."});
      return;
    }
    const token = ++quickToken.current;
    setQuickBusy(true);
    try {
      let subtitles = srt;
      if (!subtitles?.cues?.length) {
        setQuickInfo({text:"Создаём субтитры. При первой загрузке модели это может занять несколько минут…"});
        subtitles = await transcribe();
        if (token !== quickToken.current) return;
        if (!subtitles?.cues?.length) {
          setQuickInfo({error:true,text:"Не удалось создать субтитры. Открой вкладку «Текст», чтобы увидеть причину или загрузить SRT."});
          return;
        }
      }
      setQuickInfo({text:"Ищем паузы и готовим графические акценты…"});
      const ok = await createDraft(subtitles);
      if (token !== quickToken.current) return;
      setQuickInfo(ok ? {text:"Черновик готов. Открой «Текст» и «Дизайн», проверь слова, паузы и акценты."}
        : {error:true,text:"Субтитры сохранены, но черновик не создан. Проверь сообщение выше."});
    } catch {
      if (token === quickToken.current) setQuickInfo({error:true,text:"Не удалось создать черновик. Попробуй по шагам во вкладках «Видео» и «Текст»."});
    } finally {
      if (token === quickToken.current) setQuickBusy(false);
    }
  }
  async function applyRecipe(id) {
    const recipe = recipeById(id), s = styleById(recipe.style);
    if (!ready) await loadDemo();
    const cues = exampleCues();
    const suggested = planStoryboard({cues, start:0, end:6, maxScenes:1});
    const at = suggested.scenes[0]?.at ?? 2.7;
    const graphic = {...newGraphic(s.scene, at),auto:true};
    if (s.scene === "number") { graphic.value = String(cues.length); graphic.label = "Фраз в примере"; }
    else graphic.label = cues.map(c => c.text).join("\n");
    setGhostRecipe(id); setGhostStyle(recipe.style); setPreset(`ghost-${recipe.style}`);
    setTextEffect(s.effect); setKinetic(s.kinetic); setFilm(s.film); setHeadline(s.sample);
    setSrt({name:`Пример · ${recipe.name}`,cues,origin:"example"});
    setManual(""); setGraphics([graphic]);
    setStyle(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "none" : "dynamic");
    setActiveTab("check");
    invalidate();
  }
  function cancelQuickDraft() {
    quickToken.current++;
    if (asrBusy) stopAsr(false);
    analysisToken.current++; draftToken.current++; draftRef.current = false;
    setAnalysisBusy(false); setDraftBusy(false); setQuickBusy(false);
    setQuickInfo({text:"Создание остановлено. То, что уже создано, осталось в проекте."});
  }
  async function exportClip() {
    if (!ready || busyRef.current || asrBusy || voiceBusy || musicBusy || quickBusy || !source?.blob) return;
    if (!window.VideoEncoder || !window.VideoDecoder) {
      setMessage({
        error: true,
        text: "Этот браузер пока не поддерживает экспорт. Попробуй Chrome на компьютере.",
      });
      return;
    }
    invalidate();
    setBusy(true);
    busyRef.current = true;
    setPct(0);
    videoRef.current?.pause();
    setMessage({
      text: "Собираем ролик. Оставь страницу открытой до завершения экспорта.",
    });
    let conversion = null,
      mixedOutput = null,
      input = null,
      aborted = false;
    abortRef.current = () => {
      aborted = true;
      setMessage({ text: "Отменяем экспорт…" });
      if (conversion) conversion.cancel().catch(() => {});
      if (mixedOutput) mixedOutput.cancel().catch(() => {});
    };
    try {
      if (!(await canEncodeAudio("aac"))) registerAacEncoder();
      if (aborted) throw new Error("cancelled");
      input = new Input({
        source: new BlobSource(source.blob),
        formats: ALL_FORMATS,
      });
      const originalVideo = await input.getPrimaryVideoTrack(),
        originalAudio = await input.getPrimaryAudioTrack();
      if (!originalVideo) throw new Error("В файле не найдена видео-дорожка.");
      const hasMix = !!(voice || music);
      if (hasMix && duration > 180)
        throw new Error("Экспорт с музыкой или озвучкой ограничен исходником до 3 минут и 200 МБ.");
      let mixedAudio = null;
      if (hasMix) {
        setMessage({text:"Сводим звуковые дорожки на устройстве…"});
        mixedAudio = await makeVoiceMix({sourceBlob:source.blob, hasOriginal:!!originalAudio,
          voiceBuffer:voice?.buffer || null, musicBuffer:music?.buffer || null,
          start, end, cuts, outputDuration, voiceOffset, originalVolume, voiceVolume, musicVolume});
        if (aborted) throw new Error("cancelled");
        setMessage({text:"Собираем видео со звуком. Оставь страницу открытой."});
      }
      await Promise.all([document.fonts.load('800 42px "Kadr Manrope"'),
        document.fonts.load('italic 600 59px "Kadr Playfair"')]);
      const sw = await originalVideo.getDisplayWidth(), sh = await originalVideo.getDisplayHeight();
      const output = new Output({
          format: new Mp4OutputFormat({ fastStart: "in-memory" }),
          target: new BufferTarget(),
        }),
        canvas = document.createElement("canvas");
      const exportScale = resolution / W;
      canvas.width = resolution;
      canvas.height = Math.round(H * exportScale);
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.scale(exportScale, exportScale);
      if (outputDuration < .2) throw new Error("После нарезки осталось слишком мало видео. Верни часть пауз.");
      const settings = { style, start, end, manual, srt, images, graphics, outputDuration, preset, headline, captionPosition:effectiveCaptionPosition, mode, frameZoom, frameX, frameY, textEffect, kinetic, film };
      const sourceScale = Math.min(1, 1920 / Math.max(sw, sh));
      const intermediateWidth = Math.max(2, Math.round(sw * sourceScale));
      const intermediateHeight = Math.max(2, Math.round(sh * sourceScale));
      const video = {
        codec: "avc",
        width: intermediateWidth,
        height: intermediateHeight,
        fit: "fill",
        processedWidth: canvas.width,
        processedHeight: canvas.height,
        allowRotationMetadata: false,
        bitrate: resolution === 1080 ? 7_000_000 : 3_500_000,
        frameRate: 30,
        process: (sample) => {
          const sourceT = sample.timestamp;
          if (isInCut(sourceT, cuts)) return null;
          const outputT = mapTime(sourceT, cuts);
          drawComposition(ctx, sample, sourceT, outputT, settings, styleAt, getCue);
          return new VideoSample(canvas, { timestamp: outputT, duration: sample.duration });
        },
      };
      conversion = await Conversion.init({
        input,
        output,
        tracks: "primary",
        trim: { start, end },
        video,
        audio: hasMix ? {discard:true} : { codec: "aac", bitrate: 128_000,
          process: cuts.length ? (sample) => audioPieces(sample, cuts) : undefined },
        showWarnings: false,
      });
      if (aborted) throw new Error("cancelled");
      if (
        !conversion.isValid ||
        !conversion.utilizedTracks.includes(originalVideo)
      )
        throw new Error(
          "Этот файл пока не получается обработать. Попробуй другое видео или Chrome на компьютере.",
        );
      if (!hasMix && originalAudio && !conversion.utilizedTracks.includes(originalAudio))
        throw new Error(
          "Не удалось обработать звуковую дорожку. Попробуй видео MP4 с аудио AAC.",
        );
      conversion.onProgress = (p) => setPct(clamp(Math.round(p * (hasMix ? 85 : 100)), 0, 100));
      await conversion.execute();
      if (aborted) throw new Error("cancelled");
      let data = output.target.buffer;
      if (!data?.byteLength)
        throw new Error(
          "Не удалось получить файл. Попробуй другой исходный ролик.",
        );
      if (hasMix) {
        setMessage({text:"Соединяем видео со звуком…"});
        data = await muxMixedAudio(data, mixedAudio, {
          cancelled:() => aborted, onOutput:value => {mixedOutput = value;},
        });
        if (aborted) throw new Error("cancelled");
      }
      const blob = new Blob([data], { type: "video/mp4" });
      setResult({ url: URL.createObjectURL(blob), name: "kadr-reels.mp4" });
      setPct(100);
      setMessage({ text: "Готово! Можно скачать вертикальный MP4." });
    } catch (e) {
      if (aborted)
        setMessage({
          text: "Экспорт отменён. Можно изменить настройки и попробовать снова.",
        });
      else
        setMessage({
          error: true,
          text:
            e?.message ||
            "Не удалось собрать видео. Попробуй Chrome на компьютере.",
        });
    } finally {
      input?.dispose();
      abortRef.current = null;
      busyRef.current = false;
      setBusy(false);
    }
  }
  const selected = Math.max(0, end - start),
    relative = Math.max(0, position - start),
    outputTime = mapTime(relative, cuts),
    vidStyle = styleAt(style, outputTime),
    cueTime = srt ? position : outputTime,
    cue = position < start || position >= end ? null : srt ? getCue(manual, srt, cueTime, start, end)
              : getCue(manual, null, cueTime, 0, outputDuration),
    inSelection = position >= start && position < end,
    rect = rectFor(preset, {headline:inSelection ? headline : "", outputT:outputTime, outputDuration, sourceTime:position, style, graphics:inSelection ? graphics : [], srt, images}),
    geometry = frameGeometry(videoSize.w, videoSize.h, mode, frameZoom, frameX, frameY, rect.w / rect.h);
  useEffect(() => {
    if (ready && backgroundRef.current) drawBackground(backgroundRef.current.getContext("2d"), preset);
  }, [ready, preset, fontsReady]);
  useEffect(() => {
    if (!ready || !overlayRef.current) return;
    drawOverlay(overlayRef.current.getContext("2d"), {preset, headline:inSelection ? headline : "",
      outputT:outputTime, outputDuration, sourceTime:position, cue, cueTime, style,
      graphics:inSelection ? graphics : [], srt, images, captionPosition:effectiveCaptionPosition,
      textEffect, kinetic, film});
  }, [ready, preset, headline, outputTime, outputDuration, position, cueTime, style,
      graphics, srt, images, captionPosition, inSelection, manual, fontsReady, textEffect, kinetic, film]);
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brandmark">
            <LuClapperboard size={19} />
          </span>
          Кадр
          <i />
          <span className="sub">редактор коротких видео</span>
        </div>
        <div className="top-right">
          <span className="privacy-label"><span className="secure-dot" /> На твоём устройстве</span>
          <input ref={projectInput} type="file" accept=".kadr,application/octet-stream"
            aria-label="Выбрать файл проекта" hidden onChange={e => openProject(e.target.files?.[0])} />
          <button type="button" className="project-button" disabled={projectBusy || busy || asrBusy || voiceBusy || musicBusy || analysisBusy || draftBusy || quickBusy}
            onClick={() => requestReplace(() => projectInput.current?.click())}><LuFolderOpen size={16}/> Открыть проект</button>
          <button type="button" className="project-button project-save" disabled={!ready || projectBusy || busy || asrBusy || voiceBusy || musicBusy || analysisBusy || draftBusy || quickBusy}
            onClick={saveProject}><LuSave size={16}/> Сохранить проект</button>
        </div>
      </header>
      <main className="page fade-in">
        <div className="project-status" aria-live="polite">
          <span className={"project-state" + (projectDirty ? " unsaved" : "")}>
            {ready ? (projectDirty ? "Есть несохранённые изменения" : "Проект сохранён") : "Выбери видео или открой сохранённый проект"}
          </span>
          {projectInfo && <span className={projectInfo.error ? "project-error" : ""}>{projectInfo.text}</span>}
        </div>
        <div className="workspace">
          <div className="maincol">
            <section ref={stageRef} className="stage" aria-label="Предпросмотр видео">
              <div className="stage-head">
                <div className="s-title">
                  <LuVideo size={16} /> Предпросмотр
                </div>
                <span className="stage-tag">
                  9:16 &nbsp; · &nbsp; {resolution} × {Math.round(resolution * 16 / 9)}
                </span>
              </div>
              <div className="stage-body">
                <div className="phone">
                  <canvas ref={backgroundRef} className="composition-bg" width={W} height={H} hidden={!ready} aria-hidden="true" />
                  <div className="video-window" style={{left:`${rect.x/W*100}%`,top:`${rect.y/H*100}%`,
                    width:`${rect.w/W*100}%`,height:`${rect.h/H*100}%`,
                    borderRadius:`${rect.r/rect.w*100}% / ${rect.r/rect.h*100}%`}}>
                    <div className="footage-motion" style={{transform:`scale(${vidStyle.zoom})`,filter:vidStyle.filter}}>
                      <video
                        ref={videoRef}
                        src={source?.url || undefined}
                        className={!ready ? "absent" : ""}
                        style={{width:`${geometry.w*100}%`, height:`${geometry.h*100}%`,
                          left:`${geometry.left*100}%`, top:`${geometry.top*100}%`}}
                        playsInline preload="metadata"
                        onLoadedMetadata={loaded} onError={failVideo} onTimeUpdate={updatePosition}
                        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                      />
                    </div>
                  </div>
                  <canvas ref={overlayRef} className="composition-overlay" width={W} height={H} hidden={!ready} aria-hidden="true" />
                  {ready && safeGuide && <div className="safe-guide" aria-hidden="true"><div className="safe-boundary"><span>ориентир</span></div></div>}
                  {!ready && (
                    <div className="placeholder">
                      <div className="placeholder-icon">
                        <LuClapperboard size={25} />
                      </div>
                      <strong>Твоё видео будет здесь</strong>
                      <span>Выбери видео в шаге 1, чтобы начать</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="stage-foot">
                <button
                  className="icon-button"
                  onClick={togglePlayback}
                  disabled={!ready || busy}
                  aria-label={playing ? "Пауза" : "Воспроизвести"}
                >
                  {playing ? <LuPause size={16} /> : <LuPlay size={16} />}
                </button>
                <input
                  className="scrub"
                  aria-label="Позиция воспроизведения"
                  type="range"
                  min="0"
                  max={duration || 1}
                  step="0.05"
                  value={Math.min(position, duration || 1)}
                  disabled={!ready || busy}
                  onChange={(e) => {
                    videoRef.current.currentTime = Number(e.target.value);
                    setPosition(Number(e.target.value));
                  }}
                />
                <span className="time">
                  {time(position)} / {time(duration)}
                </span>
              </div>
            </section>
          </div>
          <aside className="side">
            <nav ref={tabsRef} className="editor-tabs" aria-label="Разделы редактора">
              {[["load","1 Загрузить"],["check","2 Проверить"],["export","3 Экспорт"]].map(([key,label]) =>
                <button key={key} type="button" aria-pressed={activeTab === key} onClick={() => setActiveTab(key)}>{label}</button>)}
            </nav>
            <div className="section" hidden={activeTab !== "load"}>
              <div className="sec-title">
                <div className="sec-name">
                  <LuUpload size={15} /> Видео
                </div>
                
              </div>
              <input
                ref={videoInput}
                type="file"
                accept="video/*,.mov,.mp4,.m4v,.webm,.mkv,.avi,.mts,.m2ts,.ts,.mpg,.mpeg,.3gp,.3g2,.flv,.wmv,.vob,.ogv,.mxf"
                aria-label="Выбрать видео"
                hidden
                onChange={(e) => chooseVideoFile(e.target.files?.[0])}
              />
              <div
                className="source-box"
                role="button"
                tabIndex={busy || projectBusy || videoImportBusy ? -1 : 0}
                aria-label={source ? "Выбрать другое видео" : "Выбрать видео"}
                onClick={() => {if (!busy && !projectBusy && !videoImportBusy) videoInput.current?.click();}}
                onKeyDown={(e) => {
                  if (!busy && !projectBusy && !videoImportBusy && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    videoInput.current?.click();
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!busy && !projectBusy && !videoImportBusy) chooseVideoFile(e.dataTransfer.files?.[0]);
                }}
              >
                <div className="source-icon">
                  <LuFileVideo size={18} />
                </div>
                <div className="source-copy">
                  <strong>{source?.name || "Выбрать видео"}</strong>
                  <span>
                    {source
                      ? "Нажми, чтобы заменить"
                      : "или перетащи файл сюда"}
                  </span>
                </div>
                <LuUpload size={15} color="#7c879a" />
              </div>
              <p className="hint">MP4, MOV, WebM и другие. Неподдерживаемый формат предложим преобразовать.</p>
              <div ref={videoHelpRef}>
              {videoInfo && <div className={"video-info" + (videoInfo.error ? " error" : "")} role="status">{videoInfo.text}</div>}
              {videoCandidate && <div className="converter-card">
                <strong>{videoCandidate.ready ? "Видео готово к открытию" : "Открыть этот формат"}</strong>
                <span className="candidate-name">{videoCandidate.name}</span>
                {videoCandidate.ready ?
                  <p>Открой подготовленный файл, чтобы заменить текущий проект.</p> :
                  <p>Попробуем преобразовать видео на устройстве, не отправляя его в интернет. При первом запуске загрузится конвертер около 31 МБ. До 200 МБ; на телефоне может не хватить памяти.</p>}
                <button type="button" className="outline-action converter-button" disabled={videoImportBusy}
                  onClick={() => videoCandidate.ready ? openPreparedVideo(videoCandidate) : convertCandidate()}>
                  {videoCandidate.ready ? "Открыть подготовленное видео" : "Преобразовать и открыть"}
                </button>
                <button type="button" className="converter-dismiss" onClick={() => {setVideoCandidate(null);setVideoInfo(null);}}>Не сейчас</button>
              </div>}
              </div>
              <button className="demo-link" onClick={() => requestReplace(loadDemo)} disabled={busy || projectBusy}>
                Посмотреть встроенный пример
              </button>
              {ready && <div className="quick-draft">
                <strong>Быстрый черновик</strong>
                <p>{srt?.cues?.length
                  ? "Используем готовые субтитры, найдём паузы и предложим графику. Ручные элементы сохранятся."
                  : "Создадим субтитры, найдём паузы и предложим графику. Для загрузки модели нужен интернет — около 250 МБ."}</p>
                {voice && <label className="field-label">Что распознать
                  <select className="form-select" aria-label="Источник речи для черновика" value={asrSource} disabled={quickBusy}
                    onChange={e => setAsrSource(e.target.value)}>
                    <option value="voice">Озвучку</option><option value="source">Исходный звук видео</option>
                  </select>
                </label>}
                <button type="button" className="outline-action quick-draft-button"
                  disabled={projectBusy || (!quickBusy && (busy || asrBusy || voiceBusy || musicBusy || analysisBusy || draftBusy))}
                  onClick={quickBusy ? cancelQuickDraft : quickDraft}>
                  <LuWandSparkles size={15}/>{quickBusy ? "Остановить создание" : srt?.cues?.length ? "Создать черновик по субтитрам" : "Создать субтитры и черновик"}
                </button>
                {quickInfo && <p className={"auto-info" + (quickInfo.error ? " error" : "")} role="status">{quickInfo.text}</p>}
                <p className="hint">Черновик работает по простым правилам, а не понимает смысл. Обязательно проверь текст, склейки и акценты. Видео — до 3 минут и 200 МБ.</p>
              </div>}
            </div>
            <div className="section" hidden={activeTab !== "load"}>
              <div className="sec-title">
                <div className="sec-name">
                  <LuScissors size={15} /> Обрезка
                </div>
                
              </div>
              <div className="times">
                <label>
                  <span className="field-label">Начало</span>
                  <span className="input-wrap">
                    <input
                      type="number"
                      aria-label="Начало, секунды"
                      min="0"
                      max={Math.max(0, duration - Math.min(0.2, duration))}
                      step="0.1"
                      value={ready ? startDraft : ""}
                      placeholder="0.0"
                      disabled={!ready || busy}
                      onChange={(e) => setStartDraft(e.target.value)}
                      onBlur={(e) => setTrimStart(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                    <span>сек</span>
                  </span>
                </label>
                <label>
                  <span className="field-label">Конец</span>
                  <span className="input-wrap">
                    <input
                      type="number"
                      aria-label="Конец, секунды"
                      min={Math.min(0.2, duration)}
                      max={duration}
                      step="0.1"
                      value={ready ? endDraft : ""}
                      placeholder="0.0"
                      disabled={!ready || busy}
                      onChange={(e) => setEndDraft(e.target.value)}
                      onBlur={(e) => setTrimEnd(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                    <span>сек</span>
                  </span>
                </label>
              </div>
              <p className="hint">
                До монтажа: <strong>{selected ? `${selected.toFixed(1)} сек` : "—"}</strong>
                {cuts.length > 0 && <> · После: <strong>{outputDuration.toFixed(1)} сек</strong></>}
              </p>
            </div>
            <div className="section captions-section" hidden={activeTab !== "check"}>
              <div className="sec-title">
                <div className="sec-name"><LuCaptions size={15} /> Субтитры</div>
                
              </div>
              <p className="hint auto-intro">Одна кнопка снимет речь с видео. Дальше можно поправить каждую фразу и её время. До 3 минут и 200 МБ.</p>
              <button className="outline-action asr-action" onClick={asrBusy ? () => stopAsr() : transcribe} disabled={!ready || busy || voiceBusy || analysisBusy || draftBusy}>
                <LuWandSparkles size={15} /> {asrBusy ? "Отменить распознавание" : srt ? "Распознать заново" : "Создать автосубтитры"}
              </button>
              <p className="hint">Модель скачивается один раз (~250 МБ). Речь обрабатывается на устройстве, видео никуда не отправляется.</p>
              {asrInfo && <p className={"auto-info"+(asrInfo.error?" error":"")} role="status">{asrInfo.text}</p>}
              {srt?.origin === "auto-voice" && srt.voiceMapKey !== currentVoiceMapKey &&
                <p className="auto-info error">После создания субтитров изменились озвучка, обрезка или паузы. Проверь тайминги или распознай озвучку заново.</p>}
              {srt ? (
                <>
                  <div className="srt-loaded spaced">
                    <LuFileText size={17} /><div><strong>{srt.name}</strong><span>{srt.cues.length} фраз с таймингом</span></div>
                    <button className="small-delete" aria-label="Убрать субтитры" disabled={busy || asrBusy} onClick={() => {setSrt(null); invalidate();}}><LuX size={16} /></button>
                  </div>
                  <p className="hint">Нажми на время, чтобы проверить фразу. Исправь текст или границы. Если число слов меняется, подсветка внутри фразы станет приблизительной.</p>
                  <div className="cue-list" aria-label="Редактор фраз">
                    {srt.cues.map((item, i) => (
                      <div className="cue-row" key={item.id || i}>
                        <div className="cue-top">
                          <button type="button" className="cue-jump" aria-label={`К фразе ${i+1}`} disabled={busy}
                            onClick={() => jumpTo(Math.min(item.end-.01,item.start+.15))}>{preciseTime(item.start)}</button>
                          <label>с <input type="number" aria-label={`Начало фразы ${i+1}`} min="0" step="0.01"
                            key={`${item.id}-start-${item.start}`} defaultValue={item.start.toFixed(2)} disabled={busy}
                            onBlur={e => {e.currentTarget.value=updateCueTime(i,"start",e.currentTarget.value).toFixed(2)}} onKeyDown={e => {if(e.key==="Enter")e.currentTarget.blur();}} /></label>
                          <label>до <input type="number" aria-label={`Конец фразы ${i+1}`} min="0" step="0.01"
                            key={`${item.id}-end-${item.end}`} defaultValue={item.end.toFixed(2)} disabled={busy}
                            onBlur={e => {e.currentTarget.value=updateCueTime(i,"end",e.currentTarget.value).toFixed(2)}} onKeyDown={e => {if(e.key==="Enter")e.currentTarget.blur();}} /></label>
                          <button className="cue-delete" aria-label={`Удалить фразу ${i+1}`} disabled={busy} onClick={() => {
                            setSrt(prev => ({...prev,cues:prev.cues.filter((_,n)=>n!==i)})); invalidate();
                          }}><LuX size={15} /></button>
                        </div>
                        <textarea className="cue-text" aria-label={`Текст фразы ${i+1}`} rows="2" maxLength={90} disabled={busy}
                          value={item.text} onChange={e => updateCueText(i,e.target.value)} />
                      </div>
                    ))}
                  </div>
                  <div className="caption-actions">
                    <button className="text-action" onClick={addCue} disabled={!ready || busy}>Добавить фразу на текущем времени</button>
                    <button className="text-action" onClick={downloadSrt} disabled={busy || !srt.cues.length}>Скачать исправленный SRT</button>
                  </div>
                  <p className="hint">В SRT время исходного файла, до вырезания пауз. В MP4 субтитры следуют монтажу.</p>
                </>
              ) : (
                <p className="hint">Слов пока нет. Нажми кнопку выше или открой «Другие способы» ниже.</p>
              )}
              <details className="advanced-box">
                <summary>Другие способы добавить слова и точная настройка</summary>
                {voice && <label className="field-label">Что распознать
                  <select aria-label="Источник речи" className="form-select" value={asrSource}
                    disabled={busy || asrBusy} onChange={e => setAsrSource(e.target.value)}>
                    <option value="voice">Дорожку озвучки</option><option value="source">Исходный звук видео</option>
                  </select>
                </label>}
                <label className="field-label">Язык речи
                  <select aria-label="Язык речи" className="form-select" value={language} disabled={busy || asrBusy} onChange={e => setLanguage(e.target.value)}>
                    <option value="russian">Русский</option><option value="english">Английский</option><option value="auto">Определить автоматически</option>
                  </select>
                </label>
                {!srt && <label className="manual-caption"><span className="field-label">Ввести фразы вручную, каждую с новой строки</span>
                  <textarea className="text-input subtitles-input" maxLength={1200} placeholder={"Например:\nЭто твоя идея\nДавай её оживим"}
                    value={manual} disabled={busy} onChange={e => {setManual(e.target.value); invalidate();}} />
                  <span className="hint">Вручную фразы распределяются равномерно, не по речи.</span>
                </label>}
                <input ref={srtInput} type="file" accept=".srt,text/plain" aria-label="Загрузить SRT" hidden onChange={e => importSrt(e.target.files?.[0])} />
                <button className="demo-link compact" disabled={busy || asrBusy} onClick={() => srtInput.current?.click()}>{srt ? "Заменить файлом SRT" : "Загрузить SRT с таймингом"}</button>
                <span className="field-label spaced">Расположение субтитров</span>
                <div className="mode mode-three" role="group" aria-label="Расположение субтитров">
                  {[["high","Выше"],["normal","Обычно"],["low","Ниже"]].map(([key,label]) =>
                    <button key={key} type="button" disabled={busy} aria-pressed={captionPosition === key} onClick={() => {setCaptionPosition(key); invalidate();}}>{label}</button>)}
                </div>
                <label className="voice-level"><span>Положение лица по вертикали <b>{faceY}%</b></span>
                  <input type="range" aria-label="Положение лица по вертикали" min="5" max="90" step="1" value={faceY} disabled={busy} onChange={e => {setFaceY(Number(e.target.value)); invalidate();}} /></label>
                {captionHitsFace && <p className="auto-info">Субтитры пересекаются с зоной лица — в предпросмотре и экспорте они автоматически сдвинуты в безопасную зону ({effectiveCaptionPosition === "low" ? "ниже" : "выше"}).</p>}
              </details>
            </div>
            <div className="section takes-section" hidden={activeTab !== "check"}>
              <div className="sec-title"><div className="sec-name"><LuScissors size={15} /> Предложения и дубли</div></div>
              {!takesPlan?.sentences?.length ? <p className="hint">Создай черновик или быстрый черновик при субтитрах с таймингом слов — здесь появятся предложения и выбранные дубли.</p> :
              <div className="cuts-list" aria-label="Предложения и дубли">
                {takesPlan.sentences.map((s, i) => { const key = String(s.text || "").trim().toLowerCase(); const alt = takesPlan.rejected?.find(r => String(r.text || "").trim().toLowerCase() === key); const isCut = silences.some(c => c.enabled && c.from < s.end && c.to > s.start); return <div className="cut-row take-row" key={i}><span className="take-text">{s.text} <small>дубль {preciseTime(s.start)}</small></span><button type="button" className="text-action" disabled={busy} onClick={() => toggleSentence(s)}>{isCut ? "Вернуть предложение" : "Вырезать предложение"}</button>{alt && <button type="button" className="text-action" disabled={busy} onClick={() => swapTake(s)}>Заменить дубль ({preciseTime(alt.start)})</button>}</div>; })}
              </div>}
            </div>
            <div className="section recipe-section" hidden={activeTab !== "check"}>
              <div className="sec-title">
                <div className="sec-name"><LuSparkles size={15} /> Готовый вид</div>
              </div>
              <p className="hint">Один клик меняет всё сразу: как появляются слова, как движется кадр, какая графика и какое зерно. Это не названия для галочки.</p>
              <div className="recipe-grid" role="group" aria-label="Готовые приёмы монтажа">
                {GHOST_RECIPES.map(r => { const s = styleById(r.style); return (
                  <button key={r.id} type="button" className={"recipe-card" + (ghostRecipe === r.id ? " active" : "")}
                    aria-pressed={ghostRecipe === r.id} disabled={busy} onClick={() => applyRecipe(r.id)}>
                    <span className="recipe-preview" style={{"--fx-accent":s.accent}} data-kinetic={s.kinetic} data-film={s.film}>
                      <b>{r.label}</b><i />
                    </span>
                    <strong>{r.name}</strong>
                    <small>{r.what}</small>
                    <span className="recipe-parts">{r.caption} · {r.graphic} · {r.motion}</span>
                  </button>
                )})}
              </div>
              <p className="hint">Нажми карточку — откроется пример на встроенном видео. Слова и сцены берутся только из твоих субтитров.</p>
              <details className="advanced-box">
                <summary>Палитра и заголовок</summary>
                <span className="field-label">Палитра</span>
                <div className="preset-grid" role="group" aria-label="Стиль оформления">
                  {Object.entries(PRESETS).map(([key, value]) => (
                    <button key={key} type="button" className="preset-card" aria-label={`${value.name} — стиль оформления`}
                      aria-pressed={preset === key} disabled={busy} onClick={() => { setPreset(key); invalidate(); }}>
                      <span className={`preset-sample preset-${key}`} aria-hidden="true"><i /><span className="sample-window" /><b>Твой <em>текст</em></b><span className="sample-rule" /></span>
                      <span className="preset-name">{value.name}</span><span className="preset-note">{value.note}</span>
                    </button>
                  ))}
                </div>
                <label className="headline-label">
                  <span className="field-label spaced">Заголовок в начале (необязательно)</span>
                  <input className="headline-input" type="text" maxLength={60} value={headline} disabled={busy}
                    placeholder="Например: Важная идея" onChange={(e) => { autoHeadlineRef.current=null;setHeadline(e.target.value); invalidate(); }} />
                </label>
                <p className="hint">Заголовок собирается в отдельную сцену в начале ролика. Тип движения зависит от выбранного приёма выше.</p>
              </details>
            </div>
            <div className="section review-section" aria-label="План и проверка" hidden={activeTab !== "export"}>
              <div className="sec-title">
                <div className="sec-name"><LuCircleCheck size={15} /> План и проверка</div>
                
              </div>
              {!ready ? <p className="hint">Загрузи видео, чтобы увидеть план и подсказки.</p> : <>
                <p className="hint auto-intro">Проверка сравнивает только время, а не смысл или звук. Время ниже — по исходнику, до склеек.</p>
                {!review.timedCuesInRange && <p className="review-note">В выбранном фрагменте нет субтитров с таймингом: пересечения пауз с речью проверить по тексту нельзя.</p>}
                {review.warnings.length > 0 ? <details className="review-box">
                  <summary>Что проверить <span>{review.warnings.length}</span></summary>
                  <div className="review-list" aria-label="Предупреждения">
                    {review.warnings.slice(0, 16).map((item, i) => <button type="button" className="review-row" key={`${item.code}-${i}`}
                      disabled={busy} onClick={() => jumpTo(item.time)}>
                      <span className="review-time">{preciseTime(item.time)}</span>
                      <span><strong>{item.title}</strong>{item.detail && <small>{item.detail}</small>}</span>
                    </button>)}
                    {review.warnings.length > 16 && <p className="review-more">Показаны первые 16 из {review.warnings.length}. Исправь их, чтобы увидеть остальные.</p>}
                  </div>
                </details> : <p className="review-note">Явных пересечений по доступным таймингам не найдено. Это не гарантия качества.</p>}
                <details className="review-box plan-box">
                  <summary>План заголовка и графики <span>{review.events.length}</span></summary>
                  {review.events.length ? <div className="review-list" aria-label="План графики">
                    {review.events.slice(0, 24).map((event) => <button type="button" className="review-row" key={event.key}
                      disabled={busy || event.removed} onClick={() => jumpTo(event.to === null ? event.seek : Math.min(event.to - .01, event.seek + .12))}>
                      <span className="review-time">{preciseTime(event.from)}</span>
                      <span><strong>{event.type}: {event.title}</strong><small>{event.removed ? "Полностью в вырезанной паузе" : event.layout === "scene" ? "Полная сцена" : "Нажми, чтобы посмотреть"}</small></span>
                    </button>)}
                    {review.events.length > 24 && <p className="review-more">Показаны первые 24 из {review.events.length} элементов.</p>}
                  </div> : <p className="review-more">Добавь заголовок или графический элемент.</p>}
                </details>
                <details className="review-box plan-box"><summary>Лист проверки ghost-editor <span>{approvalSheet.length}</span></summary>
                  {approvalSheet.length ? <div className="review-list" aria-label="Кадры на склейках и сценах">
                    {approvalSheet.map((point,i) => <button type="button" className="review-row" key={`${point.kind}-${i}`}
                      disabled={busy} onClick={() => jumpTo(point.time)}>
                      <span className="review-time">{preciseTime(point.time)}</span>
                      <span><strong>{point.title}</strong><small>{point.detail}</small></span>
                    </button>)}
                  </div> : <p className="review-more">Склеек и сцен нет — лист проверки пуст.</p>}
                </details>
                {ghostWarnings.length > 0 && <div className="review-note" role="status">
                  {ghostWarnings.map((w,i) => <p key={`${w.code}-${i}`}><strong>{w.title}.</strong> {w.detail}</p>)}
                </div>}
                <label className="voice-consent"><input type="checkbox" checked={approved} disabled={busy}
                  onChange={e => setApproved(e.target.checked)} />
                  <span>Я просмотрел(а) склейки и сцены из листа проверки, текст и зону лица.</span></label>
                <p className="hint">Согласие нужно перед сборкой, как в ghost-editor. Проверка по таймингам не заменяет просмотр готового ролика.</p>
              </>}
            </div>
            {activeTab !== "export" && <div className="next-step">
              <button type="button" disabled={!ready || busy || projectBusy} onClick={() => goTab(({load:"check",check:"export"})[activeTab])}>
                {({load:"Далее: проверить",check:"Далее: экспорт"})[activeTab]} <LuArrowRight size={16}/>
              </button>
              <span>Шаги можно пропускать и менять в любом порядке.</span>
            </div>}
            <div className="side-action">
              <div className="export-settings">
                <span>Размер MP4</span>
                <div className="quality-switch" role="group" aria-label="Разрешение видео">
                  <button type="button" aria-pressed={resolution === 720} disabled={busy} onClick={() => {setResolution(720); invalidate();}}>720p</button>
                  <button type="button" aria-pressed={resolution === 1080} disabled={busy} onClick={() => {setResolution(1080); invalidate();}}>1080p</button>
                </div>
              </div>
              {result && !busy ? (
                <a
                  className="primary success"
                  href={result.url}
                  download={result.name}
                >
                  <LuDownload size={16} /> Скачать MP4
                </a>
              ) : (
                <button
                  className="primary"
                  onClick={busy ? () => abortRef.current?.() : exportClip}
                  disabled={(!ready && !busy) || voiceBusy || musicBusy || analysisBusy || asrBusy || draftBusy || quickBusy ||
                    (!busy && approvalSheet.length > 0 && !approved)}
                >
                  {busy ? (
                    <>
                      <LuPause size={16} /> Отменить экспорт
                    </>
                  ) : (
                    <>
                      <LuSparkles size={16} /> Собрать ролик
                    </>
                  )}
                </button>
              )}
              <p className="action-note">
                {resolution === 1080 ? "1080 × 1920" : "720 × 1280"} · 30 кадров/с. {voice && music ? "С озвучкой и музыкой." : voice ? "С озвучкой." : music ? "С музыкой." : "Со звуком исходника."}
              </p>
              {resolution === 1080 && <p className="action-note subtle">1080p не добавит деталей исходнику меньшего размера.</p>}
              {busy && (
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow={pct}
                >
                  <span style={{ width: pct + "%" }} />
                </div>
              )}
              {message && (
                <div
                  className={"feedback" + (message.error ? " error" : "")}
                  role="status"
                >
                  {message.text}
                </div>
              )}
              {result && !busy && (
                <button
                  className="demo-link compact"
                  onClick={() => {
                    setResult(null);
                    setMessage(null);
                  }}
                >
                  Изменить настройки и собрать ещё раз
                </button>
              )}
            </div>
          </aside>
        </div>
        <div className="footnote">
          <span>Проверь текст, склейки и готовый ролик перед публикацией.</span>
          <span><a href="./desktop/kadr-desktop.zip" download>Скачать для Windows</a>
            {location.protocol !== "file:" && <> · <a href="./LICENSES.txt" target="_blank" rel="noreferrer">Лицензии</a></>}
          </span>
        </div>
      </main>
      {videoImportBusy && <div className="dialog-backdrop" onKeyDown={e => {
        if (e.key === "Escape") videoImportAbort.current?.abort();
        if (e.key === "Tab") { e.preventDefault(); e.currentTarget.querySelector("button")?.focus(); }
      }}>
        <div className="confirm-dialog conversion-dialog" role="dialog" aria-modal="true" aria-labelledby="conversion-title">
          <h2 id="conversion-title">Подготовка видео</h2>
          <p role="status">{videoImportStatus}</p>
          {videoImportProgress !== null && <div className="conversion-progress" role="progressbar"
            aria-label="Преобразование видео" aria-valuemin="0" aria-valuemax="100" aria-valuenow={videoImportProgress}>
            <span style={{width:videoImportProgress+"%"}} />
          </div>}
          <p className="conversion-note">Оставь страницу открытой. Твой видеофайл не отправляется на сервер.</p>
          <div className="confirm-actions">
            <button type="button" autoFocus className="project-button" onClick={() => {
              setVideoImportStatus("Останавливаем…"); videoImportAbort.current?.abort();
            }}>Остановить</button>
          </div>
        </div>
      </div>}
      {confirmReplace && <div className="dialog-backdrop" onKeyDown={e => {
        if (e.key === "Escape") setConfirmReplace(null);
        if (e.key === "Tab") {
          const buttons=[...e.currentTarget.querySelectorAll(".confirm-dialog button:not(:disabled)")];
          const first=buttons[0],last=buttons[buttons.length-1];
          if (e.shiftKey && document.activeElement === first) {e.preventDefault();last?.focus();}
          else if (!e.shiftKey && document.activeElement === last) {e.preventDefault();first?.focus();}
        }
      }}>
        <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="replace-title" aria-describedby="replace-description">
          <h2 id="replace-title">Сохранить текущий проект?</h2>
          <p id="replace-description">При открытии другого видео или проекта несохранённые изменения будут потеряны. Вернись и нажми «Сохранить проект», если хочешь продолжить позже.</p>
          <div className="confirm-actions">
            <button type="button" className="project-button" autoFocus onClick={() => setConfirmReplace(null)}>Вернуться</button>
            <button type="button" className="confirm-danger" onClick={() => {const action=confirmReplace;setConfirmReplace(null);action();}}>Продолжить без сохранения</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
