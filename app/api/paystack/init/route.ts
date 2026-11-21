import { NextResponse } from "next/server";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";
import { paystack } from "@/lib/paystack";

export async function POST(req: Request) {
  const { sb, user } = await requireUser();
  if (!user?.email) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { data: s } = await sb.from("settings").select("plans").eq("id", 1).single();
  const plan = ((s?.plans ?? []) as { id: string; days: number; price_ngn: number }[]).find((p) => p.id === body.plan);
  if (!plan) return NextResponse.json({ error: "Choose a plan" }, { status: 400 });
  const amount = Math.round(plan.price_ngn * 100);
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const reference = `sc_${user.id.slice(0, 8)}_${Date.now().toString(36)}`;
  try {
    await supabaseAdmin().from("payments").insert({ reference, user_id: user.id, amount_kobo: amount, status: "pending", plan: plan.id, days: plan.days });
    const data = await paystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: user.email, amount, currency: "NGN", reference,
        callback_url: `${origin}/upgrade?ref=${reference}`,
        metadata: { user_id: user.id, plan: plan.id, days: plan.days },
        channels: ["card", "bank", "ussd", "bank_transfer"],
      }),
    });
    return NextResponse.json({ url: data.authorization_url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
