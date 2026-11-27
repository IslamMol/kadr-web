// Кадр 3.0: один кадр, одна функция. Браузерный превью и MP4 вызывают
// renderFrame с тем же EDL и тем же временем — значит картинка совпадает.
// Никаких таймеров, Math.random и обращений к DOM внутри рендера.
import { frameState, hashEdl } from "./edl.js";

const PALETTE = {
  clean:     { bg: "#0d0f12", fg: "#f8f8f6", accent: "#ffd23f", muted: "#a9b0bd" },
  editorial: { bg: "#0a0a0c", fg: "#f4f2ef", accent: "#d13f34", muted: "#ada4a2" },
  kinetic:   { bg: "#141414", fg: "#fff4df", accent: "#ff5a1f", muted: "#c3bdb3" },
  cinematic: { bg: "#0f0f10", fg: "#ede6da", accent: "#e7c27a", muted: "#b7ad9e" },
  launch:    { bg: "#0e0e12", fg: "#f6f4ff", accent: "#7c5cff", muted: "#b6b2c5" },
  magazine:  { bg: "#fff0f6", fg: "#111111", accent: "#ff2e88", muted: "#7f6972" },
};
const ease = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const wordActive = (cue, w, t) => !!cue && t >= w.start && t < w.end;
const wordDone = (cue, w, t) => !!cue && t >= w.end;

function colorFrom(src) {
  let h = 2166136261;
  for (let i = 0; i < String(src).length; i++) { h ^= String(src).charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return `hsl(${h % 360} 18% 16%)`;
}
function font(ctx, size, weight = 800) {
  ctx.font = `${weight} ${Math.round(size)}px "Kadr Manrope", "Segoe UI", sans-serif`;
}
function rr(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  } else ctx.fillRect(x, y, w, h);
}
function lines(ctx, words, maxWidth, template) {
  const out = []; let row = [], width = 0;
  for (const w of words) {
    const measure = typeof ctx.measureText === "function" ? ctx.measureText(template === "upper" ? w.text.toUpperCase() : w.text).width : w.text.length * 24;
    const ww = Math.min(maxWidth, measure || w.text.length * 24);
    if (row.length && width + ww > maxWidth) { out.push(row); row = []; width = 0; }
    row.push({ ...w, width: ww });
    width += ww + 18;
  }
  if (row.length) out.push(row);
  return out;
}

