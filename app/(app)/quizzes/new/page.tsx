import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import QuizBuilder from "./QuizBuilder";

export const metadata: Metadata = { title: "Create a quiz" };

export default async function NewQuizPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const sp = await searchParams;
  const { sb, user } = await requireUser();
  const [{ data: courses }, { data: p }] = await Promise.all([
    sb.from("courses").select("id,code,title").eq("status", "approved").order("code"),
    sb.from("profiles").select("referral_code").eq("id", user!.id).single(),
  ]);
  return (
    <>
      <div className="page-head"><div><h1>Create a quiz</h1><p>Write your own questions and answers, or let the AI draft them from your notes. Share the link with your class, or list it on the course’s quiz board for everyone.</p></div></div>
      <QuizBuilder courses={courses ?? []} initialCourse={sp.course || ""} refCode={p?.referral_code} />
    </>
  );
}
