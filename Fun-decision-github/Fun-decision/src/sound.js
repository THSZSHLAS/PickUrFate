// Synthesised sound for the card ritual — no audio files, everything is built with Web Audio.
// Paper sounds are shaped noise; the confirmation voice is a small bronze chime (磬) made of
// inharmonic partials. Browsers only allow audio after a user gesture, so call unlockAudio()
// from pointer/keyboard handlers; until then every cue is a silent no-op.

const STORAGE_KEY = "fun-decision:sound";

let ctx = null;
let master = null;
let noiseBuffer = null;
let wind = null;
let enabled = true;
const lastPlayed = new Map();

try {
  enabled = window.localStorage.getItem(STORAGE_KEY) !== "off";
} catch {
  enabled = true;
}

function ready() {
  return enabled && ctx && ctx.state === "running";
}

function throttle(key, ms) {
  const now = performance.now();
  if (now - (lastPlayed.get(key) ?? -Infinity) < ms) return true;
  lastPlayed.set(key, now);
  return false;
}

export function unlockAudio() {
  if (!enabled) return;
  try {
    if (!ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.8;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.ratio.value = 3;
      master.connect(compressor).connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    ctx = null;
  }
}

export function isSoundOn() {
  return enabled;
}

export function setSoundOn(value) {
  enabled = value;
  try { window.localStorage.setItem(STORAGE_KEY, value ? "on" : "off"); } catch { /* optional */ }
  if (value) unlockAudio();
  else setWind(0);
}

/* ───────── building blocks ───────── */

function envelope(gainNode, t, peak, attack, decay) {
  gainNode.gain.setValueAtTime(0.0001, t);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noiseBurst({ at = 0, type = "bandpass", freq = 2000, q = 1, peak = 0.2, attack = 0.004, decay = 0.08, sweepTo = null, pan = 0 }) {
  const t = ctx.currentTime + at;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  source.playbackRate.value = 0.9 + Math.random() * 0.2;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
  filter.Q.value = q;
  const gain = ctx.createGain();
  envelope(gain, t, peak, attack, decay);
  let node = source.connect(filter).connect(gain);
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    node = node.connect(panner);
  }
  node.connect(master);
  source.start(t, Math.random() * 0.9);
  source.stop(t + attack + decay + 0.05);
}

function tone({ at = 0, freq = 440, endFreq = null, type = "sine", peak = 0.1, attack = 0.005, decay = 0.3 }) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + attack + decay);
  const gain = ctx.createGain();
  envelope(gain, t, peak, attack, decay);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
}

function chime(freq, { at = 0, peak = 0.12, length = 2.4 } = {}) {
  // Bronze-bell partial ratios give the "磬" colour rather than a pure synth beep.
  [[1, 1, 1], [2.76, 0.42, 0.62], [5.4, 0.2, 0.38], [8.93, 0.09, 0.22]].forEach(([ratio, level, life]) => {
    tone({ at, freq: freq * ratio, peak: peak * level, attack: 0.004, decay: length * life });
  });
}

/* ───────── cues ───────── */

const panFor = (x) => (typeof x === "number" ? (x / window.innerWidth) * 1.4 - 0.7 : 0);

