import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import AppNav from "@/components/AppNav";
import { ToastProvider } from "@/components/Toast";
import { RefClaim } from "@/components/RefCapture";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const { data: p } = await sb.from("profiles").select("name,email,role").eq("id", user.id).single();
  const staff = p?.role === "admin" || p?.role === "moderator";
  let pending = 0;
  if (staff) { const { count } = await sb.from("courses").select("id", { count: "exact", head: true }).eq("status", "pending"); pending = count ?? 0; }
  const label = (p?.name || p?.email || user.email || "Me").trim();
  const initials = label.includes("@") ? label[0].toUpperCase() : label.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <ToastProvider>
      <RefClaim />
      <AppNav initials={initials} staff={staff} pendingCount={pending} />
      <main className="wrap">{children}</main>
    </ToastProvider>
  );
}
