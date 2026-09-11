// Rigid-body card physics for the sixty-four-card field.
// Units: pixels, seconds, radians. Every card is a thin rigid plate drifting in a
// slow vortex of air: it has linear + angular momentum, air drag, flutter torque,
// depth (parallax), and can be held by an off-centre spring joint so it swings
// naturally around the point where it was pinched.

export const CARD_RATIO = 21 / 11; // height / width of the trimmed card art
const TAU = Math.PI * 2;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutBack = (t) => 1 + 2.1 * (t - 1) ** 3 + 1.1 * (t - 1) ** 2;

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

/** Depth 0 (far) → 1 (near). Held cards travel past 1 toward the viewer. */
export const depthScale = (z) => 0.5 + 0.62 * z;

/** One-Euro filter: removes hand-tracking jitter while keeping fast motion responsive. */
export function createOneEuro({ minCutoff = 1.4, beta = 0.006, dCutoff = 1.2 } = {}) {
  let prev = null;
  let dPrev = 0;
  let tPrev = 0;
  const alpha = (cutoff, dt) => 1 / (1 + 1 / (TAU * cutoff * dt));
  return {
    reset() { prev = null; dPrev = 0; },
    filter(value, timeMs) {
      if (prev === null) { prev = value; tPrev = timeMs; return value; }
      const dt = Math.max(1 / 240, (timeMs - tPrev) / 1000);
      tPrev = timeMs;
      const derivative = (value - prev) / dt;
      dPrev += alpha(dCutoff, dt) * (derivative - dPrev);
      prev += alpha(minCutoff + beta * Math.abs(dPrev), dt) * (value - prev);
      return prev;
    },
  };
}

const cardWidthFor = (width, height) => clamp(Math.min(width * 0.05, height * 0.08), 46, 78);

export function createField({ width, height, count = 64, seed = Date.now() }) {
  const random = seededRandom(seed);
  const cardW = cardWidthFor(width, height);
  const cx = width / 2;
  const cy = height * 0.5;
  const bodies = Array.from({ length: count }, (_, index) => {
    // Bias depth toward the middle so few cards are extremely large or tiny.
    const z = clamp((random() + random() + random()) / 3 + (random() - 0.5) * 0.35, 0, 1);
    const heading = random() * TAU;
    const speed = 520 + random() * 980;
    return {
      id: index + 1,
      x: cx + (random() - 0.5) * 30,
      y: cy + (random() - 0.5) * 30,
      vx: Math.cos(heading) * speed,
      vy: Math.sin(heading) * speed * 0.72,
      a: (random() - 0.5) * 0.5,
      w: (random() - 0.5) * 16,
      z: 0.2,
      baseZ: z,
      lift: 0,
      tiltX: 0,
      tiltY: 0,
      opacity: 1,
      phase: random() * TAU,
      flutter: 0.55 + random() * 0.9,
      spinBias: (random() - 0.5) * 0.9,
      ring: 0.12 + random() * 0.86, // preferred orbit radius, normalised to the stage ellipse
      // gather tween
      g0: null,
      band: "",
      zIndex: -1,
    };
  });
  return {
    bodies,
    width,
    height,
    cardW,
    time: 0,
    energy: 1.1,
    mode: "field",
    grab: null,
    hoverId: null,
    chosenId: null,
    gatherTime: 0,
    cursor: { x: -9999, y: -9999, vx: 0, vy: 0, active: false },
  };
}

export function resizeField(field, width, height) {
  field.width = width;
  field.height = height;
  field.cardW = cardWidthFor(width, height);
}

function halfExtents(field, body) {
  const s = depthScale(body.z);
  return [(field.cardW * s) / 2, (field.cardW * CARD_RATIO * s) / 2];
}

