import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import UploadForm from "./UploadForm";

export const metadata: Metadata = { title: "Add course material" };

export default async function UploadPage() {
  const { sb, user } = await requireUser();
  const [{ data: p }, { data: courses }] = await Promise.all([
    sb.from("profiles").select("school,role").eq("id", user!.id).single(),
    sb.from("courses").select("id,code,title,school,status").order("code"),
  ]);
  return (
    <>
      <div className="page-head"><div><h1>Add course material</h1><p>Share a course PDF with every student. A moderator checks it before it appears in the library, usually within a day.</p></div></div>
      <UploadForm userId={user!.id} defaultSchool={p?.school || "National Open University of Nigeria"} existing={courses ?? []} staff={p?.role === "admin" || p?.role === "moderator"} />
    </>
  );
}
