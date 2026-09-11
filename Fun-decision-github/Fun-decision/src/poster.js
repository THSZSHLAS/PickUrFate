// Share poster: a 1080×1920 image with the drawn hexagram, the question, the judgment,
// a one-line reading and a QR code back to the game.

import { loadImage } from "./cardRenderer.js";
import { drawQR } from "./qrcode.js";

const W = 1080;
const H = 1920;
const GOLD = "#f1d68f";
const PAPER_INK = "#1d2b31";
const CINNABAR = "#b8473a";
const DISPLAY = '"Ma Shan Zheng", "STKaiti", "KaiTi", serif';
const SERIF = '"Noto Serif SC", "Songti SC", "SimSun", serif';

function wrap(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let current = "";
  for (const char of text) {
    if (ctx.measureText(current + char).width > maxWidth && current) {
      lines.push(current);
      current = char;
      if (lines.length === maxLines) break;
    } else {
      current += char;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  const used = lines.join("").length;
  if (used < [...text].length && lines.length) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

function drawLines(ctx, lines, x, y, lineHeight, align = "center") {
  ctx.textAlign = align;
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function drawHexagram(ctx, bits, moving, cx, top, width, barH, gap) {
  // Top line first; bits are bottom-first.
  for (let row = 0; row < 6; row += 1) {
    const index = 5 - row;
    const y = top + row * (barH + gap);
    const x = cx - width / 2;
    ctx.fillStyle = PAPER_INK;
    if (bits[index]) ctx.fillRect(x, y, width, barH);
    else {
      ctx.fillRect(x, y, width * 0.42, barH);
      ctx.fillRect(x + width * 0.58, y, width * 0.42, barH);
    }
    if (moving.includes(index)) {
      ctx.fillStyle = CINNABAR;
      ctx.beginPath();
      ctx.arc(x + width + barH * 1.6, y + barH / 2, barH * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export async function renderPoster({ primary, relating, moving = [], movingNames = [], category, question, siteUrl, assets }) {
  await Promise.all([
    document.fonts?.load(`96px ${DISPLAY}`),
    document.fonts?.load(`32px ${SERIF}`),
  ].filter(Boolean)).catch(() => {});
  const [bg, face] = await Promise.all([loadImage(assets.background), loadImage(assets.cardFace)]);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Background: cover-fit landscape, then an ink wash so text stays readable.
  const scale = Math.max(W / bg.width, H / bg.height);
  ctx.drawImage(bg, (W - bg.width * scale) / 2, (H - bg.height * scale) / 2, bg.width * scale, bg.height * scale);
  const wash = ctx.createLinearGradient(0, 0, 0, H);
  wash.addColorStop(0, "rgba(4, 12, 20, 0.55)");
  wash.addColorStop(0.45, "rgba(4, 12, 20, 0.25)");
  wash.addColorStop(0.7, "rgba(4, 12, 20, 0.7)");
  wash.addColorStop(1, "rgba(4, 12, 20, 0.92)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  // Frame.
  ctx.strokeStyle = "rgba(233, 196, 110, 0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.strokeStyle = "rgba(233, 196, 110, 0.22)";
  ctx.strokeRect(54, 54, W - 108, H - 108);

  // Header.
  ctx.fillStyle = GOLD;
  ctx.font = `96px ${DISPLAY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("一念一卦", 96, 196);
  ctx.font = `30px ${DISPLAY}`;
  ctx.fillStyle = "rgba(242, 221, 168, 0.8)";
  ctx.fillText("心 有 所 问 ， 卦 有 所 应", 100, 246);
  const now = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  ctx.textAlign = "right";
  ctx.font = `28px ${SERIF}`;
  ctx.fillStyle = "rgba(242, 221, 168, 0.75)";
  ctx.fillText(date, W - 96, 168);
  ctx.font = `36px ${DISPLAY}`;
  ctx.fillStyle = GOLD;
  ctx.fillText(category.label, W - 96, 222);

  // Question.
  ctx.font = `44px ${DISPLAY}`;
  ctx.fillStyle = "#f6e6bb";
  const asked = question?.trim() ? `「${question.trim()}」` : `心中默念 · ${category.label}`;
  drawLines(ctx, wrap(ctx, asked, W - 200, 2), W / 2, 350, 60);

  // The card.
  const cardW = 420;
  const cardH = Math.round(cardW * (face.height / face.width));
  const cardX = (W - cardW) / 2;
  const cardY = 470;
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.drawImage(face, cardX, cardY, cardW, cardH);
  ctx.restore();
  ctx.textAlign = "center";
  ctx.fillStyle = "#7c4638";
  ctx.font = `24px ${SERIF}`;
  ctx.fillText(`第 ${primary.id} 卦 · ${primary.fullName}`, W / 2, cardY + 78);
  ctx.fillStyle = PAPER_INK;
  ctx.font = `${primary.name.length > 1 ? 92 : 112}px ${DISPLAY}`;
  ctx.fillText(primary.name, W / 2, cardY + 196);
  drawHexagram(ctx, primary.bits, moving, W / 2, cardY + 236, cardW * 0.5, 15, 13);
  ctx.font = `24px ${SERIF}`;
  ctx.fillStyle = "#843c34";
  const tone = primary.tone;
  const toneW = ctx.measureText(tone).width + 40;
  ctx.strokeStyle = "rgba(137, 60, 48, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(W / 2 - toneW / 2, cardY + 418, toneW, 40);
  ctx.fillText(tone, W / 2, cardY + 446);

  // Words under the card.
  let y = cardY + cardH + 74;
  ctx.font = `32px ${SERIF}`;
  ctx.fillStyle = "rgba(241, 214, 143, 0.9)";
  y = drawLines(ctx, wrap(ctx, `「${primary.judgment}」`, W - 220, 2), W / 2, y, 46) + 26;
  ctx.font = `46px ${DISPLAY}`;
  ctx.fillStyle = "#f7e8c0";
  y = drawLines(ctx, wrap(ctx, primary.text, W - 200, 2), W / 2, y + 10, 64) + 10;
  if (relating && moving.length) {
    ctx.font = `30px ${SERIF}`;
    ctx.fillStyle = "#e39a86";
    drawLines(ctx, [`${movingNames.join("、")} 动 · 之卦「${relating.name}」`], W / 2, y + 18, 40);
  }

  // Footer: keywords, disclaimer, QR.
  const qrSize = 196;
  const qrX = W - 96 - qrSize;
  const qrY = H - 96 - qrSize;
  ctx.save();
  ctx.fillStyle = "#f6ecd2";
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 20;
  ctx.fillRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);
  ctx.restore();
  drawQR(ctx, siteUrl, qrX, qrY, qrSize);
  ctx.textAlign = "left";
  ctx.font = `40px ${DISPLAY}`;
  ctx.fillStyle = GOLD;
  ctx.fillText(primary.keywords, 96, H - 216);
  ctx.font = `28px ${DISPLAY}`;
  ctx.fillStyle = "rgba(242, 221, 168, 0.85)";
  ctx.fillText("扫码 · 你也抽一卦", 96, H - 160);
  ctx.font = `20px ${SERIF}`;
  ctx.fillStyle = "rgba(236, 221, 183, 0.5)";
  ctx.fillText("娱乐体验，仅作自我观察与灵感参考", 96, H - 112);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png"));
}