export const sfx = {
  /** Fingertip brushes over a card edge. */
  hover(x) {
    if (!ready() || throttle("hover", 70)) return;
    noiseBurst({ type: "highpass", freq: 5200, peak: 0.035, attack: 0.002, decay: 0.028, pan: panFor(x) });
  },
  /** Paper slides as a topic card rises. */
  slide(x) {
    if (!ready() || throttle("slide", 60)) return;
    noiseBurst({ freq: 1400, sweepTo: 2600, q: 0.9, peak: 0.07, attack: 0.02, decay: 0.12, pan: panFor(x) });
  },
  /** A card is pinched off the air. */
  pick(x) {
    if (!ready()) return;
    const pan = panFor(x);
    noiseBurst({ freq: 3200, q: 1.2, peak: 0.22, attack: 0.002, decay: 0.05, pan });
    noiseBurst({ at: 0.012, freq: 1700, q: 1.6, peak: 0.08, attack: 0.002, decay: 0.07, pan });
    tone({ freq: 210, endFreq: 120, peak: 0.07, attack: 0.003, decay: 0.07 });
  },
  /** Release — a throw whooshes in proportion to its speed; a gentle release just rustles. */
  release(speed, x) {
    if (!ready()) return;
    const k = Math.min(1, speed / 2200);
    const pan = panFor(x);
    if (k < 0.18) {
      noiseBurst({ freq: 2400, q: 1, peak: 0.07, attack: 0.003, decay: 0.06, pan });
      return;
    }
    noiseBurst({ freq: 500, sweepTo: 1400 + 2400 * k, q: 1.3, peak: 0.1 + 0.2 * k, attack: 0.03, decay: 0.16 + 0.32 * k, pan });
    noiseBurst({ at: 0.02, type: "highpass", freq: 4200, peak: 0.04 * k, attack: 0.01, decay: 0.12, pan });
  },
  /** Big gust across the field. */
  gust() {
    if (!ready() || throttle("gust", 350)) return;
    noiseBurst({ freq: 300, sweepTo: 1600, q: 0.7, peak: 0.26, attack: 0.18, decay: 0.8, pan: -0.4 });
    noiseBurst({ at: 0.08, freq: 420, sweepTo: 2200, q: 0.8, peak: 0.16, attack: 0.2, decay: 0.7, pan: 0.4 });
  },
  /** Soft woodblock tick at each quarter of a hold. */
  tick(step = 1) {
    if (!ready()) return;
    tone({ freq: 760 + step * 90, type: "triangle", peak: 0.06, attack: 0.002, decay: 0.07 });
    noiseBurst({ type: "highpass", freq: 3000, peak: 0.025, attack: 0.001, decay: 0.02 });
  },
  /** A choice is sealed. */
  confirm() {
    if (!ready()) return;
    chime(587.33, { peak: 0.12 });
    chime(880, { at: 0.09, peak: 0.07, length: 2 });
  },
  /** The cloud gate closes. */
  curtain() {
    if (!ready()) return;
    noiseBurst({ type: "lowpass", freq: 260, sweepTo: 900, q: 0.5, peak: 0.2, attack: 0.35, decay: 0.9 });
  },
  /** All cards spiral into the chosen one. */
  gather() {
    if (!ready()) return;
    noiseBurst({ freq: 260, sweepTo: 2400, q: 1.1, peak: 0.24, attack: 0.55, decay: 0.7 });
    noiseBurst({ at: 0.1, freq: 900, sweepTo: 3600, q: 2.2, peak: 0.08, attack: 0.5, decay: 0.6 });
    tone({ at: 0.1, freq: 92, endFreq: 46, peak: 0.16, attack: 0.25, decay: 1.1 });
  },
  /** The chosen card turns over. */
  flip() {
    if (!ready() || throttle("flip", 600)) return;
    noiseBurst({ freq: 1500, q: 1.1, peak: 0.16, attack: 0.004, decay: 0.05 });
    noiseBurst({ at: 0.09, freq: 1100, q: 1, peak: 0.12, attack: 0.02, decay: 0.12 });
    tone({ at: 0.02, freq: 150, endFreq: 70, peak: 0.08, attack: 0.01, decay: 0.16 });
    chime(659.25, { at: 0.72, peak: 0.1, length: 2.8 });
    chime(987.77, { at: 0.86, peak: 0.05, length: 2.2 });
  },
};

/** Continuous air bed that follows the field's energy (0 silences it). */
export function setWind(energy) {
  if (!ctx) return;
  const level = ready() ? Math.max(0, Math.min(1, energy / 3)) : 0;
  if (!wind && level > 0) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.6;
    filter.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(master);
    source.start();
    wind = { source, filter, gain };
  }
  if (!wind) return;
  const t = ctx.currentTime;
  wind.gain.gain.setTargetAtTime(level > 0 ? 0.012 + level * 0.07 : 0, t, level > 0 ? 0.25 : 0.4);
  wind.filter.frequency.setTargetAtTime(320 + level * 900, t, 0.3);
}
