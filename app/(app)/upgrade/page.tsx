import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import UpgradeView from "./UpgradeView";

export const metadata: Metadata = { title: "Passes" };
export const dynamic = "force-dynamic";

export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ ref?: string; reference?: string }> }) {
  const sp = await searchParams;
  const { sb, user } = await requireUser();
  const [{ data: s }, { data: p }] = await Promise.all([
    sb.from("settings").select("free_limit,free_window_hours,plans,locker_free_items").eq("id", 1).single(),
    sb.from("profiles").select("pro_until").eq("id", user!.id).single(),
  ]);
  return <UpgradeView settings={s!} proUntil={p?.pro_until ?? null} reference={sp.ref || sp.reference || null} />;
}
