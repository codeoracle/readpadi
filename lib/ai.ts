"use client";
import { supabaseBrowser } from "./supabase/client";

export interface AiError { code?: "limit" | "auth" | "rate_limited" | "invalid_json" | "network" | "config"; message?: string; text?: string }
type Msg = { role: "user" | "assistant"; content: string };
export interface AskOpts { system?: string; images?: Blob[]; onText?: (text: string) => void; maxTokens?: number; signal?: AbortSignal }

const listeners = new Set<() => void>();
/** Components subscribe to refresh the AI allowance meter after each call. */
export const onAiUsage = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };

function blobToB64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
}

export async function ask(input: string | Msg[], opts: AskOpts = {}): Promise<{ text: string; truncated: boolean }> {
  const messages: any[] = typeof input === "string" ? [{ role: "user", content: input }] : input.map((m) => ({ ...m }));
  if (opts.images?.length) {
    const last = messages[messages.length - 1];
    const blocks = [];
    for (const img of opts.images) blocks.push({ type: "image", source: { type: "base64", media_type: img.type || "image/jpeg", data: await blobToB64(img) } });
    last.content = [...blocks, { type: "text", text: String(last.content) }];
  }
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw { code: "auth", message: "Your session has expired. Sign in again." } as AiError;
  let r: Response;
  try {
    r = await fetch("/api/ai", { method: "POST", signal: opts.signal, headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ messages, system: opts.system, max_tokens: opts.maxTokens || 8000 }) });
  } catch { throw { code: "network", message: "Could not reach the professor. Check your connection and try again." } as AiError; }
  if (!r.ok) {
    let j: any = {}; try { j = await r.json(); } catch {}
    listeners.forEach((f) => f());
    if (r.status === 402) throw { code: "limit", message: j.message || "You have used today's free AI actions." } as AiError;
    if (r.status === 401) throw { code: "auth", message: "Your session has expired. Sign in again." } as AiError;
    if (r.status === 429 || r.status === 529) throw { code: "rate_limited", message: "The professor is busy right now. Wait a minute and try again." } as AiError;
    if (j.error === "not_configured") throw { code: "config", message: "The professor is not set up yet. The site admin needs to add the API key." } as AiError;
    throw { message: j.message || (j.error && j.error.message) || `The professor could not answer (error ${r.status}).` } as AiError;
  }
  const reader = r.body!.getReader(); const dec = new TextDecoder();
  let buf = "", text = "", stop: string | null = null;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let k: number;
    while ((k = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1);
      if (!line.startsWith("data:")) continue;
      let ev: any; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") { text += ev.delta.text; opts.onText?.(text); }
      else if (ev.type === "message_delta" && ev.delta) stop = ev.delta.stop_reason;
      else if (ev.type === "error") throw { code: ev.error?.type === "overloaded_error" ? "rate_limited" : undefined, message: ev.error?.message || "The professor stopped mid-answer. Try again." } as AiError;
    }
  }
  listeners.forEach((f) => f());
  return { text, truncated: stop === "max_tokens" };
}

export function parseLooseJson(text: string): any {
  const t = String(text || "").trim();
  try { return JSON.parse(t); } catch {}
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) { try { return JSON.parse(f[1]); } catch {} }
  const i = Math.min(...["{", "["].map((ch) => { const k = t.indexOf(ch); return k < 0 ? Infinity : k; }));
  const j = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (i < j) { try { return JSON.parse(t.slice(i, j + 1)); } catch {} }
  throw { code: "invalid_json", text: t } as AiError;
}

export async function askJson(input: string | Msg[], opts: AskOpts = {}) {
  const r = await ask(input, { ...opts, system: "Reply with only the JSON value requested. No prose, no code fences." });
  if (r.truncated) throw { code: "invalid_json", text: r.text } as AiError;
  return parseLooseJson(r.text);
}

export function aiMessage(e: unknown) {
  const err = e as AiError;
  if (err?.code === "invalid_json") return "The professor's reply came back garbled. Try again, or ask for fewer questions.";
  return err?.message || "Something went wrong talking to the professor.";
}
