import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import AdminView from "./AdminView";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { sb, user } = await requireUser();
  const { data: me } = await sb.from("profiles").select("role").eq("id", user!.id).single();
  if (me?.role !== "admin" && me?.role !== "moderator") redirect("/library");
  const [stats, pending, settings, recent] = await Promise.all([
    sb.rpc("admin_stats"),
    sb.from("courses").select("*").eq("status", "pending").order("created_at"),
    sb.from("settings").select("*").eq("id", 1).single(),
    sb.from("courses").select("id,code,title,school,status,pages,created_at").neq("status", "pending").order("created_at", { ascending: false }).limit(50),
  ]);
  return <AdminView isAdmin={me.role === "admin"} meId={user!.id} stats={stats.data} pending={pending.data ?? []} settings={settings.data} recent={recent.data ?? []} />;
}
