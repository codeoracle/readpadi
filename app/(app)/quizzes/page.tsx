import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/study";

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
      <div className="page-head"><div><h1>Class quizzes</h1><p>Turn any practice test into a quiz link. Classmates answer the same questions free, and everyone lands on one leaderboard.</p></div><Link href="/library" className="btn pri">Pick a course to quiz on</Link></div>
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="lbl" style={{ marginBottom: 6 }}>How to start one</div>
        <ol style={{ margin: 0, paddingLeft: 20, fontFamily: "var(--f-read)", lineHeight: 1.8 }}>
          <li>Open a course and sit a practice exam (e-Exam, multiple choice, or fill-in-the-gap).</li>
          <li>On your result, tap <b>Create quiz link</b>.</li>
          <li>Send it to your class WhatsApp group. Your score is the one to beat.</li>
        </ol>
      </div>
      <div className="section-t" style={{ marginTop: 0 }}><h2>Quizzes you set</h2><span className="hint">{created.length}</span></div>
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