/** Top-most card whose rotated rectangle contains the point. */
export function pickCard(field, x, y, pad = 4) {
  let best = null;
  for (const body of field.bodies) {
    if (body.opacity < 0.5) continue;
    const [hw, hh] = halfExtents(field, body);
    const dx = x - body.x;
    const dy = y - body.y;
    const cos = Math.cos(-body.a);
    const sin = Math.sin(-body.a);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    if (Math.abs(lx) <= hw + pad && Math.abs(ly) <= hh + pad && (!best || body.z > best.z)) best = body;
  }
  return best;
}

/** Nearest card centre within a radius — tolerant picking for hand tracking. */
export function nearestCard(field, x, y, radius) {
  let best = null;
  let bestDistance = radius;
  for (const body of field.bodies) {
    const distance = Math.hypot(body.x - x, body.y - y);
    if (distance < bestDistance) { best = body; bestDistance = distance; }
  }
  return best;
}

export function grabCard(field, body, x, y) {
  const s = depthScale(body.z);
  const dx = x - body.x;
  const dy = y - body.y;
  const cos = Math.cos(-body.a);
  const sin = Math.sin(-body.a);
  // Anchor stored in unscaled card-local coordinates so it survives depth changes.
  const maxX = field.cardW * 0.45;
  const maxY = field.cardW * CARD_RATIO * 0.45;
  field.grab = {
    id: body.id,
    lx: clamp((dx * cos - dy * sin) / s, -maxX, maxX),
    ly: clamp((dx * sin + dy * cos) / s, -maxY, maxY),
    since: field.time,
  };
}

export function releaseCard(field) {
  const grab = field.grab;
  field.grab = null;
  if (!grab) return null;
  const body = field.bodies.find((item) => item.id === grab.id);
  if (body) {
    // A flick keeps its momentum; cap only truly absurd speeds.
    const speed = Math.hypot(body.vx, body.vy);
    if (speed > 3200) { body.vx *= 3200 / speed; body.vy *= 3200 / speed; }
    body.w = clamp(body.w, -26, 26);
  }
  return body;
}

/** A gust: every card receives an impulse along the vortex plus some tumble. */
export function gust(field, strength = 1) {
  field.energy = Math.min(3.2, field.energy + 0.9 * strength);
  const { width, height } = field;
  for (const body of field.bodies) {
    if (field.grab?.id === body.id) continue;
    const nx = (body.x - width / 2) / (width * 0.4);
    const ny = (body.y - height / 2) / (height * 0.36);
    const r = Math.hypot(nx, ny) || 1;
    const push = (380 + Math.random() * 420) * strength;
    body.vx += (-ny / r) * push + (Math.random() - 0.5) * 160;
    body.vy += (nx / r) * push * 0.7 + (Math.random() - 0.5) * 160;
    body.w += (Math.random() - 0.5) * 18 * strength;
  }
}

export function startGather(field, chosenId) {
  field.mode = "gather";
  field.chosenId = chosenId;
  field.gatherTime = 0;
  field.grab = null;
  const cx = field.width / 2;
  const cy = field.height / 2;
  for (const body of field.bodies) {
    const dx = body.x - cx;
    const dy = body.y - cy;
    body.g0 = {
      r: Math.hypot(dx, dy),
      theta: Math.atan2(dy, dx),
      a: body.a,
      z: body.z,
      x: body.x,
      y: body.y,
      delay: body.id === chosenId ? 0 : Math.random() * 0.28,
      dur: body.id === chosenId ? 1.15 : 0.8 + Math.random() * 0.35,
    };
  }
}

