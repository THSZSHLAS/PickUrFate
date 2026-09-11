import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { categoryReading } from "./hexagrams.js";
import { AI_DEFAULTS, aiReady, buildMessages, loadAiConfig, renderMarkdown, saveAiConfig, streamReading } from "./ai.js";
import { renderPoster } from "./poster.js";
import { getTilt } from "./motion.js";
import { sfx } from "./sound.js";

const COARSE = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/** Tilt a card element toward a point, as if pressed there by a fingertip. */
export function tiltToward(element, clientX, clientY, strength = 1) {
  if (!element) return;
  const box = element.getBoundingClientRect();
  const px = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  const py = Math.min(1, Math.max(0, (clientY - box.top) / box.height));
  element.style.setProperty("--rx", `${((0.5 - py) * 22 * strength).toFixed(2)}deg`);
  element.style.setProperty("--ry", `${((px - 0.5) * 26 * strength).toFixed(2)}deg`);
  element.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
  element.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
}

export function clearTilt(element) {
  if (!element) return;
  element.style.setProperty("--rx", "0deg");
  element.style.setProperty("--ry", "0deg");
  element.style.setProperty("--gx", "50%");
  element.style.setProperty("--gy", "30%");
}

export function HexagramLines({ bits, moving = [], animate = true }) {
  return (
    <div className={`hex-lines ${animate ? "is-animated" : ""}`} aria-hidden="true">
      {[5, 4, 3, 2, 1, 0].map((index, row) => (
        <i key={index} className={`${bits[index] ? "is-yang" : "is-yin"} ${moving.includes(index) ? "is-moving" : ""}`} style={{ "--line": row }} />
      ))}
    </div>
  );
}

