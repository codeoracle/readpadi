// POST /api/ai — verifies the student's Supabase session, spends one AI credit,
// then streams the model's answer. Runs at the edge so long answers are not cut off.
//
// Provider is chosen by env AI_PROVIDER:
//   auto        Groq for text (fast), Gemini for images and as fallback. Needs GROQ_API_KEY and GEMINI_API_KEY.
//               Optional GROQ_MODEL, GEMINI_MODEL. Fails over before any text is streamed.
//   anthropic   ANTHROPIC_API_KEY, CLAUDE_MODEL (default when AI_PROVIDER is unset)
//   gemini      GEMINI_API_KEY (free tier at aistudio.google.com), AI_MODEL (default gemini-flash-latest)
//   groq        GROQ_API_KEY, AI_MODEL (default llama-3.3-70b-versatile; text only)
//   openrouter  OPENROUTER_API_KEY, AI_MODEL (required)
//   openai      AI_API_KEY, AI_BASE_URL, AI_MODEL (any OpenAI-compatible endpoint)
// Whatever the provider, the browser always receives Anthropic-style stream events.
// deno-lint-ignore-file no-explicit-any
declare const Netlify: { env: { get(k: string): string | undefined } };

const MAX_BODY = 1_500_000;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const SSE = { "content-type": "text/event-stream", "cache-control": "no-cache", "x-accel-buffering": "no" };

const PRESETS: Record<string, { base: string; keyVar: string; modelVar: string; model: string }> = {
  gemini: { base: "https://generativelanguage.googleapis.com/v1beta/openai", keyVar: "GEMINI_API_KEY", modelVar: "GEMINI_MODEL", model: "gemini-flash-latest" },
  groq: { base: "https://api.groq.com/openai/v1", keyVar: "GROQ_API_KEY", modelVar: "GROQ_MODEL", model: "llama-3.3-70b-versatile" },
  openrouter: { base: "https://openrouter.ai/api/v1", keyVar: "OPENROUTER_API_KEY", modelVar: "OPENROUTER_MODEL", model: "" },
  openai: { base: "", keyVar: "AI_API_KEY", modelVar: "AI_MODEL", model: "" },
};
type Target = { name: string; key: string; base: string; model: string };

/** Anthropic-format messages (text + base64 image blocks) → OpenAI chat format. */
function toOpenAI(messages: any[], system?: string) {
  const out: any[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    if (typeof m.content === "string") { out.push({ role: m.role, content: m.content }); continue; }
    out.push({
      role: m.role,
      content: (m.content as any[]).map((b) =>
        b.type === "image"
          ? { type: "image_url", image_url: { url: `data:${b.source?.media_type || "image/jpeg"};base64,${b.source?.data}` } }
          : { type: "text", text: String(b.text ?? "") }),
    });
  }
  return out;
}

