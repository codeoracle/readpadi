import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { settle } from "@/lib/paystack";

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-paystack-signature") || "";
  const key = process.env.PAYSTACK_SECRET_KEY || "";
  const expected = createHmac("sha512", key).update(raw).digest("hex");
  if (!key || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }
  const ev = JSON.parse(raw);
  if (ev.event === "charge.success" && ev.data?.reference) {
    try { await settle(String(ev.data.reference)); } catch (e) { console.error("paystack settle failed", e); return NextResponse.json({ ok: false }, { status: 500 }); }
  }
  return NextResponse.json({ ok: true });
}