function drawClip(ctx, state, edl, sources) {
  const { width: W, height: H } = edl.output, clip = state.clip;
  if (!clip) return;
  const src = sources?.[clip.src];
  const zoom = clip.crop.zoom;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2, -H / 2);
  if (typeof src === "function") src(ctx, { x: 0, y: 0, w: W, h: H }, state.localT, edl, state);
  else if (src && typeof src.draw === "function") src.draw(ctx, { x: 0, y: 0, w: W, h: H }, state.localT, edl, state);
  else { ctx.fillStyle = src?.color || colorFrom(clip.src); ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

function drawCaption(ctx, cue, edl, state, palette) {
  if (!cue?.text?.trim()) return;
  const t = state.t, { width: W, height: H } = edl.output;
  const template = cue.template || "clean";
  const activeWord = cue.words.find(w => wordActive(cue, w, t)) || null;
  let motionScale = 1;
  if (!state.reducedMotion && state.motion?.type === "word-slam") {
    motionScale = 1 + 0.22 * (1 - ease((t - state.motion.at) / state.motion.duration));
  }
  const size = Math.max(46, Math.min(84, Math.round(W * 0.062)));
  font(ctx, size, template === "outline" ? 900 : 800);
  const rows = lines(ctx, cue.words, W - 150, template);
  const lineHeight = size * 1.16;
  const baseY = Math.round(H * 0.79) - rows.length * lineHeight / 2;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.translate(W / 2, baseY + rows.length * lineHeight / 2);
  ctx.scale(motionScale, motionScale);
  ctx.translate(-W / 2, -(baseY + rows.length * lineHeight / 2));
  rows.forEach((row, r) => {
    let x = (W - row.reduce((s, w) => s + w.width + 18, -18)) / 2;
    const y = baseY + r * lineHeight + lineHeight / 2;
    row.forEach((w) => {
      const on = activeWord === w || (cue.words.indexOf(activeWord) > cue.words.indexOf(w) && t >= w.start + 0.25);
      const done = wordDone(cue, w, t);
      const shown = template === "upper" ? w.text.toUpperCase() : template === "lower" ? w.text.toLowerCase() : w.text;
      ctx.save();
      ctx.globalAlpha = template === "karaoke" && !done && !on ? 0.32 : 1;
      if (template === "blur" && on) ctx.globalAlpha = 0.55 + 0.45 * ease((t - w.start) / 0.14);
      if (template === "highlighter" && on) rr(ctx, x - 5, y - size * 0.48, w.width + 10, size * 0.96, 8, palette.accent);
      if (template === "outline") {
        ctx.lineWidth = Math.max(2, size * 0.07);
        ctx.strokeStyle = on ? palette.accent : "rgba(6,7,9,.9)";
        if (typeof ctx.strokeText === "function") ctx.strokeText(shown, x, y);
      }
      ctx.fillStyle = on ? (template === "highlighter" ? palette.bg : palette.accent) : (done ? palette.fg : palette.muted);
      if (template === "pop" && on && !state.reducedMotion) {
        const p = 1 + 0.08 * ease((t - w.start) / 0.12);
        ctx.translate(x + w.width / 2, y); ctx.scale(p, p); ctx.translate(-x - w.width / 2, -y);
      }
      ctx.fillText(shown, x, y);
      ctx.restore();
      x += w.width + 18;
    });
  });
  ctx.restore();
}

function drawGraphic(ctx, g, edl, state, palette) {
  if (!g) return;
  const { width: W, height: H } = edl.output;
  const age = state.t - g.at;
  const reveal = state.reducedMotion ? 1 : ease(age / 0.34);
  const leave = state.reducedMotion ? 1 : 1 - ease((age - g.duration + 0.28) / 0.28);
  const alpha = clamp01(Math.min(reveal, leave));
  const accent = palette.accent;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(0, (1 - reveal) * 34);
  const pad = Math.round(W * 0.075), boxW = W - pad * 2;
  if (g.type === "quote") {
    rr(ctx, pad, H * 0.30, boxW, 300, 24, "rgba(255,255,255,.07)");
    font(ctx, Math.round(W * 0.075), 700);
    ctx.fillStyle = accent; ctx.textBaseline = "top"; ctx.textAlign = "left";
    ctx.fillText("“", pad + 24, H * 0.30 + 28);
    font(ctx, Math.round(W * 0.047), 700);
    ctx.fillStyle = palette.fg;
    ctx.fillText(g.label.slice(0, 90), pad + 28, H * 0.30 + 112, boxW - 56);
  } else if (g.type === "number") {
    font(ctx, Math.round(W * 0.19), 900);
    ctx.fillStyle = accent; ctx.textBaseline = "top"; ctx.textAlign = "left";
    ctx.fillText(g.value || "1", pad, H * 0.33);
    font(ctx, Math.round(W * 0.042), 700);
    ctx.fillStyle = palette.fg;
    ctx.fillText(g.label.slice(0, 70), pad, H * 0.56, boxW);
  } else if (g.type === "diagram") {
    font(ctx, Math.round(W * 0.052), 800);
    ctx.fillStyle = palette.fg; ctx.textBaseline = "top"; ctx.textAlign = "left";
    ctx.fillText(g.label.slice(0, 60), pad, H * 0.28, boxW);
    const steps = (g.steps.length ? g.steps : g.label.split(/\n|;|,/)).slice(0, 5).filter(Boolean);
    steps.forEach((s, i) => {
      const y = H * 0.40 + i * 130;
      rr(ctx, pad, y, boxW, 96, 14, "rgba(255,255,255,.06)");
      rr(ctx, pad + 14, y + 18, 58, 58, 12, accent);
      font(ctx, 24, 900); ctx.fillStyle = palette.bg; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1).padStart(2, "0"), pad + 43, y + 47);
      font(ctx, Math.round(W * 0.037), 700); ctx.fillStyle = palette.fg; ctx.textAlign = "left";
      ctx.fillText(s.slice(0, 60), pad + 94, y + 48, boxW - 120);
    });
  } else if (g.type === "chip") {
    rr(ctx, pad, H * 0.24, boxW, 180, 90, "rgba(255,255,255,.08)");
    font(ctx, Math.round(W * 0.055), 800);
    ctx.fillStyle = accent; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(g.label.slice(0, 48), W / 2, H * 0.24 + 90, boxW - 50);
  } else if (g.type === "lower-third") {
    rr(ctx, pad, H * 0.70, boxW, 150, 16, "rgba(8,9,11,.86)");
    ctx.fillStyle = accent; ctx.fillRect(pad, H * 0.70, 8, 150);
    font(ctx, Math.round(W * 0.043), 800);
    ctx.fillStyle = palette.fg; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(g.label.slice(0, 70), pad + 30, H * 0.70 + 75, boxW - 60);
  } else if (g.type === "stamp") {
    font(ctx, Math.round(W * 0.085), 900);
    ctx.fillStyle = accent; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.translate(W / 2, H * 0.40); ctx.rotate(-0.12);
    ctx.fillText(g.label.slice(0, 30).toUpperCase(), 0, 0, W - 120);
  } else {
    font(ctx, Math.round(W * 0.072), 900);
    ctx.fillStyle = accent; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(g.label.slice(0, 40), W / 2, H * 0.34, W - 110);
  }
  ctx.restore();
}

