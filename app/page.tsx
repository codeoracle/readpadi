import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { BRAND } from "@/lib/brand";
import { naira } from "@/lib/study";
import { RefCapture } from "@/components/RefCapture";
import type { Plan } from "@/lib/types";

export const revalidate = 300;

export default async function Landing() {
  const sb = await supabaseServer();
  const [{ data: s }, { count }] = await Promise.all([
    sb.from("settings").select("free_limit,free_window_hours,plans,locker_free_items").eq("id", 1).single(),
    sb.from("courses").select("id", { count: "exact", head: true }).eq("status", "approved"),
  ]);
  const free = s?.free_limit ?? 10, hours = s?.free_window_hours ?? 6, plans: Plan[] = s?.plans ?? [];
  return (
    <>
      <RefCapture />
      <header className="top"><div className="wrap">
        <Link href="/" className="brand"><span className="brand-mark">{BRAND.short}</span>{BRAND.name}</Link>
        <span style={{ flex: 1 }} />
        <Link href="/login" className="btn sm">Sign in</Link>
      </div></header>
      <main className="wrap">
        <section className="hero">
          <div>
            <span className="chip acc">{count ? `${count} course material${count === 1 ? "" : "s"} in the library` : "Free to start · built for distance learners"}</span>
            <h1 style={{ marginTop: 14 }}>Read your course material. Sit the exam before the exam.</h1>
            <p className="lead">{BRAND.name} turns your course PDFs into a reading desk with an AI professor beside you, and CBT-style practice exams set from the material itself. Every answer is marked, explained, and linked back to the page.</p>
            <div className="meta" style={{ gap: 10 }}>
              <Link href="/login" className="btn pri lg">Start studying free</Link>
              <a href="#how" className="btn lg ghost">How it works</a>
            </div>
          </div>
          <div className="demo-card" aria-hidden="true">
            <div className="meta"><span className="chip acc">GST 103</span><span className="lbl">Question 4 of 20 · Multiple choice</span></div>
            <p style={{ fontFamily: "var(--f-read)", fontSize: 18, margin: 0 }}>Which of these is a renewable source of energy?</p>
            <div className="opts">
              {["Solar energy", "Coal", "Natural gas", "Crude oil"].map((o, i) => (
                <div key={o} className="opt" aria-pressed={i === 0}><span className="k">{"ABCD"[i]}</span><span>{o}</span></div>
              ))}
            </div>
            <div className="note ok">Correct. Sunlight is replenished naturally; coal, natural gas and crude oil are fossil fuels that run out. <b>Page 12.</b> +10 XP</div>
          </div>
        </section>

        <section id="how" className="feature-grid">
          <div className="feature"><h3>An AI professor on every page</h3><p>Ask about anything you are reading. Plain explanations, the points examiners love, and quick quizzes on the page in front of you.</p></div>
          <div className="feature"><h3>Practice exams from your material</h3><p>e-Exam (CBT) or theory (POP) questions set from the course itself, timed and graded on the NOUN scale, with the pages to reread.</p></div>
          <div className="feature"><h3>Quiz your classmates</h3><p>Write your own quiz or turn a practice test into one. Send the link to your WhatsApp group and watch the leaderboard fill up.</p></div>
          <div className="feature"><h3>Your school Locker</h3><p>Fees receipts, course forms, results, admission letter and ID card, sorted by session. Snap a receipt and the AI files it for you.</p></div>
          <div className="feature"><h3>Level up as you study</h3><p>Earn XP for every page and every mark. Keep your streak, climb from Fresher to Professor, and see where you rank in your school.</p></div>
          <div className="feature"><h3>A library you share</h3><p>Add a course material once and your whole class studies from it. Results, notes and exam dates sync across phone and laptop.</p></div>
        </section>

        <section style={{ marginBottom: 48 }}>
          <div className="section-t" style={{ marginTop: 0 }}><h2>Free to use. Passes when exams are close.</h2></div>
          <div className="price">
            <div className="panel"><span className="lbl">Free</span><h2 style={{ fontSize: 28 }}>{naira(0)}</h2>
              <ul><li>Every course in the library</li><li>{free} AI actions, refilled every {hours} hours</li><li>Locker for {s?.locker_free_items ?? 30} documents</li><li>Levels, streaks and ranks</li></ul>
              <Link href="/login" className="btn">Create free account</Link></div>
            {plans.map((p, i) => (
              <div key={p.id} className="panel" style={i === 1 ? { borderColor: "var(--accent)" } : undefined}>
                <span className="lbl" style={i === 1 ? { color: "var(--accent)" } : undefined}>{p.label}{i === 1 ? " · most popular" : ""}</span>
                <h2 style={{ fontSize: 28 }}>{naira(p.price_ngn)} <span className="hint" style={{ fontSize: 14 }}>/ {p.days} days</span></h2>
                <ul><li>Unlimited AI professor and exams</li><li>Unlimited Locker and AI receipt filing</li><li>Card, bank transfer or USSD</li></ul>
                <Link href={`/login?next=/upgrade`} className={`btn ${i === 1 ? "pri" : ""}`}>Get {p.label.toLowerCase()}</Link>
              </div>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 12 }}>Passes are one-off payments and never renew automatically. Invite classmates to earn free Pro days.</p>
        </section>
      </main>
      <footer className="site"><div className="wrap">{BRAND.name} · Built for students preparing for their exams. Questions are generated by AI from uploaded course materials; always confirm with your official course guide.</div></footer>
    </>
  );
}
