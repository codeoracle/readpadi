import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { settle } from "@/lib/paystack";

export async function POST(req: Request) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { reference } = await req.json().catch(() => ({}));
  if (typeof reference !== "string" || !/^sc_[a-z0-9_]+$/i.test(reference)) return NextResponse.json({ error: "Bad reference" }, { status: 400 });
  try {
    const r = await settle(reference);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