function drawTransition(ctx, edl, state) {
  const tr = state.transition;
  if (!tr || state.reducedMotion) return;
  const p = clamp01((state.t - tr.at) / tr.duration);
  const { width: W, height: H } = edl.output;
  ctx.save();
  if (tr.type === "flash") {
    ctx.globalAlpha = 1 - ease(p);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  } else if (tr.type === "dissolve") {
    ctx.globalAlpha = 0.45 * (1 - ease(p));
    ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, W, H);
  } else if (tr.type === "wipe") {
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000000"; ctx.fillRect(W * ease(p), 0, W, H);
  } else if (tr.type === "iris") {
    ctx.globalAlpha = 1; ctx.fillStyle = "#000000";
    const bar = Math.round(H * 0.5 * ease(p));
    ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
  }
  ctx.restore();
}

function drawLook(ctx, edl, state, palette) {
  const { width: W, height: H } = edl.output, look = edl.look;
  if (look.vignette > 0 && typeof ctx.createRadialGradient === "function") {
    const g = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.18, W / 2, H * 0.45, H * 0.82);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${(look.vignette * 0.55).toFixed(3)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (look.grain > 0) {
    const seed = (hashEdl(edl) ^ Math.imul(state.frame + 1, 2654435761)) >>> 0;
    let s = seed;
    const dots = Math.round(look.grain * 420);
    ctx.save(); ctx.fillStyle = palette.accent; ctx.globalAlpha = 0.055 + look.grain * 0.05;
    for (let i = 0; i < dots; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const x = s % W;
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const y = s % H;
      ctx.fillRect(x, y, 1.6, 1.6);
    }
    ctx.restore();
  }
}

export function renderFrame(ctx, edl, t, sources = {}) {
  const state = frameState(edl, t);
  const palette = { ...PALETTE[edl.look.preset], accent: edl.look.accent || PALETTE[edl.look.preset].accent };
  const { width: W, height: H } = edl.output;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, W, H);
  drawClip(ctx, state, edl, sources);
  drawCaption(ctx, state.cue, edl, state, palette);
  for (const g of state.graphics) drawGraphic(ctx, g, edl, state, palette);
  drawTransition(ctx, edl, state);
  drawLook(ctx, edl, state, palette);
  ctx.restore();
  return state;
}

export { PALETTE, ease };