function ReadingCard({ hexagram, moving, fromRect, backSrc, faceSrc }) {
  const flipRef = useRef(null);
  const tiltRef = useRef(null);
  const hoverRef = useRef(false);

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

  // On phones the card follows the device tilt like a foil-stamped card in your hand.
  useEffect(() => {
    if (!COARSE) return undefined;
    let frame = 0;
    const loop = () => {
      const element = tiltRef.current;
      if (element && !hoverRef.current) {
        const { x, y } = getTilt();
        element.style.setProperty("--rx", `${(-y * 14).toFixed(2)}deg`);
        element.style.setProperty("--ry", `${(x * 16).toFixed(2)}deg`);
        element.style.setProperty("--gx", `${(50 + x * 45).toFixed(1)}%`);
        element.style.setProperty("--gy", `${(35 + y * 40).toFixed(1)}%`);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <article
      className="reading-card"
      onPointerMove={(event) => { hoverRef.current = true; tiltToward(tiltRef.current, event.clientX, event.clientY, 0.8); }}
      onPointerLeave={() => { hoverRef.current = false; clearTilt(tiltRef.current); }}
    >
      <div ref={tiltRef} className="reading-card__tilt">
        <div ref={flipRef} className="reading-card__flip">
          <div className="reading-card__face reading-card__face--front">
            <img src={faceSrc} alt="" className="reading-card__paper" draggable="false" />
            <div className="reading-card__content">
              <p>第 {hexagram.id} 卦</p>
              <h2>{hexagram.name}</h2>
              <HexagramLines bits={hexagram.bits} moving={moving} />
              <span>{hexagram.tone}</span>
            </div>
            <i className="card-sheen" />
          </div>
          <div className="reading-card__face reading-card__face--back">
            <img src={backSrc} alt="" draggable="false" />
          </div>
        </div>
      </div>
      <div className="reading-card__shadow" aria-hidden="true" />
    </article>
  );
}

function AiSettings({ onClose, onSaved }) {
  const [config, setConfig] = useState(loadAiConfig);
  const update = (key) => (event) => setConfig((value) => ({ ...value, [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value }));
  return createPortal(
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form
        className="modal__panel ai-settings"
        onSubmit={(event) => {
          event.preventDefault();
          const clean = { ...config, baseUrl: config.baseUrl.trim(), model: config.model.trim(), apiKey: config.apiKey.trim() };
          saveAiConfig(clean);
          onSaved(clean);
        }}
      >
        <h3 id="ai-settings-title">接入 AI 解卦</h3>
        <p className="modal__hint">填入 DeepSeek（或任何兼容 OpenAI 格式）的接口信息，抽完卦后会结合你的问题生成详细解读。Key 只保存在这台设备的浏览器里。</p>
        <label>API Key<input type="password" value={config.apiKey} onChange={update("apiKey")} placeholder="sk-…（用自己的代理地址时可留空）" autoComplete="off" /></label>
        <label>接口地址<input value={config.baseUrl} onChange={update("baseUrl")} placeholder={AI_DEFAULTS.baseUrl} /></label>
        <label>模型<input value={config.model} onChange={update("model")} placeholder={AI_DEFAULTS.model} /></label>
        <label className="ai-settings__check"><input type="checkbox" checked={config.thinking} onChange={update("thinking")} />深度思考（更慢，推理更细）</label>
        <div className="modal__actions">
          <button type="button" onClick={onClose}>取消</button>
          <button type="submit" className="is-primary">保存并解读</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function AiReading({ request }) {
  const [config, setConfig] = useState(loadAiConfig);
  const [state, setState] = useState({ status: "idle", text: "", thinking: false, error: "" });
  const [showSettings, setShowSettings] = useState(false);
  const controllerRef = useRef(null);
  const ready = aiReady(config);

  const start = useCallback(async (activeConfig = config) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "loading", text: "", thinking: false, error: "" });
    let text = "";
    let frame = 0;
    const flush = () => { frame = 0; setState((value) => ({ ...value, status: "streaming", text })); };
    try {
      await streamReading(activeConfig, buildMessages(request), {
        signal: controller.signal,
        onDelta: ({ content, reasoning }) => {
          if (reasoning && !text) setState((value) => (value.thinking ? value : { ...value, thinking: true }));
          if (content) {
            text += content;
            if (!frame) frame = requestAnimationFrame(flush); // batch token updates per frame
          }
        },
      });
      cancelAnimationFrame(frame);
      setState({ status: "done", text, thinking: false, error: "" });
    } catch (error) {
      cancelAnimationFrame(frame);
      if (error.name === "AbortError") return;
      setState({ status: "error", text, thinking: false, error: error.message });
    }
  }, [config, request]);

  useEffect(() => {
    if (!ready) return undefined;
    const timer = window.setTimeout(() => start(), 1500); // let the flip land first
    return () => { window.clearTimeout(timer); controllerRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="ai-reading" aria-live="polite">
      <header>
        <span className="ai-reading__seal">详</span>
        <div>
          <h3>AI 细解</h3>
          <p>{ready ? `${config.model} · 结合你的所问逐层解读` : "接入 AI 后，可结合你写下的问题生成更详细的解读"}</p>
        </div>
        <button type="button" className="ai-reading__gear" onClick={() => setShowSettings(true)} aria-label="AI 设置">设置</button>
      </header>
      {!ready && (
        <button type="button" className="ai-reading__connect" onClick={() => setShowSettings(true)}>接入 DeepSeek，开启细解</button>
      )}
      {ready && state.status === "idle" && <p className="ai-reading__muted">正在准备解读…</p>}
      {ready && state.status === "loading" && (
        <p className="ai-reading__muted"><i className="ink-dots" />{state.thinking ? "正在推演卦象…" : "正在连通…"}</p>
      )}
      {state.text && (
        <div className={`ai-reading__body ${state.status === "streaming" ? "is-streaming" : ""}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(state.text) }} />
      )}
      {state.status === "error" && <p className="ai-reading__error">{state.error}</p>}
      {ready && (state.status === "done" || state.status === "error") && (
        <button type="button" className="ai-reading__again" onClick={() => start()}>重新解读</button>
      )}
      {state.status === "streaming" && (
        <button type="button" className="ai-reading__again" onClick={() => { controllerRef.current?.abort(); setState((value) => ({ ...value, status: "done" })); }}>停止</button>
      )}
      {showSettings && (
        <AiSettings
          onClose={() => setShowSettings(false)}
          onSaved={(saved) => { setShowSettings(false); setConfig(saved); if (aiReady(saved)) start(saved); }}
        />
      )}
    </section>
  );
}

function PosterModal({ url, fileName, onClose }) {
  const [shared, setShared] = useState("");
  const canShare = typeof navigator !== "undefined" && typeof navigator.canShare === "function";
  const share = async () => {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "一念一卦" });
        setShared("已打开分享");
      } else setShared("此浏览器不支持直接分享，请长按图片保存");
    } catch { /* cancelled */ }
  };
  return createPortal(
    <div className="modal" role="dialog" aria-modal="true" aria-label="分享海报" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal__panel poster-modal">
        <img src={url} alt="一念一卦分享海报" />
        <p className="modal__hint">{shared || "手机上可长按图片保存或转发"}</p>
        <div className="modal__actions">
          <button type="button" onClick={onClose}>关闭</button>
          {canShare && <button type="button" onClick={share}>分享</button>}
          <a className="is-primary" href={url} download={fileName}>保存图片</a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ResultStage({ result, category, question, fromRect, assets, onRestart, onAgain }) {
  const { primary, relating, moving, movingNames, method } = result;
  const [poster, setPoster] = useState(null);
  const [posterBusy, setPosterBusy] = useState(false);
  const request = useRef({ question, category, primary, relating, moving, movingNames, method }).current;

  useEffect(() => () => { if (poster) URL.revokeObjectURL(poster); }, [poster]);

  const makePoster = async () => {
    if (posterBusy) return;
    setPosterBusy(true);
    try {
      const blob = await renderPoster({
        primary, relating, moving, movingNames, category, question,
        siteUrl: `${window.location.origin}${import.meta.env.BASE_URL}`,
        assets: { background: assets.background, cardFace: assets.cardFace },
      });
      setPoster(URL.createObjectURL(blob));
      sfx.tick(3);
    } catch {
      window.alert("海报生成失败，请稍后再试");
    } finally {
      setPosterBusy(false);
    }
  };

  const title = relating ? <>「{primary.name}」<small>之</small>「{relating.name}」</> : <>「{primary.name}」</>;

  return (
    <section className="result-stage">
      <div className="result-inner">
        <div className="result-heading">
          <p>{category.label} · {method === "six" ? "六爻成卦" : "一牌自现"}</p>
          <h1>你抽到了{title}</h1>
          {question?.trim() && <blockquote className="result-question">「{question.trim()}」</blockquote>}
        </div>
        <div className="reading-grid">
          <div className="reading-cards">
            <ReadingCard hexagram={primary} moving={moving} fromRect={fromRect} backSrc={assets.cardBack} faceSrc={assets.cardFace} />
            {relating && (
              <div className="relating-card">
                <span className="relating-card__arrow">变</span>
                <div>
                  <p>之卦 · 第 {relating.id} 卦</p>
                  <strong>{relating.name}</strong>
                  <HexagramLines bits={relating.bits} animate={false} />
                  <em>{relating.fullName}</em>
                </div>
              </div>
            )}
          </div>
          <article className="reading-copy">
            <span className="reading-copy__seal">解</span>
            <p className="reading-copy__category">{primary.fullName} · 上{primary.upper.name}{primary.upper.image}下{primary.lower.name}{primary.lower.image} · {primary.keywords}</p>
            <h2>{primary.text}</h2>
            <div className="classic">
              <div><span>卦辞</span><p>{primary.judgment}</p></div>
              <div><span>象曰</span><p>{primary.image}</p></div>
            </div>
            <p>{primary.meaning}</p>
            <h4 className="reading-copy__sub">关于「{category.label}」</h4>
            <p>{categoryReading(primary.id, category.id)}</p>
            <blockquote>{category.action}</blockquote>
            {relating && (
              <>
                <h4 className="reading-copy__sub">变爻 · {movingNames.join("、")}</h4>
                <p>动爻提示事态正在转化：由「{primary.name}」走向「{relating.name}」。{relating.meaning}</p>
              </>
            )}
            <p className="change-note">卦意只是一面温和的镜子。带走此刻最有共鸣的一句，其余交给时间。</p>
          </article>
        </div>
        <AiReading request={request} />
        <div className="result-actions">
          <button type="button" className="is-primary" onClick={makePoster} disabled={posterBusy}>{posterBusy ? "海报生成中…" : "生成分享海报"}</button>
          <button type="button" onClick={onAgain}>同一件事再问一次</button>
          <button type="button" onClick={onRestart}>重新问卦</button>
        </div>
      </div>
      {poster && <PosterModal url={poster} fileName={`一念一卦-${primary.name}.png`} onClose={() => setPoster(null)} />}
    </section>
  );
}
