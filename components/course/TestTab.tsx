"use client";
import { useEffect, useRef, useState } from "react";
import { askJson } from "@/lib/ai";
import { packPages, pageImage, pageText } from "@/lib/pdf";
import { estMinutes, fmtDate, hasAns, newId, normAns, normQ, profIntro } from "@/lib/study";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Attempt, MarkedItem, Question } from "@/lib/types";
import AiErr from "./AiErr";
import ResultView from "./ResultView";
import type { Ctx } from "./Workspace";

type Kind = "cbt" | "mcq" | "fib" | "theory";
interface Draft { courseId: string; kind: Kind; level: string; from: number; to: number; items: Question[]; answers: Record<string, number | string>; flags: Record<string, boolean>; cur: number; started: number; limit: number }
const dkey = (id: string) => "carrel.test." + id;
const lsGet = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const lsSet = (k: string, v: unknown) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export default function TestTab({ ctx, viewAttempt, clearView }: { ctx: Ctx; viewAttempt: Attempt | null; clearView: () => void }) {
  const { course } = ctx;
  const [test, setTestState] = useState<Draft | null>(null);
  const [result, setResult] = useState<Attempt | null>(null);
  const [marking, setMarking] = useState(false);
  const setTest = (t: Draft | null) => { setTestState(t ? { ...t } : null); lsSet(dkey(course.id), t); };

  if (viewAttempt) return <ResultView ctx={ctx} a={viewAttempt} onRetake={(t) => { clearView(); startRetake(t); }} onNew={clearView} />;
  if (marking) return <div className="empty"><h2><span className="spin" /> Marking your script</h2><p>Objective questions are scored instantly. Written and near-miss answers go to the professor.</p></div>;
  if (result) return <ResultView ctx={ctx} a={result} onRetake={(t) => { setResult(null); startRetake(t); }} onNew={() => setResult(null)} />;
  if (test) return <Hall ctx={ctx} test={test} setTest={setTest} onSubmit={async (t) => { setMarking(true); const a = await mark(ctx, t); lsSet(dkey(course.id), null); setTestState(null); setMarking(false); setResult(a); window.scrollTo({ top: 0 }); }} />;
  return <Setup ctx={ctx} onStart={setTest} />;

  function startRetake(a: Attempt) {
    const items = a.items.filter((r) => r.score < r.max).map(({ given, max, score, feedback, ...q }) => ({ ...q, id: newId() }));
    if (!items.length) return;
    setTest({ courseId: course.id, kind: a.kind, level: a.level, from: a.page_from, to: a.page_to, items, answers: {}, flags: {}, cur: 0, started: Date.now(), limit: estMinutes(a.kind, items.length) * 60 });
  }
}

