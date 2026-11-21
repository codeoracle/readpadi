import { supabaseAdmin } from "./supabase/server";

const API = "https://api.paystack.co";
export async function paystack(path: string, init: RequestInit = {}) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  const r = await fetch(API + path, { ...init, headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(init.headers || {}) }, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.status === false) throw new Error(j.message || `Paystack error ${r.status}`);
  return j.data;
}

/** Verify a transaction with Paystack and grant Pro if it is a successful, correctly priced payment. Idempotent. */
export async function settle(reference: string) {
  const tx = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (tx.status !== "success") return { ok: false as const, status: tx.status as string };
  const userId = tx.metadata?.user_id as string | undefined;
  if (!userId) return { ok: false as const, status: "missing_user" };
  const admin = supabaseAdmin();
  const { data: pay } = await admin.from("payments").select("amount_kobo,user_id").eq("reference", reference).maybeSingle();
  if (!pay || pay.user_id !== userId || tx.amount < pay.amount_kobo || tx.currency !== "NGN") return { ok: false as const, status: "mismatch" };
  const { data: until, error } = await admin.rpc("grant_pro", { p_reference: reference, p_user: userId, p_amount_kobo: tx.amount });
  if (error) throw new Error(error.message);
  return { ok: true as const, until: until as string };
}
