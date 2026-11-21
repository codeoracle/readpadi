"use client";
import { useState } from "react";
import { fmtDate, grade, md, topicRows, verdict } from "@/lib/study";
import type { Attempt, MarkedItem } from "@/lib/types";
import type { Ctx } from "./Workspace";
import CreateChallenge from "@/components/CreateChallenge";

export default function ResultView({ ctx, a, onRetake, onNew }: { ctx: Ctx; a: Attempt; onRetake: (a: Attempt) => void; onNew: () => void }) {
  const [onlyWrong, setOnlyWrong] = useState(false);
  const pass = a.pct >= 40;
  const tps = topicRows(a.items); const weak = tps.filter((t) => t.pct < 50);
  const wrong = a.items.filter((r) => r.score < r.max);
  return (
    <>
      <div className="result-hero">
        <div className={`stamp ${pass ? "" : "fail"}`}><div className="g">{grade(a.pct)}</div><div className="p">{a.pct}%</div><div className="s">{pass ? "Pass" : "Below pass"}</div></div>
        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <h2 style={{ fontSize: 22 }}>{a.score} of {a.total} marks</h2>
          <div className="meta"><span className="chip">{fmtDate(a.created_at)}</span><span className="chip">{a.items.length} questions</span><span className="chip">pages {a.page_from}–{a.page_to}</span><span className="chip">{Math.floor(a.secs / 60)} min {a.secs % 60} s</span></div>
          <p style={{ margin: 0, fontFamily: "var(--f-read)", fontSize: 15.5 }}>{verdict(a.pct, weak)}</p>
          <div className="acts">{wrong.length > 0 && <button className="btn pri sm" onClick={() => onRetake(a)}>Retake the {wrong.length} I missed</button>}<button className="btn sm" onClick={onNew}>New exam</button></div>
        </div>
      </div>
      {a.ai_note && <div className="note" style={{ marginBottom: 14 }}>{a.ai_note}</div>}
      <div style={{ marginBottom: 16 }}><CreateChallenge attempt={a} courseId={ctx.course.id} courseCode={ctx.course.code} refCode={ctx.profile?.referral_code} /></div>
      <div className="panel"><div className="lbl">Score by topic</div>
        <div className="topics">{tps.map((t) => (
          <div key={t.k} className={`topic ${t.pct < 50 ? "weak" : ""}`}>
            <span style={{ minWidth: 0 }}>{t.k} {t.pct < 50 && t.pages.length > 0 && <button className="link" onClick={() => ctx.goPage(t.pages[0])}>reread p.{t.pages.join(", ")}</button>}</span>
            <div className="bar"><i style={{ width: `${t.pct}%` }} /></div><span className="mono" style={{ textAlign: "right" }}>{t.pct}%</span>
          </div>))}</div>
      </div>
      <div className="section-t"><h2>Review your script</h2><div className="seg"><button aria-pressed={!onlyWrong} onClick={() => setOnlyWrong(false)}>All</button><button aria-pressed={onlyWrong} onClick={() => setOnlyWrong(true)}>Missed only ({wrong.length})</button></div></div>
      <div className="review">{a.items.map((r, i) => (onlyWrong && r.score >= r.max ? null : <ReviewCard key={r.id || i} r={r} i={i} goPage={ctx.goPage} />))}</div>
    </>
  );
}

function ReviewCard({ r, i, goPage }: { r: MarkedItem; i: number; goPage: (n: number) => void }) {
  const cls = r.score >= r.max ? "" : r.score > 0 ? "part" : "wrong";
  const no = <em>No answer</em>;
  return (
    <article className={`rv ${cls}`}>
      <div className="meta"><span className="chip">Q{i + 1}</span><span className={`chip ${cls === "" ? "good" : cls === "part" ? "warn" : "bad"}`}>{r.score}/{r.max}</span><span className="chip">{r.topic}</span>{r.page && <button className="link" onClick={() => goPage(r.page!)}>page {r.page}</button>}</div>
      <p className="q">{r.q}</p>
      <div className="ans">
        {r.type === "mcq" && <><span><span className="lbl">Your answer</span> {r.given == null ? no : `${"ABCDE"[r.given as number]}. ${r.options![r.given as number]}`}</span>{!r.score && <span><span className="lbl">Correct</span> {"ABCDE"[r.answer as number]}. {r.options![r.answer as number]}</span>}</>}
        {r.type === "fib" && <><span><span className="lbl">Your answer</span> {r.given ? String(r.given) : no}</span>{!r.score && <span><span className="lbl">Correct</span> {String(r.answer)}</span>}</>}
        {r.type === "theory" && <>
          <details><summary className="lbl" style={{ cursor: "pointer" }}>Your answer</summary><div style={{ fontFamily: "var(--f-read)", whiteSpace: "pre-wrap", marginTop: 6 }}>{r.given ? String(r.given) : no}</div></details>
          <details open={r.score < r.max}><summary className="lbl" style={{ cursor: "pointer" }}>Marking guide</summary><div className="md" style={{ fontFamily: "var(--f-read)", marginTop: 6 }} dangerouslySetInnerHTML={{ __html: md(String(r.answer)) }} /></details>
        </>}
      </div>
      {r.feedback && <p className="ex" style={{ color: "var(--ink)" }}><b>Professor:</b> {r.feedback}</p>}
      {r.explanation && <p className="ex">{r.explanation}</p>}
    </article>
  );
}
