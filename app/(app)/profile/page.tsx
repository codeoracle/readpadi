import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import ProfileForm from "./ProfileForm";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const { sb, user } = await requireUser();
  const [{ data: p }, { data: schools }] = await Promise.all([
    sb.from("profiles").select("*").eq("id", user!.id).single(),
    sb.from("courses").select("school").eq("status", "approved"),
  ]);
  return (
    <>
      <div className="page-head"><div><h1>My profile</h1><p>Your details tune the professor and the library. Only you and the site moderators can see them.</p></div></div>
      <ProfileForm profile={p} email={user!.email || user!.phone || ""} schools={[...new Set((schools ?? []).map((s: { school: string }) => s.school).filter(Boolean))]} />
    </>
  );
}
