// POST /api/ai — verifies the student's Supabase session, spends one daily AI credit,
// then streams the Claude API response. Runs at the edge so long answers are not cut off.
// deno-lint-ignore-file no-explicit-any
declare const Netlify: { env: { get(k: string): string | undefined } };

const MAX_BODY = 1_500_000;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const env = (k: string) => Netlify.env.get(k) || "";
  const SB = env("NEXT_PUBLIC_SUPABASE_URL"), ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), SERVICE = env("SUPABASE_SERVICE_ROLE_KEY"), KEY = env("ANTHROPIC_API_KEY");
  if (!SB || !SERVICE || !KEY) return json({ error: "not_configured" }, 500);

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

  const credit = await fetch(`${SB}/rest/v1/rpc/consume_ai_credit`, {
    method: "POST",
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
    body: JSON.stringify({ p_user: user.id }),
  });
  if (!credit.ok) return json({ message: "Could not check your AI allowance. Try again." }, 503);
  const c = await credit.json();
  if (!c.allowed) {
    const at = c.resets_at ? new Date(c.resets_at).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }) : "";
    return json({ error: "limit", resets_at: c.resets_at, message: `You have used your ${c.limit ?? ""} free AI actions. They refill${at ? " at " + at : " soon"}, or get a pass for unlimited use.` }, 402);
  }

  const payload: any = {
    model: env("CLAUDE_MODEL") || "claude-sonnet-5-5",
    max_tokens: Math.min(Math.max(parseInt(body.max_tokens) || 4000, 256), 8000),
    messages: body.messages,
    stream: true,
  };
  if (typeof body.system === "string" && body.system) payload.system = body.system.slice(0, 4000);

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!upstream.ok) return new Response(await upstream.text(), { status: upstream.status, headers: { "content-type": "application/json" } });
  return new Response(upstream.body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", "x-accel-buffering": "no" } });
};

export const config = { path: "/api/ai" };