function Setup({ ctx, onStart }: { ctx: Ctx; onStart: (d: Draft) => void }) {
  const { course, exam, profile } = ctx;
  const P = course.pages || 1;
  const [kind, setKind] = useState<Kind>(exam?.mode === "pop" ? "theory" : "cbt");
  const counts = kind === "theory" ? [3, 5, 8] : [10, 20, 40, 70];
  const [n, setN] = useState(kind === "theory" ? 5 : 20);
  const [range, setRange] = useState<"all" | "custom">("all");
  const [from, setFrom] = useState(1); const [to, setTo] = useState(P);
  const [level, setLevel] = useState("standard");
  const [timed, setTimed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(""); const [err, setErr] = useState<unknown>(null);
  const [saved, setSaved] = useState<Draft | null>(null);
  useEffect(() => { setSaved(lsGet(dkey(course.id))); }, [course.id]);
  useEffect(() => { if (!counts.includes(n)) setN(counts[1]); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    let f = 1, t = P;
    if (range === "custom") { f = Math.max(1, Math.min(from, P)); t = Math.max(f, Math.min(to, P)); }
    setBusy(true); setErr(null);
    try {
      const pages: { n: number; t: string }[] = [];
      for (let p = f; p <= t; p++) { setStatus(`Reading page ${p - f + 1} of ${t - f + 1}…`); pages.push({ n: p, t: await pageText(course.id, course.file_path, p) }); }
      const per = kind === "theory" ? Math.min(n, 4) : 10;
      const batches = Math.ceil(n / per);
      const items: Question[] = [];
      for (let b = 0; b < batches && items.length < n; b++) {
        const want = Math.min(per, n - items.length);
        const seg = pages.slice(Math.floor((b * pages.length) / batches), Math.floor(((b + 1) * pages.length) / batches) || pages.length);
        let mat = packPages(seg.length ? seg : pages); let images: Blob[] | undefined;
        if (mat.trim().length < 300) {
          const pick = []; for (let i = 0; i < 6; i++) pick.push(seg[Math.floor((i * seg.length) / 6)] || seg[0]);
          const uniq = [...new Map(pick.map((p) => [p.n, p])).values()];
          images = []; for (const p of uniq) images.push(await pageImage(course.id, course.file_path, p.n));
          mat = `(The material is attached as page images: pages ${uniq.map((p) => p.n).join(", ")}.)`;
        }
        setStatus(`The professor is setting questions · ${items.length} of ${n} ready`);
        const typeRule = kind === "cbt" ? `About 70% "mcq" and 30% "fib".` : `All questions of type "${kind}".`;
        const lvl = level === "easy" ? "Warm-up: direct recall of definitions and facts stated in the text." : level === "hard" ? "Tough: application, comparison and close distinctions between similar terms; distractors must be very plausible." : "Exam standard: the balance of recall and understanding a university examiner uses.";
        const avoid = items.length ? `\nDo not repeat these questions already set:\n${items.map((x) => "- " + x.q.slice(0, 120)).join("\n")}\n` : "";
        const prompt = `${profIntro(course, profile, exam)}

Set exactly ${want} examination questions strictly from the course material below. ${typeRule}
Difficulty — ${lvl}
Spread the questions across different pages and topics. Never ask about anything the material does not state.
Types:
- "mcq": a question with exactly 4 options and one correct answer. Distractors come from related terms in the same material. Never use "all of the above" or "none of the above". "answer" is the 0-based index of the correct option.
- "fib": an e-exam fill-in-the-gap sentence with ______ for a missing word or short phrase (1–4 words) taken from the material. "answer" is the exact term; "accept" lists other acceptable forms (abbreviation, spelling variant).
- "theory": a POP-style question ("Discuss…", "Explain…", "Enumerate and explain…"). "answer" is a marking guide of 4–6 bullet points worth 5 marks in total.
Every question has "explanation" (1–2 sentences explaining why the answer is right, from the material), "page" (the number from the [Page N] markers), and "topic" (2–4 words naming the concept).${avoid}
Reply with only a JSON array, for example:
[{"type":"mcq","q":"Which of these is a general classification scheme?","options":["Library of Congress Classification","Sears List of Subject Headings","AACR2","MARC 21"],"answer":0,"explanation":"LCC classifies all knowledge; the others are subject headings, cataloguing rules and a format.","page":12,"topic":"Classification schemes"},{"type":"fib","q":"The ______ was devised by Melvil Dewey in 1876.","answer":"Dewey Decimal Classification","accept":["DDC"],"explanation":"The material credits Dewey with DDC, first published in 1876.","page":14,"topic":"Classification schemes"}]

MATERIAL:
${mat}`;
        let arr: any;
        try { arr = await askJson(prompt, { images }); }
        catch (e: any) { if (e?.code === "invalid_json" && items.length) break; throw e; }
        if (!Array.isArray(arr)) arr = Array.isArray(arr?.questions) ? arr.questions : [];
        for (const q of arr) { const it = normQ(q, kind); if (it && items.length < n) items.push(it); }
      }
      if (!items.length) throw { message: "The professor could not set questions from these pages. Try a different page range." };
      onStart({ courseId: course.id, kind, level, from: f, to: t, items, answers: {}, flags: {}, cur: 0, started: Date.now(), limit: timed ? estMinutes(kind, items.length) * 60 : 0 });
    } catch (e) { setErr(e); }
    setBusy(false); setStatus("");
  }

  const kinds: [Kind, string, string][] = [["cbt", "e-Exam (CBT)", "Multiple choice and fill-in-the-gap, as in 100–200 level e-exams"], ["mcq", "Multiple choice only", ""], ["fib", "Fill-in-the-gap only", ""], ["theory", "Theory (POP)", "Written answers marked by the professor"]];
  const calls = kind === "theory" ? Math.ceil(n / Math.min(n, 4)) : Math.ceil(n / 10);
  return (
    <div className="setup">
      <div className="panel form">
        <h2 style={{ fontSize: 18 }}>Set a practice exam</h2>
        {saved && <div className="note">You have an unfinished test from {fmtDate(saved.started)} ({saved.items.length} questions). <button className="link" onClick={() => { if (saved.limit && Date.now() - saved.started >= saved.limit * 1000) saved.started = Date.now() - (saved.limit - 60) * 1000; onStart(saved); }}>Resume it</button> · <button className="link" onClick={() => { lsSet(dkey(course.id), null); setSaved(null); }}>Discard</button></div>}
        <div className="field"><span className="lbl">Format</span><div className="seg">{kinds.map(([v, l]) => <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)}>{l}</button>)}</div>{kinds.find((k) => k[0] === kind)![2] && <span className="hint">{kinds.find((k) => k[0] === kind)![2]}</span>}</div>
        <div className="field"><span className="lbl">Number of questions</span><div className="seg">{counts.map((c) => <button key={c} type="button" aria-pressed={n === c} onClick={() => setN(c)}>{c}</button>)}</div></div>
        <div className="field"><span className="lbl">Pages to cover</span>
          <div className="seg"><button type="button" aria-pressed={range === "all"} onClick={() => setRange("all")}>Whole course (1–{P})</button><button type="button" aria-pressed={range === "custom"} onClick={() => setRange("custom")}>Choose pages</button></div>
          {range === "custom" && <div className="row2"><div className="field"><label className="lbl" htmlFor="tFrom">From</label><input id="tFrom" type="number" min={1} max={P} value={from} onChange={(e) => setFrom(+e.target.value)} /></div><div className="field"><label className="lbl" htmlFor="tTo">To</label><input id="tTo" type="number" min={1} max={P} value={to} onChange={(e) => setTo(+e.target.value)} /></div></div>}
        </div>
        <div className="field"><span className="lbl">Difficulty</span><div className="seg">{[["standard", "Exam standard"], ["easy", "Warm-up"], ["hard", "Tough"]].map(([v, l]) => <button key={v} type="button" aria-pressed={level === v} onClick={() => setLevel(v)}>{l}</button>)}</div></div>
        <div className="field"><span className="lbl">Timer</span><div className="seg"><button type="button" aria-pressed={timed} onClick={() => setTimed(true)}>Timed · {estMinutes(kind, n)} min</button><button type="button" aria-pressed={!timed} onClick={() => setTimed(false)}>Untimed</button></div></div>
        {status && <div className="note ok"><span className="spin" /> {status}</div>}
        <AiErr e={err} />
        <div className="meta"><button className="btn pri" onClick={generate} disabled={busy}>{busy ? <><span className="spin" /> Setting questions…</> : "Set my exam"}</button><span className="hint">Uses {calls} AI action{calls === 1 ? "" : "s"}, plus 1 to mark written answers</span></div>
      </div>
      <aside className="panel" style={{ display: "grid", gap: 10 }}>
        <div className="lbl">How marking works</div>
        <p style={{ margin: 0, fontFamily: "var(--f-read)", fontSize: 15, lineHeight: 1.55 }}>Questions come only from the course material, each tied to the page it was set from. Objective questions score 1 mark. Theory answers are marked out of 5 against a marking guide. Grades follow the NOUN scale: A 70+, B 60–69, C 50–59, D 45–49, E 40–44, F below 40.</p>
        <p className="hint" style={{ margin: 0 }}>After you submit, every question shows the right answer, why, and a link to its page. Missed topics are listed so you know what to reread.</p>
      </aside>
    </div>
  );
}