function stepGather(field, dt) {
  field.gatherTime += dt;
  const cx = field.width / 2;
  const cy = field.height / 2;
  for (const body of field.bodies) {
    const g = body.g0;
    const t = clamp((field.gatherTime - g.delay) / g.dur, 0, 1);
    if (body.id === field.chosenId) {
      const e = easeOutBack(t);
      const arc = Math.sin(t * Math.PI) * -60; // rises in a gentle arc toward the viewer
      body.x = g.x + (cx - g.x) * e;
      body.y = g.y + (cy - g.y) * e + arc;
      const turns = Math.round(g.a / TAU) * TAU;
      body.a = g.a + (turns - g.a) * easeInOut(t);
      body.z = g.z + (1.75 - g.z) * easeInOut(t);
      body.lift = damp(body.lift, 1, 8, dt);
      body.tiltX = damp(body.tiltX, Math.sin(t * Math.PI) * -14, 10, dt);
      body.tiltY = damp(body.tiltY, 0, 10, dt);
      body.opacity = 1;
    } else {
      const e = easeInOut(t);
      const spin = 2.6 + (body.id % 5) * 0.3;
      const theta = g.theta + e * spin;
      const r = g.r * (1 - e);
      body.x = cx + Math.cos(theta) * r;
      body.y = cy + Math.sin(theta) * r * 0.82;
      body.a = g.a + e * spin * 1.4;
      body.z = g.z * (1 - e * 0.85);
      body.tiltY = damp(body.tiltY, 38, 6, dt);
      body.opacity = t < 0.62 ? 1 : 1 - (t - 0.62) / 0.38;
    }
  }
}

function stepBody(field, body, dt, held) {
  const { width, height, cursor, energy, time } = field;
  const s = depthScale(body.z);
  const hw = (field.cardW * s) / 2;
  const hh = (field.cardW * CARD_RATIO * s) / 2;
  let ax = 0;
  let ay = 0;
  let aw = 0;

  if (held) {
    // Off-centre spring joint + light gravity → the card hangs and swings from the pinch point.
    const cos = Math.cos(body.a);
    const sin = Math.sin(body.a);
    const rx = (held.lx * cos - held.ly * sin) * s;
    const ry = (held.lx * sin + held.ly * cos) * s;
    const px = body.x + rx;
    const py = body.y + ry;
    const pvx = body.vx - body.w * ry;
    const pvy = body.vy + body.w * rx;
    const K = 1250;
    const C = 58;
    const fx = K * (cursor.x - px) - C * pvx;
    const fy = K * (cursor.y - py) - C * pvy;
    const inertia = ((field.cardW * s) ** 2 * (1 + CARD_RATIO ** 2)) / 12;
    ax += fx;
    ay += fy + 520; // gravity only while held
    aw += (rx * fy - ry * fx) / inertia - body.w * 2.4;
  } else {
    // Vortex wind: an elliptical orbit with a preferred ring plus curl noise.
    const cx = width / 2;
    const cy = height * 0.5;
    const rxE = width * 0.4;
    const ryE = height * 0.34;
    const nx = (body.x - cx) / rxE;
    const ny = (body.y - cy) / ryE;
    const r = Math.hypot(nx, ny) || 1e-3;
    const parallax = 0.5 + 0.5 * body.z;
    const omega = 0.3 * energy * parallax;
    const ring = body.ring;
    let wx = (-ny / r) * rxE * omega * Math.min(1.4, r) - (nx / r) * (r - ring) * rxE * 0.35;
    let wy = (nx / r) * ryE * omega * Math.min(1.4, r) - (ny / r) * (r - ring) * ryE * 0.35;
    wx += Math.sin(body.y * 0.006 + time * 0.7 + body.phase) * 46 * energy;
    wy += Math.cos(body.x * 0.005 - time * 0.6 + body.phase) * 38 * energy;

    const relx = wx - body.vx;
    const rely = wy - body.vy;
    const drag = 1.25 + 0.45 * (1 - body.z); // small, far cards are caught by the air sooner
    ax += relx * drag;
    ay += rely * drag;

    // Flutter: a thin plate in moving air tumbles and rocks.
    const rel = Math.hypot(relx, rely);
    aw += Math.sin(time * 1.9 * body.flutter + body.phase) * (1.6 + rel * 0.004) * energy;
    aw += body.spinBias * 0.8 * energy - body.w * 1.35;

    // Wake of the hand: air follows the moving cursor and parts around it.
    if (cursor.active) {
      const dx = body.x - cursor.x;
      const dy = body.y - cursor.y;
      const distance = Math.hypot(dx, dy) || 1;
      const radius = 150 + hw * 1.2;
      if (distance < radius) {
        const f = (1 - distance / radius) ** 2;
        const cursorSpeed = Math.hypot(cursor.vx, cursor.vy);
        const follow = Math.min(1, 0.12 + cursorSpeed / 900);
        ax += f * ((cursor.vx - body.vx) * 5 * follow + (dx / distance) * (140 + cursorSpeed * 0.9));
        ay += f * ((cursor.vy - body.vy) * 5 * follow + (dy / distance) * (140 + cursorSpeed * 0.9));
        aw += (f * (dx * cursor.vy - dy * cursor.vx)) / (radius * 18);
      }
    }

    // Soft walls keep every card inside the stage without a hard, visible bounce.
    const left = hw * 0.4;
    const right = width - hw * 0.4;
    const top = 70 + hh * 0.4;
    const bottom = height - 40 - hh * 0.4;
    if (body.x < left) ax += (left - body.x) * 34;
    if (body.x > right) ax -= (body.x - right) * 34;
    if (body.y < top) ay += (top - body.y) * 34;
    if (body.y > bottom) ay -= (body.y - bottom) * 34;
  }

  body.vx += ax * dt;
  body.vy += ay * dt;
  body.w += aw * dt;
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  body.a += body.w * dt;
}

