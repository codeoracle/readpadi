import { NextResponse } from "next/server";
import { requireUser, supabaseAdmin } from "@/lib/supabase/server";
import { paystack } from "@/lib/paystack";

export async function POST(req: Request) {
  const { sb, user } = await requireUser();
  if (!user?.email) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { data: s } = await sb.from("settings").select("pro_price_ngn,pro_days").eq("id", 1).single();
  const amount = (s?.pro_price_ngn ?? 1500) * 100;
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const reference = `sc_${user.id.slice(0, 8)}_${Date.now().toString(36)}`;
  try {
    await supabaseAdmin().from("payments").insert({ reference, user_id: user.id, amount_kobo: amount, status: "pending" });
    const data = await paystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: user.email, amount, currency: "NGN", reference,
        callback_url: `${origin}/upgrade?ref=${reference}`,
        metadata: { user_id: user.id, plan: "pro", days: s?.pro_days ?? 30 },
        channels: ["card", "bank", "ussd", "bank_transfer"],
      }),
    });
    return NextResponse.json({ url: data.authorization_url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
