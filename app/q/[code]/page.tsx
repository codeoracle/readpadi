import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { BRAND } from "@/lib/brand";
import { RefCapture } from "@/components/RefCapture";
import QuizPlay, { type QuizInfo } from "./QuizPlay";

export const dynamic = "force-dynamic";

async function load(code: string) {
  if (!/^[a-z0-9]{6}$/i.test(code)) return { info: null, signedIn: false };
  const sb = await supabaseServer();
  const [{ data }, { data: u }] = await Promise.all([sb.rpc("challenge_info", { p_code: code }), sb.auth.getUser()]);
  return { info: data as QuizInfo | null, signedIn: !!u.user };
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { info } = await load((await params).code);
  if (!info) return { title: "Quiz" };
  const title = `${info.creator} challenged you: ${info.title}`;
  const description = `${info.n} questions${info.course ? ` on ${info.course.code} ${info.course.title}` : ""}. ${info.takers} ${info.takers === 1 ? "student has" : "students have"} taken it. Can you top the board?`;
  return { title, description, openGraph: { title, description, type: "website", siteName: BRAND.name }, twitter: { card: "summary", title, description } };
}

export default async function QuizPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { info, signedIn } = await load(code);
  if (!info) notFound();
  return (
    <>
      <RefCapture />
      <header className="top"><div className="wrap">
        <Link href={signedIn ? "/library" : "/"} className="brand"><span className="brand-mark">{BRAND.short}</span>{BRAND.name}</Link>
        <span style={{ flex: 1 }} />
        {signedIn ? <Link href="/quizzes" className="btn sm">My quizzes</Link> : <Link href={`/login?next=/q/${info.code}`} className="btn sm">Sign in</Link>}
      </div></header>
      <main className="wrap" style={{ maxWidth: 860 }}><QuizPlay info={info} signedIn={signedIn} /></main>
    </>
  );
}
