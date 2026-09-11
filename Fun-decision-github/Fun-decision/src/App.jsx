import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";
import { CATEGORIES, HEXAGRAMS, hexagramLines } from "./hexagrams.js";
import {
  createField,
  createOneEuro,
  grabCard,
  gust,
  nearestCard,
  pickCard,
  releaseCard,
  resizeField,
  startGather,
  stepField,
} from "./cardPhysics.js";
import { buildSprites, cardRect, drawField, loadImage } from "./cardRenderer.js";
import { isSoundOn, setSoundOn, setWind, sfx, unlockAudio } from "./sound.js";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";
// BASE_URL keeps asset paths working when the site is served from a sub-path (e.g. GitHub Pages).
const asset = (path) => `${import.meta.env.BASE_URL}${path}`;
const MODEL_URL = asset("models/gesture_recognizer.task");
const CARD_BACK = asset("assets/card-back.webp");
const CARD_FACE = asset("assets/card-face.webp");
const LIGHT_CURSOR = asset("assets/light-cursor-glow.webp");
const TOPIC_NUMERALS = ["壹", "贰", "叁", "肆", "伍", "陆"];
const HOLD_MS = { hand: 2000, pointer: 1200 };
// Phones and low-core machines start in the lighter render mode; anyone can still drop to it
// automatically if frames run long.
const LITE_DEVICE = typeof window !== "undefined"
  && (window.matchMedia?.("(pointer: coarse)").matches || (navigator.hardwareConcurrency ?? 8) <= 4);
const canvasDpr = (quality) => Math.min(window.devicePixelRatio || 1, quality === "lite" ? 1.5 : 2);

// Warm the image cache early so entering the field never waits on a decode.
if (typeof window !== "undefined") {
  [CARD_BACK, CARD_FACE, LIGHT_CURSOR].forEach((src) => loadImage(src).catch(() => {}));
}
const HOLD_RING_LENGTH = 2 * Math.PI * 30;

const buzz = (pattern) => { try { navigator.vibrate?.(pattern); } catch { /* optional */ } };

/** Tilt a card element toward a point, as if pressed there by a fingertip. */
function tiltToward(element, clientX, clientY, strength = 1) {
  if (!element) return;
  const box = element.getBoundingClientRect();
  const px = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  const py = Math.min(1, Math.max(0, (clientY - box.top) / box.height));
  element.style.setProperty("--rx", `${((0.5 - py) * 22 * strength).toFixed(2)}deg`);
  element.style.setProperty("--ry", `${((px - 0.5) * 26 * strength).toFixed(2)}deg`);
  element.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
  element.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
}

function clearTilt(element) {
  if (!element) return;
  element.style.setProperty("--rx", "0deg");
  element.style.setProperty("--ry", "0deg");
  element.style.setProperty("--gx", "50%");
  element.style.setProperty("--gy", "30%");
}

function HexagramLines({ id }) {
  const lines = hexagramLines(id);
  return (
    <div className="hex-lines" aria-hidden="true">
      {[...lines].reverse().map((bit, index) => (
        <i key={index} className={bit ? "is-yang" : "is-yin"} style={{ "--line": index }} />
      ))}
    </div>
  );
}

function ReadingCard({ hexagram, fromRect }) {
  const flipRef = useRef(null);
  const tiltRef = useRef(null);

  useLayoutEffect(() => {
    const element = flipRef.current;
    if (!element?.animate) return undefined;
    const to = element.getBoundingClientRect();
    let start = "translate(0px, 40px) scale(0.86) rotateY(180deg)";
    if (fromRect && to.width) {
      const dx = fromRect.left + fromRect.width / 2 - (to.left + to.width / 2);
      const dy = fromRect.top + fromRect.height / 2 - (to.top + to.height / 2);
      start = `translate(${dx}px, ${dy}px) scale(${fromRect.width / to.width}) rotateY(180deg)`;
    }
    sfx.flip();
    const animation = element.animate(
      [
        { transform: start },
        { transform: "translate(0px, -18px) scale(1.04) rotateY(0deg)", offset: 0.78 },
        { transform: "translate(0px, 0px) scale(1) rotateY(0deg)" },
      ],
      { duration: 1250, easing: "cubic-bezier(0.22, 0.7, 0.18, 1)", fill: "backwards" },
    );
    return () => animation.cancel();
  }, [fromRect]);

  return (
    <article
      className="reading-card"
      onPointerMove={(event) => tiltToward(tiltRef.current, event.clientX, event.clientY, 0.8)}
      onPointerLeave={() => clearTilt(tiltRef.current)}
    >
      <div ref={tiltRef} className="reading-card__tilt">
        <div ref={flipRef} className="reading-card__flip">
          <div className="reading-card__face reading-card__face--front">
            <img src={CARD_FACE} alt="" className="reading-card__paper" draggable="false" />
            <div className="reading-card__content">
              <p>第 {hexagram.id} 卦</p>
              <h2>{hexagram.name}</h2>
              <HexagramLines id={hexagram.id} />
              <span>{hexagram.tone}</span>
            </div>
            <i className="card-sheen" />
          </div>
          <div className="reading-card__face reading-card__face--back">
            <img src={CARD_BACK} alt="" draggable="false" />
          </div>
        </div>
      </div>
      <div className="reading-card__shadow" aria-hidden="true" />
    </article>
  );
}

