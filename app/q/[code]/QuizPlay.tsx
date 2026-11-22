"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { BRAND } from "@/lib/brand";
import { grade, gradeTone, normAns } from "@/lib/study";
import SharePanel from "@/components/SharePanel";

type BoardRow = { name: string; score: number; total: number; secs: number; is_me: boolean };
export type QuizInfo = { code: string; title: string; description?: string; n: number; time_limit_secs: number; expired: boolean; creator: string; is_creator: boolean; course: { id: string; code: string; title: string } | null; takers: number; board: BoardRow[]; mine: { score: number | null; total: number | null; secs: number | null; submitted: boolean } | null };
type Q = { n: number; type: "mcq" | "fib"; q: string; options: string[]; topic: string; page: number | null };
type Review = { n: number; answer: number | string; accept: string[]; explanation: string; given: number | string | null };
type Result = { score: number; total: number; secs: number; rank: number; questions: Q[]; review: Review[] };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function QuizPlay({ info: initial, signedIn }: { info: QuizInfo; signedIn: boolean }) {
  const [info, setInfo] = useState(initial);
  const [stage, setStage] = useState<"intro" | "play" | "result">("intro");
  const [qs, setQs] = useState<Q[]>([]); const [cur, setCur] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [deadline, setDeadline] = useState<number | null>(null); const [left, setLeft] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const sent = useRef(false);
  const sb = supabaseBrowser();

  const refresh = useCallback(async () => { const { data } = await sb.rpc("challenge_info", { p_code: info.code }); if (data) setInfo(data as QuizInfo); }, [sb, info.code]);
  const submit = useCallback(async (ans: Record<string, number | string>) => {
    if (sent.current) return; sent.current = true; setBusy(true);
    const { data, error } = await sb.rpc("submit_challenge", { p_code: info.code, p_answers: ans });
    setBusy(false);
    if (error) { sent.current = false; return setErr(error.message); }
    setResult(data as Result); setStage("result"); refresh(); window.scrollTo({ top: 0 });
  }, [sb, info.code, refresh]);

  async function start() {
    setBusy(true); setErr("");
    const { data, error } = await sb.rpc("start_challenge", { p_code: info.code });
    setBusy(false);
    if (error) return setErr(error.message);
    if (data.done) { sent.current = false; return submit({}); } // already taken: fetch the review
    setQs(data.questions);
    if (data.time_limit_secs) {
      const skew = Date.now() - new Date(data.server_now).getTime();
      setDeadline(new Date(data.started_at).getTime() + skew + data.time_limit_secs * 1000);
    }
    setStage("play");
  }
  useEffect(() => {
    if (stage !== "play" || !deadline) return;
    const t = setInterval(() => { const l = Math.max(0, Math.round((deadline - Date.now()) / 1000)); setLeft(l); if (l <= 0) submit(answers); }, 500);
    return () => clearInterval(t);
  }, [stage, deadline, answers, submit]);

  const board = (
    <div className="panel scroll-x" style={{ padding: 0 }}>
      {info.board.length === 0 ? <p className="hint" style={{ padding: 16 }}>No one has taken this quiz yet. Be first on the board.</p> : (
        <table className="tbl"><thead><tr><th>#</th><th>Student</th><th style={{ textAlign: "right" }}>Score</th><th style={{ textAlign: "right" }}>Time</th></tr></thead>
          <tbody>{info.board.map((r, i) => (
            <tr key={i} style={r.is_me ? { background: "var(--tint)" } : undefined}>
              <td className="mono">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td><td><b>{r.name}{r.is_me ? " (you)" : ""}</b></td>
              <td className="mono" style={{ textAlign: "right" }}>{r.score}/{r.total}</td><td className="mono hint" style={{ textAlign: "right" }}>{mmss(r.secs)}</td>
            </tr>))}</tbody></table>
      )}
    </div>
  );

  if (stage === "play") {
    const q = qs[cur]; const a = answers[q.n];
    const set = (v: number | string) => setAnswers({ ...answers, [q.n]: v });
    const done = qs.filter((x) => answers[x.n] !== undefined && String(answers[x.n]).trim() !== "").length;
    return (
      <div style={{ paddingTop: 24, display: "grid", gap: 14 }}>
        <div className="meta" style={{ justifyContent: "space-between" }}><span className="lbl">{info.title} · question {cur + 1} of {qs.length}</span>{left != null && <span className={`timer ${left < 30 ? "low" : ""}`} style={{ fontSize: 18 }}>{mmss(left)}</span>}</div>
        <div className="bar"><i style={{ width: `${(done / qs.length) * 100}%` }} /></div>
        <section className="qcard">
          <p className="qtext">{q.q}</p>
          {q.type === "mcq" ? <div className="opts">{q.options.map((o, i) => <button key={i} className="opt" aria-pressed={a === i} onClick={() => { set(i); if (cur < qs.length - 1) setTimeout(() => setCur((c) => Math.min(c + 1, qs.length - 1)), 250); }}><span className="k">{"ABCDE"[i]}</span><span>{o}</span></button>)}</div>
            : <input key={q.n} className="fib" defaultValue={(a as string) || ""} onChange={(e) => set(e.target.value)} placeholder="Type your answer" autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label="Your answer" />}
          <div className="qnav">
            <button className="btn" disabled={cur === 0} onClick={() => setCur(cur - 1)}>‹ Previous</button>
            {cur < qs.length - 1 ? <button className="btn pri" onClick={() => setCur(cur + 1)}>Next ›</button> : <button className="btn pri" disabled={busy} onClick={() => submit(answers)}>{busy ? <><span className="spin" /> Submitting…</> : `Submit (${done}/${qs.length} answered)`}</button>}
          </div>
        </section>
        <div className="qgrid">{qs.map((x, i) => <button key={x.n} className={`${answers[x.n] !== undefined && String(answers[x.n]).trim() !== "" ? "done" : ""} ${i === cur ? "cur" : ""}`} onClick={() => setCur(i)} aria-label={`Question ${i + 1}`}>{i + 1}</button>)}</div>
        {err && <div className="note err">{err}</div>}
      </div>
    );
  }

  if (stage === "result" && result) {
    const pct = result.total ? Math.round((result.score / result.total) * 100) : 0;
    const url = typeof window !== "undefined" ? `${window.location.origin}/q/${info.code}` : "";
    return (
      <div style={{ paddingTop: 24, display: "grid", gap: 16 }}>
        <div className="result-hero">
          <div className={`stamp ${pct >= 40 ? "" : "fail"}`}><div className="g">{grade(pct)}</div><div className="p">{pct}%</div><div className="s">#{result.rank} of {info.takers || 1}</div></div>
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <h2 style={{ fontSize: 22 }}>{result.score} of {result.total} correct in {mmss(result.secs)}</h2>
            <p style={{ margin: 0, fontFamily: "var(--f-read)" }}>{result.rank === 1 ? "You are top of the board. Send it on and see who can beat you." : `You placed #${result.rank}. Review the answers below, then challenge someone else.`}</p>
            {info.course && <div className="meta"><Link className="btn sm pri" href={`/course/${info.course.id}`}>Study {info.course.code}</Link><span className="hint">+{Math.min(200, result.score * 10)} XP</span></div>}
          </div>
        </div>
        <SharePanel url={url} title="Pass it on" text={`I got ${result.score}/${result.total} on "${info.title}" on ${BRAND.name}. Beat me:`} />
        <div className="section-t" style={{ margin: 0 }}><h2>Leaderboard</h2><span className="hint">{info.takers} taken</span></div>
        {board}
        <div className="section-t" style={{ margin: 0 }}><h2>Answers</h2></div>
        <div className="review">{result.questions.map((q) => {
          const r = result.review.find((x) => x.n === q.n)!;
          const ok = q.type === "mcq" ? r.given === r.answer : r.given != null && normAns(r.given) !== "" && [r.answer, ...(r.accept || [])].some((x) => normAns(x) === normAns(r.given));
          return (
            <article key={q.n} className={`rv ${ok ? "" : "wrong"}`}>
              <div className="meta"><span className="chip">Q{q.n}</span>{q.topic && <span className="chip">{q.topic}</span>}{q.page && <span className="hint">page {q.page}</span>}</div>
              <p className="q">{q.q}</p>
              <div className="ans">
                <span><span className="lbl">Your answer</span> {r.given == null || r.given === "" ? <em>No answer</em> : q.type === "mcq" ? `${"ABCDE"[r.given as number]}. ${q.options[r.given as number]}` : String(r.given)}</span>
                <span><span className="lbl">Correct</span> {q.type === "mcq" ? `${"ABCDE"[r.answer as number]}. ${q.options[r.answer as number]}` : String(r.answer)}</span>
              </div>
              {r.explanation && <p className="ex">{r.explanation}</p>}
            </article>
          );
        })}</div>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 32, display: "grid", gap: 18 }}>
      <div>
        <span className="chip acc">{info.course ? info.course.code : "Class quiz"}</span>
        <h1 style={{ fontSize: "clamp(26px,5vw,38px)", fontWeight: 800, letterSpacing: "-.02em", marginTop: 10 }}>{info.creator} challenged you</h1>
        <p className="muted" style={{ margin: "6px 0 0", fontFamily: "var(--f-read)", fontSize: 17 }}>{info.title}{info.course ? ` · ${info.course.title}` : ""}</p>
        {info.description && <p style={{ margin: "8px 0 0", fontFamily: "var(--f-read)" }}>{info.description}</p>}
      </div>
      <div className="stats" style={{ marginBottom: 0 }}>
        <div className="stat"><span className="lbl">Questions</span><b>{info.n}</b></div>
        <div className="stat"><span className="lbl">Time</span><b>{info.time_limit_secs ? mmss(info.time_limit_secs) : "Untimed"}</b></div>
        <div className="stat"><span className="lbl">Taken by</span><b>{info.takers}</b></div>
        {info.board[0] && <div className="stat"><span className="lbl">Top score</span><b className={`chip ${gradeTone(Math.round((info.board[0].score / info.board[0].total) * 100))}`} style={{ fontSize: 16 }}>{info.board[0].score}/{info.board[0].total}</b></div>}
      </div>
      {info.expired ? <div className="note">This quiz has closed. You can still see the final board.</div>
        : info.mine?.submitted ? <div className="meta"><span>You scored <b>{info.mine.score}/{info.mine.total}</b>.</span><button className="btn sm" onClick={start} disabled={busy}>See my answers</button></div>
        : info.is_creator ? <div className="note info">This is your quiz. Share the link; your own score from the test already counts as the one to beat.</div>
        : signedIn ? <div className="meta"><button className="btn pri lg" onClick={start} disabled={busy}>{busy ? <><span className="spin" /> Loading…</> : "Start the quiz"}</button><span className="hint">One attempt. {info.time_limit_secs ? "The timer starts when you press start." : "No timer."} Uses no AI credits.</span></div>
        : <div className="meta"><Link className="btn pri lg" href={`/login?next=/q/${info.code}`}>Sign in to play</Link><span className="hint">Free · Google or email · takes 20 seconds</span></div>}
      {err && <div className="note err">{err}</div>}
      <div className="section-t" style={{ margin: 0 }}><h2>Leaderboard</h2></div>
      {board}
    </div>
  );
}