function separate(field, dt) {
  const { bodies, cardW } = field;
  for (let i = 0; i < bodies.length; i += 1) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; j += 1) {
      const b = bodies[j];
      if (Math.abs(a.z - b.z) > 0.2) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minDistance = cardW * (depthScale(a.z) + depthScale(b.z)) * 0.42;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minDistance * minDistance || d2 < 1e-4) continue;
      const d = Math.sqrt(d2);
      const push = ((minDistance - d) / minDistance) * 520 * dt;
      const ux = dx / d;
      const uy = dy / d;
      if (field.grab?.id !== a.id) { a.vx -= ux * push; a.vy -= uy * push; }
      if (field.grab?.id !== b.id) { b.vx += ux * push; b.vy += uy * push; }
    }
  }
}

export function stepField(field, frameDt) {
  const dt = clamp(frameDt, 0, 1 / 24);
  field.time += dt;
  if (field.mode === "gather") {
    stepGather(field, dt);
    return;
  }
  field.energy += (1 - field.energy) * (1 - Math.exp(-dt * 0.55));
  const steps = field.substeps ?? 3;
  const h = dt / steps;
  for (let step = 0; step < steps; step += 1) {
    for (const body of field.bodies) {
      stepBody(field, body, h, field.grab?.id === body.id ? field.grab : null);
    }
  }
  separate(field, dt);

  for (const body of field.bodies) {
    const held = field.grab?.id === body.id;
    const hovered = !held && field.hoverId === body.id;
    const zTarget = held ? 1.32 : body.baseZ + (hovered ? 0.1 : 0) + Math.sin(field.time * 0.25 + body.phase) * 0.06;
    body.z = damp(body.z, zTarget, held ? 9 : 2.2, dt);
    body.lift = damp(body.lift, held ? 1 : hovered ? 0.45 : 0, held ? 14 : 7, dt);
    // Leading edge leans back against the air; a pinched corner is pressed in.
    let tx = clamp(-body.vy * 0.016, -30, 30);
    let ty = clamp(body.vx * 0.016, -30, 30);
    if (held) {
      tx += clamp(field.grab.ly / (field.cardW * CARD_RATIO * 0.5), -1, 1) * 10;
      ty -= clamp(field.grab.lx / (field.cardW * 0.5), -1, 1) * 10;
    }
    body.tiltX = damp(body.tiltX, tx, 9, dt);
    body.tiltY = damp(body.tiltY, ty, 9, dt);
    const speed = Math.hypot(body.vx, body.vy);
    const limit = held ? 5200 : 2600;
    if (speed > limit) { body.vx *= limit / speed; body.vy *= limit / speed; }
  }
}