function TopicCard({ item, index, activeIndex, chosenId, onChoose, onHover }) {
  const tiltRef = useRef(null);
  const offset = activeIndex === null ? 0 : index - activeIndex;
  const fan = index - 2.5;
  const state = chosenId ? (chosenId === item.id ? "chosen" : "dismissed") : offset === 0 && activeIndex !== null ? "active" : "idle";
  const push = activeIndex === null || offset === 0 ? 0 : Math.sign(offset) * (26 / Math.sqrt(Math.abs(offset)));
  return (
    <button
      type="button"
      data-topic-id={item.id}
      data-state={state}
      className="topic-card"
      style={{
        "--fan-rot": `${(fan * 4.4).toFixed(2)}deg`,
        "--fan-y": `${(fan * fan * 5.2).toFixed(1)}px`,
        "--push": `${push.toFixed(1)}px`,
        "--order": index,
        "--dismiss-rot": `${(fan * 9).toFixed(1)}deg`,
      }}
      onClick={() => onChoose(item.id)}
      onPointerEnter={() => onHover(item.id)}
      onPointerLeave={() => { onHover(null); clearTilt(tiltRef.current); }}
      onPointerMove={(event) => tiltToward(tiltRef.current, event.clientX, event.clientY)}
      onFocus={() => onHover(item.id)}
      onBlur={() => onHover(null)}
    >
      <span ref={tiltRef} className="topic-card__tilt">
        <img src={CARD_FACE} alt="" draggable="false" />
        <em aria-hidden="true">{TOPIC_NUMERALS[index]}</em>
        <strong>{item.label}</strong>
        <i className="card-sheen" />
      </span>
    </button>
  );
}

function CloudCurtain({ phase }) {
  if (!phase) return null;
  return (
    <div className={`cloud-curtain is-${phase}`} aria-hidden="true">
      <div className="cloud-curtain__half cloud-curtain__half--left" />
      <div className="cloud-curtain__half cloud-curtain__half--right" />
      <span>入境</span>
    </div>
  );
}

