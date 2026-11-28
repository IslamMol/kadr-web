import { drawTalkingHead } from "./talking-head.js";

// Кадр 3.0: отдельный safely-bounded рендер для превью шаблонов.
// Он НЕ участвует в экспорте — только показывает систему шаблона в 9:16.
// Каждая строка рисуется с maxWidth, поэтому текст не может вылезти за кадр.

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const font = (ctx, size, weight = 800) => {
  ctx.font = `${weight} ${Math.round(size)}px "Kadr Manrope", sans-serif`;
};

function rr(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function wrap(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = w; }
    else line = next;
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.length ? lines : [""];
}

function drawFrame(ctx, frame, W, H) {
  if (frame) {
    const scale = Math.max(W / frame.width, H / frame.height);
    const w = frame.width * scale, h = frame.height * scale;
    ctx.drawImage(frame, (W - w) / 2, (H - h) / 2, w, h);
    return;
  }
  drawTalkingHead(ctx, W, H, 0);
}

function drawLook(ctx, tpl, W, H, frameIndex) {
  const light = ["paper", "halftone", "magazine", "board", "graph"].includes(tpl.look);
  ctx.fillStyle = light ? "rgba(250,248,242,.10)" : "rgba(8,10,15,.20)";
  ctx.fillRect(0, 0, W, H);
  if (tpl.look === "cinematic" || tpl.look === "ink" || tpl.look === "halftone") {
    let seed = 9001 + frameIndex * 17;
    ctx.save(); ctx.fillStyle = "rgba(255,240,210,.06)";
    for (let i = 0; i < 90; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const x = seed % W;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      ctx.fillRect(x, seed % H, 2, 2);
    }
    ctx.restore();
  }
}

function drawGraphic(ctx, tpl, W, H, p, progress) {
  const pad = Math.round(W * 0.08);
  const rowW = W - pad * 2;
  const top = Math.round(H * 0.15);
  const accent = tpl.accent;
  const label = String(tpl.sample || tpl.name).trim().split(/\s+/).slice(0, 2).join(" ").slice(0, 14);
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.65 * ease(progress);

  if (tpl.graphic === "number" || tpl.graphic === "stats") {
    font(ctx, W * 0.14, 900); ctx.fillStyle = accent; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("39%", pad, top, rowW);
    font(ctx, W * 0.045, 700); ctx.fillStyle = "#ffffff";
    ctx.fillText(label, pad, top + W * 0.16, rowW);
    for (let i = 0; i < 3; i++) ctx.fillRect(pad, top + W * 0.25 + i * W * 0.07, rowW * (1 - i * 0.24), Math.max(3, W * 0.012));
  } else if (tpl.graphic === "quote") {
    rr(ctx, pad, top, rowW, H * 0.25, 18, "rgba(255,255,255,.10)");
    font(ctx, W * 0.09, 900); ctx.fillStyle = accent; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("“", pad + 10, top + 10);
    font(ctx, W * 0.05, 700); ctx.fillStyle = "#ffffff";
    ctx.fillText(label, pad + 10, top + W * 0.13, rowW - 20);
  } else if (tpl.graphic === "diagram" || tpl.graphic === "list") {
    rr(ctx, pad, top, rowW, H * 0.28, 16, "rgba(255,255,255,.10)");
    for (let i = 0; i < 3; i++) {
      const y = top + H * 0.04 + i * H * 0.075;
      ctx.beginPath(); ctx.arc(pad + W * 0.07, y, W * 0.035, 0, Math.PI * 2);
      ctx.fillStyle = accent; ctx.fill();
      font(ctx, W * 0.035, 900); ctx.fillStyle = "#101217"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), pad + W * 0.07, y);
      font(ctx, W * 0.042, 700); ctx.fillStyle = "#ffffff"; ctx.textAlign = "left";
      ctx.fillText(label, pad + W * 0.14, y, rowW - W * 0.16);
    }
  } else if (tpl.graphic === "behind" || tpl.graphic === "morph") {
    font(ctx, W * 0.13 * (0.85 + 0.15 * ease(progress)), 900);
    ctx.globalAlpha *= 0.55; ctx.fillStyle = accent;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label.toUpperCase(), W / 2, H * 0.30, rowW);
  } else if (tpl.graphic === "ui" || tpl.graphic === "glass") {
    rr(ctx, pad, top, rowW, H * 0.28, 18, tpl.graphic === "ui" ? "rgba(10,12,18,.94)" : "rgba(255,255,255,.16)");
    ctx.fillStyle = accent; ctx.fillRect(pad, top, rowW, Math.max(3, W * 0.008));
    font(ctx, W * 0.052, 800); ctx.fillStyle = "#ffffff"; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(label, pad + 14, top + 22, rowW - 28);
    font(ctx, W * 0.04, 600); ctx.fillStyle = "rgba(255,255,255,.72)";
    ctx.fillText("01 → 02 → 03", pad + 14, top + W * 0.13, rowW - 28);
  } else {
    rr(ctx, pad, top, rowW, H * 0.18, 16, "rgba(255,255,255,.12)");
    font(ctx, W * 0.06, 900); ctx.fillStyle = accent; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label.toUpperCase(), W / 2, top + H * 0.09, rowW - 20);
  }
  ctx.restore();
}

function drawCaption(ctx, tpl, W, H, activeIndex) {
  const pad = Math.round(W * 0.07);
  const text = String(tpl.sample || tpl.name);
  const y = Math.round(H * 0.80);
  const h = Math.round(H * 0.14);
  rr(ctx, pad, y, W - pad * 2, h, 16, "rgba(8,10,14,.68)");
  font(ctx, W * 0.062, 800);
  ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const words = text.split(/\s+/).filter(Boolean).slice(0, 2);
  const lines = wrap(ctx, words.join(" ") || text, W - pad * 2 - 20, 2);
  lines.forEach((line, i) => ctx.fillText(line, W / 2, y + h / 2 + (i - (lines.length - 1) / 2) * W * 0.075, W - pad * 2 - 20));
}

export function renderTemplatePreview(ctx, tpl, t = 0, frame = null) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  drawFrame(ctx, frame, W, H);
  drawLook(ctx, tpl, W, H, Math.floor(t * 8));

  const pad = Math.round(W * 0.06);
  rr(ctx, pad, pad, W - pad * 2, Math.round(H * 0.055), 10, "rgba(8,10,14,.55)");
  font(ctx, W * 0.045, 800); ctx.fillStyle = tpl.accent; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(tpl.name.toUpperCase(), pad + 12, pad + H * 0.028, W - pad * 2 - 24);

  const cycle = ((t % 2.4) + 2.4) % 2.4;
  drawGraphic(ctx, tpl, W, H, Math.min(cycle / 0.5, 1));
  const words = String(tpl.sample || tpl.name).split(/\s+/).filter(Boolean);
  drawCaption(ctx, tpl, W, H, Math.floor((cycle / 2.4) * words.length) % Math.max(1, words.length));
  ctx.restore();
}
