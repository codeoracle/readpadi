import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/study";
import QuizBoard from "@/components/QuizBoard";

export const metadata: Metadata = { title: "Quizzes" };
export const dynamic = "force-dynamic";

type Created = { code: string; title: string; n: number; created_at: string; expires_at: string; course_code: string | null; takers: number };
type Joined = { code: string; title: string; n: number; score: number; total: number; secs: number; submitted_at: string; course_code: string | null; creator: string };

export default async function QuizzesPage() {
  const { sb } = await requireUser();
  const { data } = await sb.rpc("my_challenges");
  const created: Created[] = data?.created ?? [], joined: Joined[] = data?.joined ?? [];
  return (
    <>
      <div className="page-head"><div><h1>Class quizzes</h1><p>Play quizzes set by other students, write your own, or turn a practice test into a challenge. Everyone who plays lands on one leaderboard.</p></div><Link href="/quizzes/new" className="btn pri">Create a quiz</Link></div>
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="lbl" style={{ marginBottom: 6 }}>Two ways to set a quiz</div>
        <ol style={{ margin: 0, paddingLeft: 20, fontFamily: "var(--f-read)", lineHeight: 1.8 }}>
          <li><Link className="link" href="/quizzes/new">Write your own</Link>: multiple choice, true/false or fill-the-gap, with your answers and explanations. The AI can draft questions from your notes.</li>
          <li>From a course: sit a practice exam, then tap <b>Create quiz link</b> on your result. Your score becomes the one to beat.</li>
        </ol>
      </div>
      <div className="section-t" style={{ marginTop: 0 }}><h2>Open quizzes</h2><span className="hint">listed by students</span></div>
      <QuizBoard emptyText={<>No open quizzes yet. <Link className="link" href="/quizzes/new">Set the first one</Link>.</>} />
      <div className="section-t"><h2>Quizzes you set</h2><span className="hint">{created.length}</span></div>
      {created.length ? <div className="hist">{created.map((c) => (
        <Link key={c.code} href={`/q/${c.code}`} className="hrow"><span style={{ minWidth: 0 }}>{c.course_code && <span className="chip acc">{c.course_code}</span>} <b>{c.title}</b> <span className="hint">· {c.n} questions · {fmtDate(c.created_at)}{new Date(c.expires_at) < new Date() ? " · closed" : ""}</span></span><span className="chip">{c.takers} taken</span><span className="mono hint">/q/{c.code}</span></Link>
      ))}</div> : <p className="hint">None yet.</p>}
      <div className="section-t"><h2>Quizzes you took</h2><span className="hint">{joined.length}</span></div>
      {joined.length ? <div className="hist">{joined.map((c) => (
        <Link key={c.code} href={`/q/${c.code}`} className="hrow"><span style={{ minWidth: 0 }}>{c.course_code && <span className="chip acc">{c.course_code}</span>} <b>{c.title}</b> <span className="hint">· by {c.creator} · {fmtDate(c.submitted_at)}</span></span><span className="pct">{c.score}/{c.total}</span><span className="hint mono">{Math.floor(c.secs / 60)}:{String(c.secs % 60).padStart(2, "0")}</span></Link>
      ))}</div> : <p className="hint">When a classmate sends you a quiz link, it shows up here after you play.</p>}
    </>
  );
}
