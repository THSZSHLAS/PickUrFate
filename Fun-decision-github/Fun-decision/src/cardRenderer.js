// Draws the whole sixty-four-card field onto ONE canvas.
// Sixty-four DOM cards meant ~300 composited layers (shadow, tilt, face, sheen, rim per card),
// which is what made phones stutter. Here every card is 3–5 drawImage calls of sprites that are
// pre-rendered once, so a frame costs almost nothing on the GPU.

import { CARD_RATIO, depthScale } from "./cardPhysics.js";

const MAX_SCALE = 1.62; // largest on-screen scale (the chosen card during the gather)
const imageCache = new Map();

export function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(img));
      img.onerror = reject;
      img.src = src;
    }));
  }
  return imageCache.get(src);
}

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Renders a blurred shape using the off-canvas shadow trick (works in every browser, unlike ctx.filter). */
function blurredRect(w, h, blur, color, spread = 0, passes = 1) {
  const pad = Math.ceil(blur * 2.2 + spread);
  const canvas = makeCanvas(w + pad * 2, h + pad * 2);
  const ctx = canvas.getContext("2d");
  const far = canvas.width + 50;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = far;
  ctx.fillStyle = "#000";
  for (let i = 0; i < passes; i += 1) {
    roundRect(ctx, pad - spread - far, pad - spread, w + spread * 2, h + spread * 2, Math.min(w, h) * 0.08 + spread);
    ctx.fill();
  }
  return { canvas, pad };
}

/**
 * Pre-render every sprite at the largest size it will ever be drawn, times the canvas DPR.
 * `cardW` is the field's base card width in CSS px.
 */
export async function buildSprites(backSrc, cardW, dpr) {
  const img = await loadImage(backSrc);
  const w = Math.round(cardW * MAX_SCALE * dpr);
  const h = Math.round(w * CARD_RATIO);

  const card = makeCanvas(w, h);
  const cardCtx = card.getContext("2d");
  cardCtx.imageSmoothingQuality = "high";
  cardCtx.drawImage(img, 0, 0, w, h);

  // Same silhouette in flat ink: drawn on top with alpha to push far cards back into the haze.
  const shade = makeCanvas(w, h);
  const shadeCtx = shade.getContext("2d");
  shadeCtx.drawImage(card, 0, 0);
  shadeCtx.globalCompositeOperation = "source-in";
  shadeCtx.fillStyle = "#06121c";
  shadeCtx.fillRect(0, 0, w, h);

  const shadow = blurredRect(w * 0.84, h * 0.86, w * 0.14, "rgba(1, 6, 12, 0.9)", 0, 1);
  const glow = blurredRect(w, h, w * 0.16, "rgba(244, 196, 96, 0.95)", w * 0.015, 2);

  // Crisp gold rim for hovered / held cards.
  const rim = makeCanvas(w + 8, h + 8);
  const rimCtx = rim.getContext("2d");
  rimCtx.strokeStyle = "rgba(255, 228, 160, 0.95)";
  rimCtx.lineWidth = Math.max(2, w * 0.018);
  roundRect(rimCtx, 4, 4, w, h, w * 0.055);
  rimCtx.stroke();

  // A diagonal glint, three card-widths wide; slid across the face while the card tilts.
  const sheen = makeCanvas(w * 3, h);
  const sheenCtx = sheen.getContext("2d");
  const gradient = sheenCtx.createLinearGradient(0, 0, w * 3, h * 0.35);
  gradient.addColorStop(0.38, "rgba(255, 226, 160, 0)");
  gradient.addColorStop(0.47, "rgba(255, 232, 176, 0.1)");
  gradient.addColorStop(0.5, "rgba(255, 246, 216, 0.26)");
  gradient.addColorStop(0.53, "rgba(255, 232, 176, 0.09)");
  gradient.addColorStop(0.62, "rgba(255, 226, 160, 0)");
  sheenCtx.fillStyle = gradient;
  sheenCtx.fillRect(0, 0, w * 3, h);

  return { card, shade, shadow, glow, rim, sheen, w, h };
}

const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

/**
 * @param quality "high" | "lite" — lite skips the glint and glow blur passes on weak devices.
 */
