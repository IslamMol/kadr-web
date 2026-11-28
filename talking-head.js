// Кадр 3.0: локальный макет говорящей головы для превью и примеров.
// Не фотография и не AI — аккуратный векторный стенд, чтобы было видно,
// как шаблон работает именно на разговорном видео.

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

export function drawTalkingHead(ctx, W, H, t = 0) {
  const sway = Math.sin(t * 1.7) * W * 0.006;
  ctx.save();
  ctx.clearRect(0, 0, W, H);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#2a3644"); bg.addColorStop(0.55, "#1b2430"); bg.addColorStop(1, "#10151d");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const light = ctx.createRadialGradient(W * 0.5, H * 0.42, W * 0.05, W * 0.5, H * 0.42, W * 0.85);
  light.addColorStop(0, "rgba(255,235,205,.16)");
  light.addColorStop(1, "rgba(255,235,205,0)");
  ctx.fillStyle = light; ctx.fillRect(0, 0, W, H);

  ctx.translate(sway, 0);

  const cx = W * 0.5;
  const shoulderY = H * 0.76;

  // Плечи / пиджак
  ctx.beginPath();
  ctx.moveTo(W * 0.08, H);
  ctx.bezierCurveTo(W * 0.12, shoulderY, W * 0.30, shoulderY - H * 0.04, cx, shoulderY - H * 0.04);
  ctx.bezierCurveTo(W * 0.70, shoulderY - H * 0.04, W * 0.88, shoulderY, W * 0.92, H);
  ctx.closePath();
  ctx.fillStyle = "#1a2231"; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.10)"; ctx.lineWidth = Math.max(1, W * 0.004); ctx.stroke();

  // Рубашка
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.13, shoulderY - H * 0.02);
  ctx.lineTo(cx, shoulderY + H * 0.16);
  ctx.lineTo(cx + W * 0.13, shoulderY - H * 0.02);
  ctx.closePath();
  ctx.fillStyle = "#dfe6f0"; ctx.fill();

  // Шея
  const neckW = W * 0.20, neckH = H * 0.13;
  ctx.fillStyle = "#bf8664";
  ctx.fillRect(cx - neckW / 2, shoulderY - neckH * 0.75, neckW, neckH);

  // Голова
  const headY = H * 0.52, headW = W * 0.42, headH = H * 0.27;
  ctx.beginPath();
  ctx.ellipse(cx, headY, headW / 2, headH / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#d6a07b"; ctx.fill();

  // Уши
  ctx.fillStyle = "#c89570";
  ctx.beginPath(); ctx.ellipse(cx - headW / 2, headY + H * 0.01, W * 0.035, H * 0.022, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + headW / 2, headY + H * 0.01, W * 0.035, H * 0.022, 0, 0, Math.PI * 2); ctx.fill();

  // Волосы
  ctx.beginPath();
  ctx.moveTo(cx - headW * 0.54, headY - headH * 0.10);
  ctx.bezierCurveTo(cx - headW * 0.48, headY - headH * 0.78, cx + headW * 0.48, headY - headH * 0.78, cx + headW * 0.54, headY - headH * 0.10);
  ctx.bezierCurveTo(cx + headW * 0.40, headY - headH * 0.42, cx - headW * 0.40, headY - headH * 0.42, cx - headW * 0.54, headY - headH * 0.10);
  ctx.closePath();
  ctx.fillStyle = "#2a211d"; ctx.fill();

  // Брови и глаза
  ctx.strokeStyle = "#2a211d"; ctx.lineWidth = Math.max(1, W * 0.008); ctx.lineCap = "round";
  [-1, 1].forEach(side => {
    const ex = cx + side * headW * 0.20;
    ctx.beginPath(); ctx.moveTo(ex - W * 0.045, headY - H * 0.025); ctx.lineTo(ex + W * 0.045, headY - H * 0.035); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(ex, headY + H * 0.005, W * 0.022, H * 0.009, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1512"; ctx.fill();
  });

  // Нос
  ctx.strokeStyle = "rgba(90,55,40,.45)"; ctx.lineWidth = Math.max(1, W * 0.005);
  ctx.beginPath(); ctx.moveTo(cx, headY + H * 0.01); ctx.lineTo(cx - W * 0.012, headY + H * 0.055); ctx.stroke();

  // Рот — синхронизирован с временем, как у говорящего человека
  const open = 0.25 + 0.75 * Math.abs(Math.sin(t * 9));
  const mouthY = headY + H * 0.095;
  ctx.beginPath();
  ctx.ellipse(cx, mouthY, W * 0.055, H * 0.008 * (0.5 + open), 0, 0, Math.PI * 2);
  ctx.fillStyle = "#6f3b32"; ctx.fill();
  ctx.strokeStyle = "rgba(90,45,38,.6)"; ctx.lineWidth = Math.max(1, W * 0.004);
  ctx.beginPath(); ctx.moveTo(cx - W * 0.055, mouthY); ctx.quadraticCurveTo(cx, mouthY + H * 0.01 * open, cx + W * 0.055, mouthY); ctx.stroke();

  // Мягкий свет на лице
  const rim = ctx.createLinearGradient(cx - headW / 2, 0, cx + headW / 2, 0);
  rim.addColorStop(0, "rgba(255,255,255,.10)");
  rim.addColorStop(0.5, "rgba(255,255,255,0)");
  rim.addColorStop(1, "rgba(0,0,0,.12)");
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.ellipse(cx, headY, headW / 2, headH / 2, 0, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}