/** OpenAI-style SSE (choices[0].delta.content) → Anthropic-style SSE the app understands. */
function toAnthropicStream(body: ReadableStream<Uint8Array>) {
  const dec = new TextDecoder(), enc = new TextEncoder();
  let buf = "";
  const emit = (ctrl: TransformStreamDefaultController<Uint8Array>, ev: unknown) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      buf += dec.decode(chunk, { stream: true });
      let k: number;
      while ((k = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let ev: any; try { ev = JSON.parse(data); } catch { continue; }
        if (ev.error) { emit(ctrl, { type: "error", error: { type: "api_error", message: "The professor stopped mid-answer. Try again." } }); continue; }
        const ch = ev.choices?.[0];
        const text = ch?.delta?.content;
        if (text) emit(ctrl, { type: "content_block_delta", delta: { type: "text_delta", text } });
        if (ch?.finish_reason) emit(ctrl, { type: "message_delta", delta: { stop_reason: ch.finish_reason === "length" ? "max_tokens" : "end_turn" } });
      }
    },
  }));
}

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const env = (k: string) => Netlify.env.get(k) || "";
  const SB = env("NEXT_PUBLIC_SUPABASE_URL"), ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), SERVICE = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB || !SERVICE) return json({ error: "not_configured" }, 500);
  const mode = (env("AI_PROVIDER") || "anthropic").toLowerCase();

  const target = (name: string): Target | null => {
    if (name === "anthropic") {
      const key = env("ANTHROPIC_API_KEY");
      return key ? { name, key, base: "", model: env("CLAUDE_MODEL") || "claude-sonnet-5-5" } : null;
    }
    const p = PRESETS[name]; if (!p) return null;
    const key = env(p.keyVar);
    const model = env(p.modelVar) || (mode === name ? env("AI_MODEL") : "") || p.model;
    const base = (name === "openai" ? env("AI_BASE_URL") : p.base).replace(/\/$/, "");
    return key && base && model ? { name, key, base, model } : null;
  };

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "auth" }, 401);
  const who = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: ANON || SERVICE, authorization: auth } });
  if (!who.ok) return json({ error: "auth" }, 401);
  const user = await who.json();

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ message: "Too much material in one request. Choose fewer pages." }, 413);
  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: "Bad request" }, 400); }
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 30) return json({ error: "Bad request" }, 400);

  const hasImages = body.messages.some((m: any) => Array.isArray(m.content) && m.content.some((b: any) => b?.type === "image"));
  // Which providers to try, in order. Groq's default models are text-only, so image requests go to Gemini.
  const order = mode === "auto" ? (hasImages ? ["gemini"] : ["groq", "gemini"]) : [mode];
  const chain = order.map(target).filter((t): t is Target => !!t);
  if (!chain.length) {
    console.error(`[ai] not configured: mode=${mode} images=${hasImages}`);
    return json({ error: "not_configured" }, 500);
  }

  // New-style secret keys (sb_secret_…) go only in the apikey header; legacy JWT keys also work as a Bearer token.
  const adminHeaders: Record<string, string> = { apikey: SERVICE, "content-type": "application/json" };
  if (SERVICE.startsWith("eyJ")) adminHeaders.authorization = `Bearer ${SERVICE}`;
  const rpc = (fn: string) => fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ p_user: user.id }) });
  const credit = await rpc("consume_ai_credit");
  if (!credit.ok) return json({ message: "Could not check your AI allowance. Try again." }, 503);
  const c = await credit.json();
  if (!c.allowed) {
    const at = c.resets_at ? new Date(c.resets_at).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }) : "";
    return json({ error: "limit", resets_at: c.resets_at, message: `You have used your ${c.limit ?? ""} free AI actions. They refill${at ? " at " + at : " soon"}, or get a pass for unlimited use.` }, 402);
  }
  const refund = () => (c.pro ? Promise.resolve() : rpc("refund_ai_credit").then(() => {}, () => {}));

  const maxTokens = Math.min(Math.max(parseInt(body.max_tokens) || 4000, 256), 8000);
  const system = typeof body.system === "string" && body.system ? body.system.slice(0, 4000) : undefined;

  let lastStatus = 503;
  for (const t of chain) {
    let upstream: Response;
    try {
      if (t.name === "anthropic") {
        const payload: any = { model: t.model, max_tokens: maxTokens, messages: body.messages, stream: true };
        if (system) payload.system = system;
        upstream = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": t.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        const headers: Record<string, string> = { authorization: `Bearer ${t.key}`, "content-type": "application/json" };
        if (t.name === "openrouter") { headers["HTTP-Referer"] = env("NEXT_PUBLIC_SITE_URL") || "https://readpadi.xyz"; headers["X-Title"] = "ReadPadi AI"; }
        upstream = await fetch(`${t.base}/chat/completions`, {
          method: "POST", headers,
          body: JSON.stringify({ model: t.model, max_tokens: maxTokens, stream: true, messages: toOpenAI(body.messages, system) }),
        });
      }
    } catch (e) {
      console.error(`[ai] ${t.name} network error: ${(e as Error).message}`);
      continue;
    }
    if (upstream.ok && upstream.body) {
      return new Response(t.name === "anthropic" ? upstream.body : toAnthropicStream(upstream.body), { headers: { ...SSE, "x-ai-provider": t.name } });
    }
    lastStatus = upstream.status;
    // Visible in Netlify → Logs → Edge Functions. Students never see billing or key errors.
    console.error(`[ai] ${t.name} ${upstream.status}: ${(await upstream.text().catch(() => "")).slice(0, 400)}`);
  }

  await refund();
  if (lastStatus === 429 || lastStatus === 529) return json({ error: "busy", message: "The professor is busy right now. Wait a minute and try again. Your credit was not used." }, 429);
  return json({ error: "unavailable", message: "The professor is unavailable at the moment. Please try again later. Your credit was not used." }, 503);
};

export const config = { path: "/api/ai" };