export function drawField(ctx, field, sprites, { dpr, dt, quality }) {
  const { width, height, cardW } = field;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!sprites) return;

  const heldId = field.grab?.id ?? null;
  const order = field.order ?? (field.order = field.bodies.slice());
  order.sort((a, b) => {
    const pa = a.id === heldId || a.id === field.chosenId || a.cast ? 9 : a.z;
    const pb = b.id === heldId || b.id === field.chosenId || b.cast ? 9 : b.z;
    return pa - pb;
  });

  const spriteToCss = 1 / (MAX_SCALE * dpr); // sprite px → CSS px at scale 1
  for (const body of order) {
    const emphasised = body.id === heldId || body.id === field.chosenId || body.cast ? 1 : body.id === field.hoverId ? 0.6 : 0;
    body.glow = damp(body.glow ?? 0, emphasised, 12, dt);
    if (body.opacity <= 0.01 || body.x < -200 || body.x > width + 200 || body.y < -300 || body.y > height + 300) continue;

    const s = depthScale(body.z) * spriteToCss;
    const cos = Math.cos(body.a);
    const sin = Math.sin(body.a);
    // 3D tilt approximated by foreshortening the card along its own axes.
    const sx = s * Math.max(0.2, Math.cos((body.tiltY * Math.PI) / 180));
    const sy = s * Math.max(0.2, Math.cos((body.tiltX * Math.PI) / 180));
    const a = cos * sx * dpr;
    const b = sin * sx * dpr;
    const c = -sin * sy * dpr;
    const d = cos * sy * dpr;
    const halfW = sprites.w / 2;
    const halfH = sprites.h / 2;

    // Shadow: light from the upper left, pushed further away as the card lifts.
    const lift = 4 + body.lift * 22 + body.z * 6;
    const shadowScale = 1 + body.lift * 0.07;
    ctx.globalAlpha = body.opacity * (0.5 - body.lift * 0.16);
    ctx.setTransform(a * shadowScale, b * shadowScale, c * shadowScale, d * shadowScale, (body.x + lift * 0.45) * dpr, (body.y + lift) * dpr);
    const sh = sprites.shadow;
    ctx.drawImage(sh.canvas, -sh.canvas.width / 2, -sh.canvas.height / 2);

    ctx.setTransform(a, b, c, d, body.x * dpr, body.y * dpr);
    if (body.glow > 0.02) {
      ctx.globalAlpha = body.opacity * body.glow * (quality === "lite" ? 0.55 : 0.7);
      const g = sprites.glow;
      ctx.drawImage(g.canvas, -g.canvas.width / 2, -g.canvas.height / 2);
    }

    ctx.globalAlpha = body.opacity;
    ctx.drawImage(sprites.card, -halfW, -halfH);

    // Depth haze: far cards sink into the night; hovering lifts them back into the light.
    const haze = Math.max(0, 0.46 * (1 - Math.min(1, body.z / 0.75)) - body.glow * 0.4);
    if (haze > 0.01) {
      ctx.globalAlpha = body.opacity * haze;
      ctx.drawImage(sprites.shade, -halfW, -halfH);
    }

    if (body.glow > 0.02) {
      ctx.globalAlpha = body.opacity * body.glow;
      ctx.drawImage(sprites.rim, -halfW - 4, -halfH - 4);
    }

    if (quality === "high" && (body.z > 0.6 || body.glow > 0.1)) {
      const glint = ((body.tiltY * 2.4 - body.tiltX * 1.2 + Math.sin(body.a) * 26) / 100) * sprites.w;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-halfW + 2, -halfH + 2, sprites.w - 4, sprites.h - 4);
      ctx.clip();
      ctx.globalAlpha = body.opacity * 0.9;
      ctx.drawImage(sprites.sheen, -sprites.w * 1.5 + glint, -halfH);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

/** Viewport rectangle of a card (for the result-screen flip hand-off). */
export function cardRect(field, body, canvas) {
  const box = canvas.getBoundingClientRect();
  const s = depthScale(body.z);
  const w = field.cardW * s;
  const h = w * CARD_RATIO;
  return { left: box.left + body.x - w / 2, top: box.top + body.y - h / 2, width: w, height: h };
}
