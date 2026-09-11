// Phone tilt + shake. Tilt becomes a gentle gravity vector for the card field (and a sheen angle
// for the result card); a sharp shake fires listeners. iOS needs an explicit permission prompt
// from inside a tap, so call requestMotion() from a pointer handler.

const state = {
  started: false,
  gx: 0, // screen-space gravity, -1..1
  gy: 0,
  baseBeta: null,
  lastShake: 0,
  lastMag: null,
};
const shakeListeners = new Set();

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function screenAngle() {
  const angle = window.screen?.orientation?.angle ?? window.orientation ?? 0;
  return ((angle % 360) + 360) % 360;
}

function onOrientation(event) {
  if (event.beta == null || event.gamma == null) return;
  const beta = event.beta;
  const gamma = event.gamma;
  // Neutral pose = however the phone was held when we started; it slowly re-centres so a
  // sustained tilt does not pin every card to one edge forever.
  if (state.baseBeta === null) state.baseBeta = clamp(beta, 15, 75);
  state.baseBeta += (clamp(beta, -30, 110) - state.baseBeta) * 0.004;
  // Small dead zone so an unsteady hand does not make the storm drift.
  const soft = (v) => Math.sign(v) * Math.max(0, Math.abs(v) - 0.12) / 0.88;
  const tx = soft(clamp(gamma / 32, -1, 1));
  const ty = soft(clamp((beta - state.baseBeta) / 32, -1, 1));
  let x = tx;
  let y = ty;
  const angle = screenAngle();
  if (angle === 90) { x = ty; y = -tx; } else if (angle === 180) { x = -tx; y = -ty; } else if (angle === 270) { x = -ty; y = tx; }
  state.gx += (x - state.gx) * 0.25;
  state.gy += (y - state.gy) * 0.25;
}

function onMotion(event) {
  const a = event.acceleration;
  let magnitude;
  if (a && a.x != null) {
    magnitude = Math.hypot(a.x, a.y, a.z);
  } else {
    const g = event.accelerationIncludingGravity;
    if (!g || g.x == null) return;
    const raw = Math.hypot(g.x, g.y, g.z);
    magnitude = state.lastMag === null ? 0 : Math.abs(raw - state.lastMag) * 1.6;
    state.lastMag = raw;
  }
  const now = performance.now();
  if (magnitude > 15 && now - state.lastShake > 900) {
    state.lastShake = now;
    shakeListeners.forEach((listener) => listener(magnitude));
  }
}

function start() {
  if (state.started || typeof window === "undefined") return;
  state.started = true;
  window.addEventListener("deviceorientation", onOrientation);
  window.addEventListener("devicemotion", onMotion);
}

let permissionAsked = false;
/** Call from a user gesture. Resolves true when tilt events are (probably) available. */
export async function requestMotion() {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return false;
  if (permissionAsked) return state.started;
  permissionAsked = true;
  try {
    if (typeof window.DeviceOrientationEvent.requestPermission === "function") {
      const result = await window.DeviceOrientationEvent.requestPermission();
      if (result !== "granted") return false;
    }
    if (typeof window.DeviceMotionEvent?.requestPermission === "function") {
      await window.DeviceMotionEvent.requestPermission().catch(() => "denied");
    }
  } catch {
    return false;
  }
  start();
  return true;
}

/** Current screen-space tilt, each axis -1..1 (0 when unsupported). */
export function getTilt() {
  return { x: state.gx, y: state.gy };
}

export function onShake(listener) {
  shakeListeners.add(listener);
  return () => shakeListeners.delete(listener);
}

/** Re-centre the neutral pose (e.g. when a new round starts). */
export function recenterTilt() {
  state.baseBeta = null;
}