export function App() {
  const [stage, setStage] = useState("calibration");
  const [categoryId, setCategoryId] = useState(null);
  const [focusedTopicId, setFocusedTopicId] = useState(null);
  const [hoverTopicId, setHoverTopicId] = useState(null);
  const [chosenTopicId, setChosenTopicId] = useState(null);
  const [transitionPhase, setTransitionPhase] = useState(null);
  const [selectedHex, setSelectedHex] = useState(null);
  const [revealRect, setRevealRect] = useState(null);
  const [drawRound, setDrawRound] = useState(0);
  const [gestureText, setGestureText] = useState("请将一只手举到摄像头前");
  const [cameraState, setCameraState] = useState("idle");
  const [cameraNote, setCameraNote] = useState("正在准备本机手势识别");
  const [soundOn, setSoundOnState] = useState(isSoundOn);

  const fieldRef = useRef(null);
  const cursorElRef = useRef(null);
  const holdMeterRef = useRef(null);
  const holdCountdownRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recognizerRef = useRef(null);
  const recognitionFrameRef = useRef(null);
  const physicsFrameRef = useRef(null);
  const simRef = useRef(null);
  const canvasRef = useRef(null);
  const fallbackRef = useRef(false);
  const stageRef = useRef("calibration");
  const selectedRef = useRef(null);
  const grabSourceRef = useRef(null);
  const holdElapsedRef = useRef(0);
  const holdQuarterRef = useRef(0);
  const hoverIdRef = useRef(null);
  const gestureRef = useRef("");
  const lastLabelRef = useRef("");
  const fistSinceRef = useRef(0);
  const lastHandTimeRef = useRef(0);
  const handSeenSinceRef = useRef(0);
  const calibrationDoneRef = useRef(false);
  const focusedTopicRef = useRef(null);
  const topicPinchLatchRef = useRef(false);
  const pinchActiveRef = useRef(false);
  const holdRef = useRef({ stage: null, targetId: null, since: 0, completed: false });
  const cursorRef = useRef({ x: -9999, y: -9999, vx: 0, vy: 0, active: false, down: false, t: 0 });
  const filtersRef = useRef({ x: createOneEuro(), y: createOneEuro() });
  const transitionTimersRef = useRef([]);
  const gatherRef = useRef(() => {});
  const finishGatherRef = useRef(() => {});

  const category = useMemo(
    () => CATEGORIES.find((item) => item.id === categoryId) ?? CATEGORIES.at(-1),
    [categoryId],
  );

  useEffect(() => { stageRef.current = stage; }, [stage]);

  const setGesture = useCallback((value) => {
    if (gestureRef.current !== value) {
      gestureRef.current = value;
      setGestureText(value);
    }
  }, []);

  const later = useCallback((fn, ms) => {
    const timer = window.setTimeout(fn, ms);
    transitionTimersRef.current.push(timer);
    return timer;
  }, []);

  const stopCamera = useCallback(() => {
    if (recognitionFrameRef.current) cancelAnimationFrame(recognitionFrameRef.current);
    recognitionFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recognizerRef.current?.close?.();
    recognizerRef.current = null;
  }, []);

  /* ───────── hold-to-confirm ring ───────── */

  const paintHold = useCallback((progress, caption) => {
    const meter = holdMeterRef.current;
    if (!meter) return;
    meter.dataset.active = progress > 0 ? "true" : "false";
    meter.dataset.completed = progress >= 1 ? "true" : "false";
    meter.style.setProperty("--hold-offset", `${(HOLD_RING_LENGTH * (1 - Math.min(1, progress))).toFixed(2)}`);
    if (holdCountdownRef.current && caption) holdCountdownRef.current.textContent = caption;
  }, []);

  const resetHold = useCallback(() => {
    holdRef.current = { stage: null, targetId: null, since: 0, completed: false };
    holdElapsedRef.current = 0;
    holdQuarterRef.current = 0;
    paintHold(0);
  }, [paintHold]);

  const progressHold = useCallback((holdStage, targetId, caption) => {
    const now = performance.now();
    if (holdRef.current.stage !== holdStage || holdRef.current.targetId !== targetId) {
      holdRef.current = { stage: holdStage, targetId, since: now, completed: false };
    }
    const current = holdRef.current;
    const elapsed = now - current.since;
    const progress = Math.min(1, elapsed / HOLD_MS.hand);
    const quarter = Math.min(3, Math.floor(progress * 4));
    if (quarter > holdQuarterRef.current) sfx.tick(quarter);
    holdQuarterRef.current = quarter;
    paintHold(progress, progress >= 1 ? "已确认" : `${caption} · ${Math.max(0, 2 - elapsed / 1000).toFixed(1)} 秒`);
    if (progress >= 1 && !current.completed) {
      current.completed = true;
      return true;
    }
    return false;
  }, [paintHold]);

  /* ───────── cursor ───────── */

  const updateCursor = useCallback((x, y, active = true) => {
    const now = performance.now();
    const cursor = cursorRef.current;
    const dt = Math.max(0.004, Math.min(0.06, (now - (cursor.t || now - 16)) / 1000));
    if (cursor.active && cursor.x > -9000) {
      // Low-passed velocity (px/s): a flick stays a flick, but one noisy frame does not.
      const k = Math.min(1, dt * 22);
      cursor.vx += ((x - cursor.x) / dt - cursor.vx) * k;
      cursor.vy += ((y - cursor.y) / dt - cursor.vy) * k;
    } else {
      cursor.vx = 0;
      cursor.vy = 0;
    }
    cursor.x = x;
    cursor.y = y;
    cursor.t = now;
    cursor.active = active;
    if (cursorElRef.current) {
      cursorElRef.current.style.transform = `translate3d(${x - 36}px, ${y - 36}px, 0)`;
      cursorElRef.current.dataset.active = active ? "true" : "false";
    }
    if (holdMeterRef.current) holdMeterRef.current.style.transform = `translate3d(${x - 40}px, ${y - 40}px, 0)`;
  }, []);

  /* ───────── topic choice ───────── */

  const chooseCategory = useCallback((id) => {
    if (stageRef.current !== "topics") return;
    resetHold();
    buzz(14);
    sfx.confirm();
    setCategoryId(id);
    setChosenTopicId(id);
    setFocusedTopicId(null);
    focusedTopicRef.current = null;
    stageRef.current = "transition";
    later(() => { setTransitionPhase("closing"); sfx.curtain(); }, 380);
    later(() => {
      stageRef.current = "field";
      setStage("field");
      setChosenTopicId(null);
      setGesture("拨开万象 · 捏住一张牌 2 秒定卦");
      setTransitionPhase("opening");
    }, 1180);
    later(() => setTransitionPhase(null), 2100);
  }, [later, resetHold, setGesture]);

  const enterTopics = useCallback((withHand = false) => {
    if (calibrationDoneRef.current) return;
    calibrationDoneRef.current = true;
    handSeenSinceRef.current = 0;
    // Choosing touch / mouse frees the camera and the recognizer — on phones they compete with the animation.
    if (!withHand) { fallbackRef.current = true; stopCamera(); }
    setCameraState(withHand ? "connected" : "fallback");
    setCameraNote(withHand ? "手势连接成功 · 移动指尖选牌，捏住 2 秒确认" : "已切换为鼠标与触控模式");
    setGesture(withHand ? "感应成功 · 即将入场" : "点击主题牌即可继续");
    later(() => {
      stageRef.current = "topics";
      setStage("topics");
      setGesture(withHand ? "移动指尖选牌 · 捏住 2 秒确认" : "点击一张主题牌");
    }, withHand ? 520 : 120);
  }, [later, setGesture, stopCamera]);

  /* ───────── card field: grab / release / resolve ───────── */

  const setHoverCard = useCallback((id) => {
    if (hoverIdRef.current === id) return;
    hoverIdRef.current = id;
    if (simRef.current) simRef.current.hoverId = id;
    if (id !== null) sfx.hover(cursorRef.current.x);
  }, []);

  const beginGrab = useCallback((source) => {
    const sim = simRef.current;
    if (stageRef.current !== "field" || !sim || sim.grab) return false;
    const { x, y } = cursorRef.current;
    const body = pickCard(sim, x, y, source === "hand" ? 18 : 4) ?? (source === "hand" ? nearestCard(sim, x, y, 90) : null);
    if (!body) return false;
    grabCard(sim, body, x, y);
    grabSourceRef.current = source;
    holdElapsedRef.current = 0;
    setHoverCard(null);
    if (cursorElRef.current) cursorElRef.current.dataset.grabbing = "true";
    buzz(8);
    sfx.pick(x);
    setGesture(source === "hand" ? "已捏住 · 甩动可掷出，稳住 2 秒定卦" : "已拈起 · 甩动可掷出，按住不动即定卦");
    return true;
  }, [setGesture, setHoverCard]);

  const releaseGrab = useCallback(() => {
    const sim = simRef.current;
    grabSourceRef.current = null;
    if (cursorElRef.current) cursorElRef.current.dataset.grabbing = "false";
    if (!sim?.grab) return;
    const body = releaseCard(sim);
    if (body) {
      if (stageRef.current === "field") sfx.release(Math.hypot(body.vx, body.vy), body.x);
    }
    resetHold();
  }, [resetHold]);

  const gatherCards = useCallback((preferred) => {
    const sim = simRef.current;
    if (stageRef.current !== "field" || selectedRef.current || !sim) return;
    releaseGrab();
    setHoverCard(null);
    resetHold();
    const cursor = cursorRef.current;
    let choice = preferred;
    if (!choice) {
      const candidates = [...sim.bodies]
        .sort((a, b) => Math.hypot(a.x - cursor.x, a.y - cursor.y) - Math.hypot(b.x - cursor.x, b.y - cursor.y))
        .slice(0, cursor.active ? 12 : 64);
      choice = candidates[Math.floor(Math.random() * candidates.length)] ?? sim.bodies[0];
    }
    const hexagram = HEXAGRAMS[choice.id - 1];
    selectedRef.current = hexagram;
    setSelectedHex(hexagram);
    startGather(sim, choice.id);
    stageRef.current = "gathering";
    setStage("gathering");
    setGesture("万象归一 · 此卦已定");
    buzz([10, 60, 18]);
    sfx.confirm();
    sfx.gather();

    // The physics loop calls finishGather once the tween has played out; this is only a safety net.
    later(() => finishGatherRef.current(), 4000);
  }, [later, releaseGrab, resetHold, setGesture, setHoverCard]);

  const finishGather = useCallback(() => {
    if (stageRef.current !== "gathering") return;
    const sim = simRef.current;
    const body = sim?.bodies.find((item) => item.id === sim.chosenId);
    setRevealRect(body && canvasRef.current ? cardRect(sim, body, canvasRef.current) : null);
    stopCamera();
    stageRef.current = "result";
    setStage("result");
  }, [stopCamera]);
  finishGatherRef.current = finishGather;

  gatherRef.current = gatherCards;

  /* ───────── gesture interpretation ───────── */

  const applyGesture = useCallback((label, landmarks) => {
    const activeStage = stageRef.current;
    const now = performance.now();
    const previousLabel = lastLabelRef.current;
    lastLabelRef.current = label;
    let pointerX = cursorRef.current.x;
    let pointerY = cursorRef.current.y;
    if (landmarks?.[8]) {
      pointerX = filtersRef.current.x.filter((1 - landmarks[8].x) * window.innerWidth, now);
      pointerY = filtersRef.current.y.filter(landmarks[8].y * window.innerHeight, now);
      updateCursor(pointerX, pointerY, true);
      lastHandTimeRef.current = now;
    } else {
      filtersRef.current.x.reset();
      filtersRef.current.y.reset();
    }

    if (activeStage === "calibration") {
      if (!landmarks) {
        handSeenSinceRef.current = 0;
        setGesture("请将一只手举到摄像头前");
        return;
      }
      if (!handSeenSinceRef.current) handSeenSinceRef.current = now;
      const heldFor = now - handSeenSinceRef.current;
      setCameraState("detecting");
      setCameraNote(`已发现手掌 · 请保持 ${Math.max(0.1, (460 - heldFor) / 1000).toFixed(1)} 秒`);
      setGesture("正在确认手势连接…");
      if (heldFor >= 460) enterTopics(true);
      return;
    }

    if (activeStage === "topics") {
      const topicElement = landmarks ? document.elementFromPoint(pointerX, pointerY)?.closest?.(".topic-card") : null;
      const nextTopic = topicElement?.dataset.topicId ?? null;
      if (nextTopic !== focusedTopicRef.current) {
        document.querySelectorAll(".topic-card__tilt").forEach(clearTilt);
        focusedTopicRef.current = nextTopic;
        setFocusedTopicId(nextTopic);
      }
      if (topicElement) tiltToward(topicElement.querySelector(".topic-card__tilt"), pointerX, pointerY);
      if (label === "Pinch" && nextTopic && !topicPinchLatchRef.current) {
        const confirmed = progressHold("topics", nextTopic, "捏住确认");
        setGesture("保持捏合 2 秒 · 即可选定此牌");
        if (confirmed) {
          topicPinchLatchRef.current = true;
          setGesture("已取此签 · 云门将开");
          chooseCategory(nextTopic);
        }
      } else {
        resetHold();
        if (label !== "Pinch") topicPinchLatchRef.current = false;
        setGesture(nextTopic ? "已指向此牌 · 捏住 2 秒确认" : "移动指尖选牌 · 捏住 2 秒确认");
      }
      return;
    }

    if (activeStage !== "field") return;
    const sim = simRef.current;
    if (!sim) return;
    if (label === "Pinch" && topicPinchLatchRef.current) {
      setGesture("请先松开手指 · 再捏住目标牌");
      return;
    }
    if (label !== "Pinch") topicPinchLatchRef.current = false;
    if (label !== "Pinch" && grabSourceRef.current === "hand") releaseGrab();

    if (label === "Open_Palm") {
      fistSinceRef.current = 0;
      if (previousLabel !== "Open_Palm") { gust(sim, 0.7); sfx.gust(); }
      sim.energy = Math.min(3.2, sim.energy + 0.05);
      setGesture("张掌起风 · 万牌疾行");
    } else if (label === "Pointing_Up") {
      fistSinceRef.current = 0;
      sim.energy = Math.max(0.45, sim.energy * 0.965);
      setGesture("指尖拨牌 · 牌潮渐缓");
    } else if (label === "Pinch") {
      fistSinceRef.current = 0;
      if (!sim.grab && !beginGrab("hand")) setGesture("靠近一张牌 · 捏住即可拈起");
    } else if (label === "Closed_Fist") {
      if (!fistSinceRef.current) fistSinceRef.current = now;
      setGesture("握拳收卦 · 正在聚拢");
      if (now - fistSinceRef.current > 520) gatherCards();
    } else {
      fistSinceRef.current = 0;
    }
  }, [beginGrab, chooseCategory, enterTopics, gatherCards, progressHold, releaseGrab, resetHold, setGesture, updateCursor]);

  const beginRecognitionLoop = useCallback(() => {
    let lastVideoTime = -1;
    let lastRun = 0;
    const loop = () => {
      if (stageRef.current === "result") return;
      const video = videoRef.current;
      const recognizer = recognizerRef.current;
      const now = performance.now();
      const interval = LITE_DEVICE ? 45 : 0; // ~22 recognitions/s on phones leaves the GPU to the cards
      if (video && recognizer && video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastRun >= interval) {
        lastVideoTime = video.currentTime;
        lastRun = now;
        try {
          const result = recognizer.recognizeForVideo(video, performance.now());
          const landmarks = result.landmarks?.[0];
          const candidate = result.gestures?.[0]?.[0];
          // Pinch distance normalised by palm size, so it works near and far from the camera.
          const palm = landmarks ? Math.hypot(landmarks[0].x - landmarks[9].x, landmarks[0].y - landmarks[9].y) || 0.1 : 1;
          const pinchDistance = landmarks ? Math.hypot(landmarks[4].x - landmarks[8].x, landmarks[4].y - landmarks[8].y) / palm : 9;
          const isPinching = pinchDistance < (pinchActiveRef.current ? 0.46 : 0.33);
          pinchActiveRef.current = Boolean(landmarks && isPinching);
          const label = pinchActiveRef.current ? "Pinch" : candidate?.score > 0.54 ? candidate.categoryName : "";
          applyGesture(label, landmarks);
          if (!landmarks && performance.now() - lastHandTimeRef.current > 700 && !cursorRef.current.down) {
            cursorRef.current.active = false;
            if (cursorElRef.current) cursorElRef.current.dataset.active = "false";
          }
        } catch {
          // Mouse, touch and keyboard controls remain available.
        }
      }
      recognitionFrameRef.current = requestAnimationFrame(loop);
    };
    recognitionFrameRef.current = requestAnimationFrame(loop);
  }, [applyGesture]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("fallback");
      setCameraNote("未检测到摄像头 · 鼠标、触控与空格键均可操作");
      return;
    }
    setCameraState("loading");
    setCameraNote("正在开启本机手势识别…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (fallbackRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      try {
        recognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 1,
        });
      } catch {
        recognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
          runningMode: "VIDEO",
          numHands: 1,
        });
      }
      if (fallbackRef.current) { stopCamera(); return; }
      setCameraState("ready");
      setCameraNote("识别模型已就绪 · 现在请举起一只手");
      setGesture("请将一只手举到摄像头前");
      beginRecognitionLoop();
    } catch {
      if (fallbackRef.current) return;
      setCameraState("fallback");
      setCameraNote("摄像头未开启 · 鼠标、触控与空格键仍可完整体验");
      stopCamera();
    }
  }, [beginRecognitionLoop, setGesture, stopCamera]);

  /* ───────── physics loop ───────── */

  const inField = stage === "field" || stage === "gathering";

  useEffect(() => {
    if (!inField) return undefined;
    const field = fieldRef.current;
    if (!field) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    const sim = createField({ width: field.clientWidth, height: field.clientHeight });
    sim.cursor = cursorRef.current;
    sim.substeps = LITE_DEVICE ? 2 : 3;
    if (import.meta.env.DEV) window.__fdField = sim; // handy for poking at the physics in dev tools
    simRef.current = sim;
    selectedRef.current = null;

    let quality = LITE_DEVICE ? "lite" : "high";
    let dpr = canvasDpr(quality);
    let sprites = null;
    let spriteToken = 0;
    const sizeCanvas = () => {
      canvas.width = Math.round(field.clientWidth * dpr);
      canvas.height = Math.round(field.clientHeight * dpr);
      const token = ++spriteToken;
      buildSprites(CARD_BACK, sim.cardW, dpr).then((built) => { if (token === spriteToken) sprites = built; }).catch(() => {});
    };
    sizeCanvas();

    // Adaptive quality: if frames keep running long, fall back to the light path once.
    let slowFor = 0;
    let lastWind = -1;

    let last = performance.now();
    const animate = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      const cursor = cursorRef.current;
      // Cursor velocity bleeds away when the pointer rests, so a still hand makes no wind.
      if (now - cursor.t > 45) { cursor.vx *= 0.8; cursor.vy *= 0.8; }

      if (sim.mode === "field") {
        if (!sim.grab && cursor.active) {
          const hovered = pickCard(sim, cursor.x, cursor.y, grabSourceRef.current === "hand" ? 18 : 2);
          setHoverCard(hovered?.id ?? null);
        } else if (!cursor.active) {
          setHoverCard(null);
        }
        if (sim.grab) {
          const source = grabSourceRef.current ?? "pointer";
          const steady = Math.hypot(cursor.vx, cursor.vy) < (source === "hand" ? 380 : 260);
          holdElapsedRef.current = steady
            ? holdElapsedRef.current + dt * 1000
            : Math.max(0, holdElapsedRef.current - dt * 4000);
          const total = HOLD_MS[source];
          const visible = Math.max(0, (holdElapsedRef.current - 220) / (total - 220));
          const quarter = Math.min(3, Math.floor(visible * 4));
          if (quarter > holdQuarterRef.current) sfx.tick(quarter);
          holdQuarterRef.current = visible > 0 ? quarter : 0;
          paintHold(visible, visible >= 1 ? "已确认" : steady ? `定住此牌 · ${((total - holdElapsedRef.current) / 1000).toFixed(1)} 秒` : "稳住手 · 即可定卦");
          if (holdElapsedRef.current >= total) {
            const body = sim.bodies.find((item) => item.id === sim.grab.id);
            gatherRef.current(body);
          }
        }
      }
      stepField(sim, dt);
      drawField(ctx, sim, sprites, { dpr, dt: Math.min(dt, 0.05), quality });
      const wind = sim.mode === "field" ? Math.round(sim.energy * 20) / 20 : 0;
      if (wind !== lastWind) { lastWind = wind; setWind(wind); }
      if (quality === "high" && sprites) {
        slowFor = dt > 1 / 42 ? slowFor + dt : Math.max(0, slowFor - dt * 0.5);
        if (slowFor > 1.2) {
          quality = "lite";
          sim.substeps = 2;
          dpr = canvasDpr("lite");
          sizeCanvas();
        }
      }
      if (sim.mode === "gather" && sim.gatherTime > 1.32) finishGatherRef.current();
      physicsFrameRef.current = requestAnimationFrame(animate);
    };
    physicsFrameRef.current = requestAnimationFrame(animate);

    const onResize = () => {
      resizeField(sim, field.clientWidth, field.clientHeight);
      sizeCanvas();
    };
    window.addEventListener("resize", onResize);
    return () => {
      setWind(0);
      window.removeEventListener("resize", onResize);
      if (physicsFrameRef.current) cancelAnimationFrame(physicsFrameRef.current);
      hoverIdRef.current = null;
      simRef.current = null;
    };
  }, [inField, drawRound, paintHold, setHoverCard]);

  useEffect(() => {
    if (stage !== "calibration" || cameraState !== "idle") return undefined;
    const timer = window.setTimeout(startCamera, 220);
    return () => window.clearTimeout(timer);
  }, [cameraState, stage, startCamera]);

  useEffect(() => () => {
    stopCamera();
    transitionTimersRef.current.forEach(window.clearTimeout);
  }, [stopCamera]);

  const reset = useCallback(() => {
    stopCamera();
    transitionTimersRef.current.forEach(window.clearTimeout);
    transitionTimersRef.current = [];
    grabSourceRef.current = null;
    selectedRef.current = null;
    cursorRef.current.active = false;
    handSeenSinceRef.current = 0;
    calibrationDoneRef.current = false;
    fallbackRef.current = false;
    focusedTopicRef.current = null;
    topicPinchLatchRef.current = false;
    pinchActiveRef.current = false;
    resetHold();
    setSelectedHex(null);
    setRevealRect(null);
    setCategoryId(null);
    setFocusedTopicId(null);
    setHoverTopicId(null);
    setChosenTopicId(null);
    setTransitionPhase(null);
    setCameraState("idle");
    setCameraNote("正在准备本机手势识别");
    setGesture("请将一只手举到摄像头前");
    stageRef.current = "calibration";
    setStage("calibration");
  }, [resetHold, setGesture, stopCamera]);

  const drawAgain = useCallback(() => {
    selectedRef.current = null;
    setSelectedHex(null);
    setRevealRect(null);
    setDrawRound((value) => value + 1);
    setGesture("牌潮再起 · 拈起一张，按住不动即定卦");
    stageRef.current = "field";
    setStage("field");
  }, [setGesture]);

  /* ───────── pointer (mouse / touch) ───────── */

  const handlePointerMove = useCallback((event) => {
    if (stageRef.current !== "field" || !fieldRef.current) return;
    const box = fieldRef.current.getBoundingClientRect();
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const last = events.length ? events[events.length - 1] : event;
    updateCursor(last.clientX - box.left, last.clientY - box.top, true);
  }, [updateCursor]);

  const handlePointerDown = useCallback((event) => {
    if (stageRef.current !== "field") return;
    if (event.target.closest?.(".field-actions")) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    cursorRef.current.down = true;
    const box = fieldRef.current.getBoundingClientRect();
    cursorRef.current.active = false; // fresh velocity for a new touch
    updateCursor(event.clientX - box.left, event.clientY - box.top, true);
    beginGrab("pointer");
  }, [beginGrab, updateCursor]);

  const handlePointerUp = useCallback((event) => {
    cursorRef.current.down = false;
    if (grabSourceRef.current === "pointer") {
      releaseGrab();
      if (stageRef.current === "field") setGesture("拨开万象 · 拈起一张，按住不动即定卦");
    }
    if (event.pointerType === "touch") {
      cursorRef.current.active = false;
      if (cursorElRef.current) cursorElRef.current.dataset.active = "false";
    }
  }, [releaseGrab, setGesture]);

  const handlePointerLeave = useCallback((event) => {
    if (event.pointerType === "mouse" && !cursorRef.current.down) {
      cursorRef.current.active = false;
      if (cursorElRef.current) cursorElRef.current.dataset.active = "false";
    }
  }, []);

  const shuffleField = useCallback(() => {
    if (simRef.current && stageRef.current === "field") {
      gust(simRef.current, 1);
      sfx.gust();
      setGesture("挥手乱卦 · 牌潮疾行");
    }
  }, [setGesture]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (stageRef.current === "topics" && /^[1-6]$/.test(event.key)) {
        chooseCategory(CATEGORIES[Number(event.key) - 1].id);
      } else if (stageRef.current === "field" && event.code === "Space") {
        event.preventDefault();
        shuffleField();
      } else if (stageRef.current === "field" && event.key === "Enter") {
        event.preventDefault();
        gatherCards();
      } else if (event.key === "Escape" && stageRef.current !== "calibration") {
        reset();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chooseCategory, gatherCards, reset, shuffleField]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);

  const toggleSound = useCallback(() => {
    const next = !isSoundOn();
    setSoundOn(next);
    setSoundOnState(next);
    if (next) window.setTimeout(() => sfx.tick(2), 60);
  }, []);

  const activeTopicId = chosenTopicId ?? focusedTopicId ?? hoverTopicId;

  useEffect(() => {
    if (stage === "topics" && activeTopicId && !chosenTopicId) sfx.slide(cursorRef.current.x);
  }, [activeTopicId, chosenTopicId, stage]);
  const activeTopicIndex = activeTopicId ? CATEGORIES.findIndex((item) => item.id === activeTopicId) : null;

  return (
    <main className={`app-shell stage-${stage}`}>
      <div className="scene-backdrop" aria-hidden="true" />
      <div className="scene-haze" aria-hidden="true" />
      <video ref={videoRef} className="recognition-video" muted playsInline aria-hidden="true" />
      <header className="scene-header">
        <button className="brand-block" type="button" onClick={reset} aria-label="返回选择">
          <strong>一念一卦</strong>
          <span>心有所问，卦有所应</span>
        </button>
        <div className="header-right">
          <button
            type="button"
            className={`sound-toggle ${soundOn ? "is-on" : ""}`}
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? "关闭声音" : "开启声音"}
            title={soundOn ? "关闭声音" : "开启声音"}
          >
            <span aria-hidden="true">{soundOn ? "声" : "静"}</span>
            <i aria-hidden="true"><b /><b /><b /></i>
          </button>
          <div className={`local-status is-${cameraState}`}>
            <i aria-hidden="true" />
            {stage === "calibration" ? "连接手势" : stage === "topics" || stage === "transition" ? "先择所问" : category.label}
          </div>
        </div>
      </header>

      {stage === "calibration" && (
        <section className="calibration-stage" aria-labelledby="calibration-heading">
          <div className={`calibration-orb is-${cameraState}`} aria-hidden="true">
            <img src={LIGHT_CURSOR} alt="" />
          </div>
          <p>入卦之前 · 先验灵犀</p>
          <h1 id="calibration-heading">请举起一只手</h1>
          <strong>{gestureText}</strong>
          <span>{cameraNote}</span>
          <div className="calibration-progress" aria-label="手势连接状态">
            <i className={cameraState !== "idle" ? "is-on" : ""}>摄像头</i>
            <i className={["ready", "detecting", "connected"].includes(cameraState) ? "is-on" : ""}>识别模型</i>
            <i className={["detecting", "connected"].includes(cameraState) ? "is-on" : ""}>发现手掌</i>
          </div>
          <button type="button" className="calibration-skip" onClick={() => enterTopics(false)}>
            {cameraState === "fallback" ? "摄像头暂不可用，使用鼠标继续" : "暂用鼠标继续"}
          </button>
        </section>
      )}

      {(stage === "topics" || stage === "transition") && (
        <section className={`topic-stage ${chosenTopicId ? "has-choice" : ""}`} aria-labelledby="topic-heading">
          <div className="topic-heading"><p>六事为门</p><h1 id="topic-heading">此刻，你想问什么？</h1><span>选一张即可，无需多言</span></div>
          <div className="topic-deck">
            {CATEGORIES.map((item, index) => (
              <TopicCard
                key={item.id}
                item={item}
                index={index}
                activeIndex={activeTopicIndex}
                chosenId={chosenTopicId}
                onChoose={chooseCategory}
                onHover={setHoverTopicId}
              />
            ))}
          </div>
          <p className="topic-footnote">移动指尖选牌，捏住 2 秒确认 · 点击或键盘 1—6 亦可</p>
        </section>
      )}

      {inField && (
        <section
          key={drawRound}
          ref={fieldRef}
          className="card-field"
          aria-label="可互动的六十四卦牌阵"
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        >
          <div className="storm-vortex" aria-hidden="true" />
          <canvas ref={canvasRef} className="card-canvas" aria-hidden="true" />
          <div className="gesture-hud" aria-live="polite"><strong>{gestureText}</strong><span>{cameraState === "connected" ? cameraNote : "拖动拈牌 · 甩出即飞 · 按住一张不动 1.2 秒定卦"}</span></div>
          <div className="field-actions">
            <button type="button" onClick={shuffleField}>挥手乱卦<kbd>空格</kbd></button>
            <button type="button" className="field-actions__primary" onClick={() => gatherCards()}>握拳定卦<kbd>回车</kbd></button>
          </div>
        </section>
      )}

      {stage === "result" && selectedHex && (
        <section className="result-stage">
          <div className="result-heading"><p>{category.label} · 一牌自现</p><h1>你抽到了「{selectedHex.name}」</h1></div>
          <div className="reading-grid">
            <ReadingCard hexagram={selectedHex} fromRect={revealRect} />
            <article className="reading-copy">
              <span className="reading-copy__seal">解</span>
              <p className="reading-copy__category">{selectedHex.tone}</p>
              <h2>{selectedHex.text}</h2>
              <p>{category.lens}</p>
              <blockquote>{category.action}</blockquote>
              <p className="change-note">卦意只是一面温和的镜子。带走此刻最有共鸣的一句，其余交给时间。</p>
            </article>
          </div>
          <div className="result-actions"><button type="button" onClick={reset}>重新问卦</button><button type="button" onClick={drawAgain}>同一件事再抽一张</button></div>
        </section>
      )}

      {stage !== "result" && (
        <div ref={cursorElRef} className="light-cursor" data-active="false" data-grabbing="false" aria-hidden="true"><img src={LIGHT_CURSOR} alt="" /></div>
      )}
      {stage !== "result" && (
        <div ref={holdMeterRef} className="hold-ring" data-active="false" data-completed="false" aria-hidden="true">
          <svg viewBox="0 0 80 80">
            <circle className="hold-ring__track" cx="40" cy="40" r="30" />
            <circle className="hold-ring__bar" cx="40" cy="40" r="30" strokeDasharray={HOLD_RING_LENGTH} />
          </svg>
          <strong ref={holdCountdownRef}>捏住确认 · 2.0 秒</strong>
        </div>
      )}
      <CloudCurtain phase={transitionPhase} />
      <p className="safety-note">娱乐体验，仅作自我观察与灵感参考</p>
    </main>
  );
}