function Hall({ ctx, test, setTest, onSubmit }: { ctx: Ctx; test: Draft; setTest: (d: Draft | null) => void; onSubmit: (d: Draft) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const submitted = useRef(false);
  const it = test.items[test.cur]; const a = test.answers[it.id];
  const answered = test.items.filter((x) => hasAns(test.answers[x.id])).length;
  const upd = (patch: Partial<Draft>) => setTest({ ...test, ...patch });
  const answer = (v: number | string) => upd({ answers: { ...test.answers, [it.id]: v } });

  useEffect(() => {
    if (!test.limit) return;
    const tick = () => {
      const l = Math.max(0, test.limit - Math.floor((Date.now() - test.started) / 1000)); setLeft(l);
      if (l <= 0 && !submitted.current) { submitted.current = true; onSubmit(test); }
    };
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, [test, onSubmit]);

  const label = it.type === "mcq" ? "Multiple choice" : it.type === "fib" ? "Fill in the gap" : `Theory · ${it.marks} marks`;
  const unanswered = test.items.length - answered;
  return (
    <div className="hall">
      <section className="qcard">
        <div className="qtop"><span className="lbl">Question {test.cur + 1} of {test.items.length} · {label}</span>
          <button className={`btn sm ${test.flags[it.id] ? "" : "ghost"}`} onClick={() => upd({ flags: { ...test.flags, [it.id]: !test.flags[it.id] } })}>{test.flags[it.id] ? "Flagged" : "Flag for review"}</button></div>
        <p className="qtext">{it.q}</p>
        {it.type === "mcq" && <div className="opts">{it.options!.map((o, i) => <button key={i} className="opt" aria-pressed={a === i} onClick={() => answer(i)}><span className="k">{"ABCDE"[i]}</span><span>{o}</span></button>)}</div>}
        {it.type === "fib" && <><label className="lbl" htmlFor="ansIn">Your answer</label><input key={it.id} className="fib" id="ansIn" defaultValue={(a as string) || ""} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => answer(e.target.value)} /></>}
        {it.type === "theory" && <div className="field"><label className="lbl" htmlFor="ansIn">Your answer</label><textarea key={it.id} id="ansIn" rows={9} defaultValue={(a as string) || ""} placeholder="Write as you would in the exam hall: introduce, list and explain each point." onChange={(e) => answer(e.target.value)} /><span className="hint">Marked out of {it.marks}.</span></div>}
        <div className="qnav">
          <button className="btn" disabled={test.cur === 0} onClick={() => upd({ cur: test.cur - 1 })}>‹ Previous</button>
          {test.cur < test.items.length - 1 ? <button className="btn pri" onClick={() => upd({ cur: test.cur + 1 })}>Next ›</button> : <button className="btn pri" onClick={() => setConfirm(true)}>Finish</button>}
        </div>
      </section>
      <aside className="panel" style={{ display: "grid", gap: 14 }}>
        {test.limit ? <div><div className="lbl">Time left</div><div className={`timer ${left != null && left < 120 ? "low" : ""}`}>{left == null ? "--:--" : `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`}</div></div> : <div><div className="lbl">Untimed</div><div className="hint">Take your time.</div></div>}
        <div><div className="lbl" style={{ marginBottom: 8 }}>{answered} of {test.items.length} answered</div>
          <div className="qgrid">{test.items.map((x, i) => <button key={x.id} className={`${hasAns(test.answers[x.id]) ? "done" : ""} ${i === test.cur ? "cur" : ""} ${test.flags[x.id] ? "flag" : ""}`} onClick={() => upd({ cur: i })} aria-label={`Question ${i + 1}`}>{i + 1}</button>)}</div></div>
        {confirm ? (
          <div className="confirm"><b>{unanswered ? `${unanswered} question${unanswered === 1 ? "" : "s"} unanswered.` : "All questions answered."}</b><span className="hint">You cannot change answers after submitting.</span>
            <div className="meta"><button className="btn pri sm" onClick={() => { submitted.current = true; onSubmit(test); }}>Submit now</button><button className="btn sm" onClick={() => setConfirm(false)}>Keep working</button></div></div>
        ) : <button className="btn" style={{ width: "100%" }} onClick={() => setConfirm(true)}>Submit exam</button>}
        <button className="link" style={{ justifySelf: "start" }} onClick={() => setTest(null)}>Discard this test</button>
      </aside>
    </div>
  );
}

async function mark(ctx: Ctx, T: Draft): Promise<Attempt> {
  const out: (MarkedItem & { check?: boolean })[] = T.items.map((it) => {
    const a = T.answers[it.id];
    const r: MarkedItem & { check?: boolean } = { ...it, given: a ?? null, max: it.type === "theory" ? it.marks || 5 : 1, score: 0, feedback: "" };
    if (it.type === "mcq") r.score = a === it.answer ? 1 : 0;
    else if (it.type === "fib") { const g = normAns(a); r.score = g && [it.answer, ...(it.accept || [])].some((x) => normAns(x) === g) ? 1 : 0; r.check = !r.score && !!g; }
    else r.check = hasAns(a);
    return r;
  });
  const toCheck = out.filter((r) => r.check);
  let aiNote = "";
  if (toCheck.length) {
    try {
      const list = toCheck.map((r, i) => r.type === "fib"
        ? `#${i} [fill-in-the-gap, 1 mark]\nQuestion: ${r.q}\nExpected: ${r.answer}${r.accept?.length ? " (also: " + r.accept.join(", ") + ")" : ""}\nStudent wrote: ${r.given}`
        : `#${i} [theory, ${r.max} marks]\nQuestion: ${r.q}\nMarking guide:\n${r.answer}\nStudent wrote:\n${r.given}`).join("\n\n");
      const res = await askJson(`${profIntro(ctx.course, ctx.profile, ctx.exam)}\n\nMark these exam answers as a fair examiner.\n- Fill-in-the-gap: award 1 if the student's answer means the same term (minor misspelling, abbreviation or word-order slip is fine), else 0.\n- Theory: award marks out of the maximum against the guide; credit correct points in the student's own words; half marks allowed. Feedback says what earned marks and exactly what was missing (2–3 sentences, addressed to the student).\nReply with only a JSON array: [{"n":0,"score":1,"feedback":"..."}]\n\n${list}`);
      for (const g of Array.isArray(res) ? res : []) { const r = toCheck[g.n]; if (!r) continue; r.score = Math.max(0, Math.min(r.max, Math.round((Number(g.score) || 0) * 2) / 2)); r.feedback = String(g.feedback || ""); }
    } catch (e: any) { aiNote = `The professor could not mark the written answers (${e?.message || "error"}). Fill-in-the-gap answers were marked by exact match, and theory answers scored 0. Compare them with the marking guide below.`; }
  }
  const score = out.reduce((s, r) => s + r.score, 0), total = out.reduce((s, r) => s + r.max, 0);
  const row = { course_id: T.courseId, kind: T.kind, level: T.level, page_from: T.from, page_to: T.to, score, total, pct: total ? Math.round((score / total) * 100) : 0, secs: Math.round((Date.now() - T.started) / 1000), items: out.map(({ check, ...r }) => r), ai_note: aiNote };
  const { data, error } = await supabaseBrowser().from("attempts").insert(row).select().single();
  const attempt: Attempt = data ?? { ...row, id: newId(), created_at: new Date().toISOString(), ai_note: aiNote + (error ? ` This result could not be saved: ${error.message}` : "") };
  ctx.setAttempts((as) => [...as, attempt]);
  return attempt;
}
