// Optional Cloudflare Worker that keeps your DeepSeek key off the public website.
//
// 1. Cloudflare dashboard → Workers → Create → paste this file → Deploy.
// 2. Worker → Settings → Variables: add secret DEEPSEEK_API_KEY (your key) and, optionally,
//    ALLOWED_ORIGIN = https://<you>.github.io  (only your site may call it).
// 3. In the game's AI settings (or the VITE_AI_BASE_URL build variable) set the address to
//    https://<your-worker>.workers.dev and leave the API Key empty.

const UPSTREAM = "https://api.deepseek.com/chat/completions";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN ? env.ALLOWED_ORIGIN.split(",").map((s) => s.trim()) : ["*"];
    const allowOrigin = allowed.includes("*") ? "*" : allowed.includes(origin) ? origin : allowed[0];
    const cors = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/chat/completions")) {
      return new Response("Not found", { status: 404, headers: cors });
    }
    if (!allowed.includes("*") && !allowed.includes(origin)) return new Response("Forbidden", { status: 403, headers: cors });

    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: request.body,
    });
    const headers = new Headers(upstream.headers);
    Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
