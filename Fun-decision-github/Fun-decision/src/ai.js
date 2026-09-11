// AI deep reading through any OpenAI-compatible chat API — DeepSeek by default.
//
// Where the key comes from (first match wins):
//   1. the in-app settings panel (saved in this browser's localStorage only), or
//   2. build-time env: VITE_AI_API_KEY / VITE_AI_BASE_URL / VITE_AI_MODEL
//      (e.g. a GitHub Actions secret). NOTE: anything baked in at build time ends up in the
//      public JavaScript and can be read by any visitor — use a spending cap, or point
//      VITE_AI_BASE_URL at your own proxy (see proxy/deepseek-proxy.js) and leave the key empty.

const STORAGE_KEY = "fun-decision:ai";
const env = import.meta.env ?? {};

export const AI_DEFAULTS = {
  baseUrl: env.VITE_AI_BASE_URL || "https://api.deepseek.com",
  model: env.VITE_AI_MODEL || "deepseek-flash",
  apiKey: env.VITE_AI_API_KEY || "",
  thinking: false,
};

export function loadAiConfig() {
  let saved = {};
  try { saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}"); } catch { saved = {}; }
  return {
    baseUrl: saved.baseUrl || AI_DEFAULTS.baseUrl,
    model: saved.model || AI_DEFAULTS.model,
    apiKey: saved.apiKey ?? AI_DEFAULTS.apiKey,
    thinking: saved.thinking ?? AI_DEFAULTS.thinking,
  };
}

export function saveAiConfig(config) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch { /* private mode */ }
}

/** A proxy URL (anything that is not the official host) may hold the key server-side. */
export function aiReady(config) {
  if (!config.baseUrl) return false;
  const official = /api\.deepseek\.com|api\.openai\.com/.test(config.baseUrl);
  return Boolean(config.apiKey) || !official;
}

const SYSTEM_PROMPT = `你是一位精通《周易》的解卦者，也是一位温和、克制、有同理心的倾听者。
请依据用户抽得的卦象（本卦、变爻与之卦），结合他所问之事，给出有温度、可落地的解读。
要求：
- 忠于卦辞、象辞的本义，但用现代、易懂的中文表达；可以简短引用原文。
- 语气温和，不做绝对化的吉凶断言，不制造焦虑；把卦象当作一面自我观察的镜子。
- 必须给出具体、可执行的建议；涉及健康、法律、投资等专业问题时，提醒以专业意见和事实为准。
- 若有变爻，说明事态由本卦向之卦变化的趋势，并点出动爻的提示。
- 使用以下结构（Markdown 小标题），全文约 450–700 字：
### 卦象要义
### 对你所问
### 行动建议
（3 条，编号列表）
### 需要留意`;

export function buildMessages({ question, category, primary, relating, moving, movingNames, method }) {
  const lines = [
    `所问类别：${category.label}`,
    `具体问题：${question?.trim() ? question.trim() : "（未写下，心中默念）"}`,
    `起卦方式：${method === "six" ? "六次落爻（三钱法）" : "从六十四张卦牌中抽取一张"}`,
    `本卦：第${primary.id}卦 ${primary.fullName}（上${primary.upper.name}${primary.upper.image}，下${primary.lower.name}${primary.lower.image}）`,
    `卦辞：${primary.judgment}`,
    `象曰：${primary.image}`,
    `本卦要义：${primary.meaning}`,
  ];
  if (moving?.length && relating) {
    lines.push(`变爻：${movingNames.join("、")}（共 ${moving.length} 爻动）`);
    lines.push(`之卦：第${relating.id}卦 ${relating.fullName}；卦辞：${relating.judgment}`);
  } else {
    lines.push("变爻：无（以本卦为主）");
  }
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ];
}

/**
 * Stream a reading. Calls onDelta({ content, reasoning }) as text arrives.
 * Returns the full text. Throws an Error with a user-facing Chinese message on failure.
 */
export async function streamReading(config, messages, { onDelta, signal }) {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const body = { model: config.model, messages, stream: true, temperature: 0.8, max_tokens: 1600 };
  const withThinking = { ...body, thinking: { type: config.thinking ? "enabled" : "disabled" } };

  let response;
  try {
    response = await fetch(url, { method: "POST", headers, body: JSON.stringify(withThinking), signal });
    // Other OpenAI-compatible providers may reject the DeepSeek-specific "thinking" field.
    if (response.status === 400 || response.status === 422) {
      response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
    }
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("连不上 AI 接口。可能是网络问题，或该接口不允许网页直接调用（跨域），可改用自己的代理地址。");
  }
  if (!response.ok) {
    let detail = "";
    try { detail = (await response.json())?.error?.message ?? ""; } catch { /* ignore */ }
    const hint = {
      401: "API Key 无效或已过期。",
      402: "账户余额不足。",
      404: "接口地址或模型名称不对。",
      429: "请求太频繁或额度受限，稍后再试。",
    }[response.status] ?? "AI 服务暂时不可用。";
    throw new Error(`${hint}${detail ? `（${detail}）` : ""}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n");
    buffer = events.pop() ?? "";
    for (const line of events) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return full;
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta ?? {};
        if (delta.content) full += delta.content;
        if (delta.content || delta.reasoning_content) onDelta?.({ content: delta.content ?? "", reasoning: delta.reasoning_content ?? "" });
      } catch { /* keep-alive or partial line */ }
    }
  }
  return full;
}

const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Tiny, safe Markdown subset → HTML (headings, lists, bold, paragraphs). Input is escaped first. */
export function renderMarkdown(text) {
  const inline = (s) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/「(.+?)」/g, "「<em>$1</em>」");
  const out = [];
  let list = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    let m;
    if ((m = line.match(/^#{1,6}\s*(.+)$/))) { closeList(); out.push(`<h4>${inline(m[1])}</h4>`); }
    else if ((m = line.match(/^(?:\d+[.、)]|[-*•])\s*(.+)$/))) {
      const kind = /^\d/.test(line) ? "ol" : "ul";
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else { closeList(); out.push(`<p>${inline(line)}</p>`); }
  }
  closeList();
  return out.join("");
}
