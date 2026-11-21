import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import Workspace from "@/components/course/Workspace";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { sb } = await requireUser();
  const { data } = await sb.from("courses").select("code,title").eq("id", id).maybeSingle();
  return { title: data ? `${data.code} · ${data.title}` : "Course" };
}

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { sb, user } = await requireUser();
  const { data: course } = await sb.from("courses").select("*").eq("id", id).maybeSingle();
  if (!course) notFound();
  const [profile, exam, progress, notes, attempts] = await Promise.all([
    sb.from("profiles").select("*").eq("id", user!.id).single(),
    sb.from("exams").select("*").eq("course_id", id).maybeSingle(),
    sb.from("progress").select("course_id,seen,last_page").eq("course_id", id).maybeSingle(),
    sb.from("notes").select("*").eq("course_id", id).order("created_at", { ascending: false }),
    sb.from("attempts").select("*").eq("course_id", id).order("created_at", { ascending: true }),
  ]);
  return (
    <Workspace course={course} profile={profile.data} initialExam={exam.data} initialProgress={progress.data}
      initialNotes={notes.data ?? []} initialAttempts={attempts.data ?? []} />
  );
}
