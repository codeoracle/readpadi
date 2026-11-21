import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import LockerView from "./LockerView";
import type { LockerItem } from "@/lib/types";

export const metadata: Metadata = { title: "Locker" };
export const dynamic = "force-dynamic";

export default async function LockerPage() {
  const { sb, user } = await requireUser();
  const [items, profile, settings] = await Promise.all([
    sb.from("locker_items").select("*").order("created_at", { ascending: false }),
    sb.from("profiles").select("level,pro_until,role").eq("id", user!.id).single(),
    sb.from("settings").select("locker_free_items").eq("id", 1).single(),
  ]);
  const p = profile.data;
  const pro = !!(p && ((p.pro_until && new Date(p.pro_until) > new Date()) || p.role !== "student"));
  return <LockerView userId={user!.id} initial={(items.data ?? []) as LockerItem[]} level={p?.level || ""} pro={pro} freeMax={settings.data?.locker_free_items ?? 30} />;
}
