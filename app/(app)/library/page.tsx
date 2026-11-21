import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import LibraryView from "./LibraryView";
import type { Course } from "@/lib/types";

export const metadata: Metadata = { title: "Library" };
export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const { sb, user } = await requireUser();
  const [courses, mine, exams, progress, attempts, stats, profile] = await Promise.all([
    sb.from("courses").select("id,code,title,school,description,pages,status,uploaded_by,created_at").eq("status", "approved").order("code"),
    sb.from("courses").select("id,code,title,status,reject_reason,created_at").eq("uploaded_by", user!.id).neq("status", "approved").order("created_at", { ascending: false }),
    sb.from("exams").select("*"),
    sb.from("progress").select("course_id,seen,last_page"),
    sb.from("attempts").select("course_id,pct,created_at"),
    sb.rpc("class_stats"),
    sb.from("profiles").select("*").eq("id", user!.id).single(),
  ]);
  return (
    <LibraryView
      courses={(courses.data ?? []) as Course[]} myPending={mine.data ?? []} exams={exams.data ?? []} progress={progress.data ?? []}
      attempts={attempts.data ?? []} stats={stats.data ?? []} profile={profile.data}
    />
  );
}
