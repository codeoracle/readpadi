"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { askJson, aiMessage, type AiError } from "@/lib/ai";
import { BRAND } from "@/lib/brand";
import { newId } from "@/lib/study";
import SharePanel from "@/components/SharePanel";

type Kind = "mcq" | "tf" | "fib";
interface Item { id: string; kind: Kind; q: string; options: string[]; answer: number; text: string; accept: string; explanation: string }
const blank = (kind: Kind = "mcq"): Item => ({ id: newId(), kind, q: "", options: kind === "tf" ? ["True", "False"] : ["", "", "", ""], answer: kind === "fib" ? -1 : 0, text: "", accept: "", explanation: "" });
const DRAFT = "akada.quizDraft";

function problems(it: Item): string | null {
  if (!it.q.trim()) return "Write the question.";
  if (it.kind === "fib") return it.text.trim() ? null : "Add the correct answer.";
  const filled = it.options.map((o) => o.trim());
  if (filled.filter(Boolean).length < 2) return "Add at least two options.";
  if (!filled[it.answer]) return "Mark which option is correct.";
  return null;
}
function toPayload(it: Item) {
  if (it.kind === "fib") return { type: "fib", q: /_{2,}/.test(it.q) ? it.q.trim() : it.q.trim() + " ______", answer: it.text.trim(), accept: it.accept.split(",").map((s) => s.trim()).filter(Boolean), explanation: it.explanation.trim() };
  const opts = it.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
  return { type: "mcq", q: it.q.trim(), options: opts.map((x) => x.o), answer: opts.findIndex((x) => x.i === it.answer), explanation: it.explanation.trim() };
}

export default function QuizBuilder({ courses, initialCourse, refCode }: { courses: { id: string; code: string; title: string }[]; initialCourse: string; refCode?: string }) {
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [course, setCourse] = useState(initialCourse); const [time, setTime] = useState("auto"); const [pub, setPub] = useState(true);
  const [items, setItems] = useState<Item[]>([blank(), blank(), blank()]);
  const [showErrors, setShowErrors] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    try { const d = JSON.parse(localStorage.getItem(DRAFT) || "null"); if (d?.items?.length) { setTitle(d.title || ""); setDesc(d.desc || ""); setItems(d.items); if (!initialCourse && d.course) setCourse(d.course); } } catch {}
    loaded.current = true;
  }, [initialCourse]);
  useEffect(() => { if (loaded.current && !code) { try { localStorage.setItem(DRAFT, JSON.stringify({ title, desc, course, items })); } catch {} } }, [title, desc, course, items, code]);

  const upd = (id: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => setItems((xs) => { const a = [...xs]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const complete = items.filter((it) => !problems(it));
  const secs = time === "none" ? 0 : time === "auto" ? Math.max(120, complete.length * 45) : +time * 60;

  async function create() {
    setShowErrors(true); setErr("");
    if (!title.trim()) return setErr("Give your quiz a title.");
    if (complete.length < 3) return setErr("Finish at least 3 questions. Incomplete ones are highlighted.");
    if (complete.length < items.length) { const bad = items.findIndex((it) => problems(it)); document.getElementById("q-" + items[bad].id)?.scrollIntoView({ behavior: "smooth", block: "center" }); return setErr(`Question ${bad + 1} is incomplete. Fix it or delete it.`); }
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("create_challenge", { p_title: title.trim(), p_course: course || null, p_items: items.map(toPayload), p_time_limit: secs, p_description: desc.trim(), p_public: pub });
    setBusy(false);
    if (error) return setErr(error.message);
    try { localStorage.removeItem(DRAFT); } catch {}
    setCode(data as string); window.scrollTo({ top: 0 });
  }

  if (code) {
    const url = `${window.location.origin}/q/${code}${refCode ? `?ref=${refCode}` : ""}`;
    return (
      <div style={{ display: "grid", gap: 14, maxWidth: 720 }}>
        <SharePanel url={url} title={`“${title}” is live`} text={`Try my ${complete.length}-question quiz "${title}" on ${BRAND.name}:`} />
        <p className="hint" style={{ margin: 0 }}>{pub ? "It is also listed on the quiz board" + (course ? " for this course" : "") + "." : "Only people with the link can find it."} Quizzes stay open for 14 days. You cannot play your own quiz.</p>
        <div className="meta"><Link className="btn" href={`/q/${code}`}>Open quiz page</Link><button className="btn ghost" onClick={() => { setCode(null); setTitle(""); setDesc(""); setItems([blank(), blank(), blank()]); setShowErrors(false); }}>Create another</button></div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 820 }}>
      <div className="panel form">
        <div className="field"><label className="lbl" htmlFor="qt">Quiz title</label><input id="qt" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. LIS 211 Units 1–3 revision" /></div>
        <div className="field"><label className="lbl" htmlFor="qd">Description (optional)</label><input id="qd" maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What it covers, who it is for" /></div>
        <div className="row2">
          <div className="field"><label className="lbl" htmlFor="qc">Course (optional)</label><select id="qc" value={course} onChange={(e) => setCourse(e.target.value)}><option value="">Not linked to a course</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select></div>
          <div className="field"><label className="lbl" htmlFor="qtime">Timer</label><select id="qtime" value={time} onChange={(e) => setTime(e.target.value)}><option value="auto">Automatic (45 s per question)</option><option value="none">No timer</option>{[5, 10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}</select></div>
        </div>
        <label className="meta" style={{ cursor: "pointer" }}><input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} style={{ width: 18, height: 18 }} /> List it on the quiz board{course ? " for this course" : ""} so any student can play</label>
      </div>

      <AiDraft courseName={courses.find((c) => c.id === course)?.code} onAdd={(news) => setItems((xs) => [...xs.filter((x) => x.q.trim() || x.text.trim() || x.options.some((o) => o.trim() && o !== "True" && o !== "False")), ...news])} />

      {items.map((it, i) => {
        const p = showErrors ? problems(it) : null;
        return (
          <section key={it.id} id={"q-" + it.id} className="panel form" style={p ? { borderColor: "var(--bad)" } : undefined}>
            <div className="meta" style={{ justifyContent: "space-between" }}>
              <span className="lbl">Question {i + 1}</span>
              <div className="seg">{(["mcq", "tf", "fib"] as Kind[]).map((k) => <button key={k} type="button" aria-pressed={it.kind === k} onClick={() => upd(it.id, { ...blank(k), id: it.id, q: it.q, explanation: it.explanation })}>{{ mcq: "Multiple choice", tf: "True / False", fib: "Fill the gap" }[k]}</button>)}</div>
            </div>
            <div className="field"><textarea rows={2} maxLength={600} value={it.q} onChange={(e) => upd(it.id, { q: e.target.value })} placeholder={i > 0 ? `Type question ${i + 1}…` : it.kind === "fib" ? "e.g. The ______ was devised by Melvil Dewey in 1876." : it.kind === "tf" ? "e.g. AACR2 is a classification scheme." : "e.g. Which of these is a general classification scheme?"} aria-label={`Question ${i + 1}`} style={{ minHeight: 64 }} /></div>
            {it.kind === "fib" ? (
              <div className="row2">
                <div className="field"><label className="lbl">Correct answer</label><input maxLength={120} value={it.text} onChange={(e) => upd(it.id, { text: e.target.value })} placeholder="Dewey Decimal Classification" /></div>
                <div className="field"><label className="lbl">Also accept (comma-separated)</label><input maxLength={240} value={it.accept} onChange={(e) => upd(it.id, { accept: e.target.value })} placeholder="DDC, Dewey Decimal" /></div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                <span className="hint">Tap the circle next to the correct answer.</span>
                {it.options.map((o, j) => (
                  <div key={j} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto", gap: 8, alignItems: "center" }}>
                    <button type="button" className="opt" aria-pressed={it.answer === j} onClick={() => upd(it.id, { answer: j })} style={{ padding: 0, border: 0, background: "none", display: "block" }} aria-label={`Mark option ${"ABCDEF"[j]} correct`}><span className="k" style={it.answer === j ? { background: "var(--good)", color: "#fff", borderColor: "var(--good)" } : undefined}>{it.answer === j ? "✓" : "ABCDEF"[j]}</span></button>
                    <input className="input" maxLength={200} value={o} readOnly={it.kind === "tf"} onChange={(e) => upd(it.id, { options: it.options.map((x, k) => (k === j ? e.target.value : x)) })} placeholder={`Option ${"ABCDEF"[j]}`} />
                    {it.kind === "mcq" && it.options.length > 2 ? <button type="button" className="btn sm ghost" onClick={() => upd(it.id, { options: it.options.filter((_, k) => k !== j), answer: it.answer === j ? 0 : it.answer > j ? it.answer - 1 : it.answer })} aria-label="Remove option">✕</button> : <span />}
                  </div>
                ))}
                {it.kind === "mcq" && it.options.length < 6 && <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => upd(it.id, { options: [...it.options, ""] })}>+ Add option</button>}
              </div>
            )}
            <div className="field"><label className="lbl">Explanation shown after answering (optional)</label><input maxLength={600} value={it.explanation} onChange={(e) => upd(it.id, { explanation: e.target.value })} placeholder="Why this is the answer, or where to read more" /></div>
            {p && <div className="note err">{p}</div>}
            <div className="meta" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn sm ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
              <button type="button" className="btn sm ghost" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              <button type="button" className="btn sm ghost" onClick={() => setItems((xs) => [...xs.slice(0, i + 1), { ...it, id: newId() }, ...xs.slice(i + 1)])}>Duplicate</button>
              <button type="button" className="btn sm ghost danger" onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))} disabled={items.length <= 1}>Delete</button>
            </div>
          </section>
        );
      })}

      <div className="meta">
        {(["mcq", "tf", "fib"] as Kind[]).map((k) => <button key={k} type="button" className="btn sm" disabled={items.length >= 40} onClick={() => setItems((xs) => [...xs, blank(k)])}>+ {{ mcq: "Multiple choice", tf: "True / False", fib: "Fill the gap" }[k]}</button>)}
        <span className="hint">{items.length}/40 questions</span>
      </div>

      <div className="panel" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", position: "sticky", bottom: 72, zIndex: 5 }}>
        <span className="hint">{complete.length} of {items.length} questions ready · {secs ? `${Math.round(secs / 60)} min timer` : "no timer"} · draft saved on this device</span>
        <button className="btn pri" onClick={create} disabled={busy}>{busy ? <><span className="spin" /> Publishing…</> : "Publish & get link"}</button>
        {err && <div className="note err" style={{ width: "100%" }}>{err}</div>}
      </div>
    </div>
  );
}

function AiDraft({ courseName, onAdd }: { courseName?: string; onAdd: (items: Item[]) => void }) {
  const [open, setOpen] = useState(false); const [notes, setNotes] = useState(""); const [n, setN] = useState(10);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null);
  async function draft() {
    if (notes.trim().length < 20) return setErr({ message: "Paste some notes or describe the topic in a sentence or two." });
    setBusy(true); setErr(null);
    try {
      const arr = await askJson(`You are helping a university student${courseName ? ` studying ${courseName}` : ""} write a revision quiz for classmates. Using ONLY the notes or topic below, write ${n} questions: mostly multiple choice (4 options), some true/false, and a few fill-in-the-gap. Keep the language simple and accurate.
Reply with only a JSON array of objects:
{"kind":"mcq","q":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}
{"kind":"tf","q":"...","answer":0 (0 = True, 1 = False),"explanation":"..."}
{"kind":"fib","q":"... ______ ...","text":"correct answer","accept":"other forms, comma-separated","explanation":"..."}

NOTES / TOPIC:
${notes.slice(0, 30000)}`, { maxTokens: 6000 });
      const out: Item[] = [];
      for (const r of Array.isArray(arr) ? arr : []) {
        if (!r?.q) continue;
        if (r.kind === "fib" && r.text) out.push({ ...blank("fib"), q: String(r.q), text: String(r.text), accept: String(r.accept || ""), explanation: String(r.explanation || "") });
        else if (r.kind === "tf") out.push({ ...blank("tf"), q: String(r.q), answer: Number(r.answer) === 1 ? 1 : 0, explanation: String(r.explanation || "") });
        else if (Array.isArray(r.options) && r.options.length >= 2) out.push({ ...blank("mcq"), q: String(r.q), options: r.options.slice(0, 6).map(String), answer: Math.min(Math.max(0, Number(r.answer) || 0), r.options.length - 1), explanation: String(r.explanation || "") });
      }
      if (!out.length) throw { message: "The AI did not return usable questions. Try clearer notes." };
      onAdd(out); setOpen(false); setNotes("");
    } catch (e) { setErr(e); }
    setBusy(false);
  }
  if (!open) return (
    <div className="panel" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", background: "var(--tint)", borderColor: "var(--tint)" }}>
      <div style={{ minWidth: 0 }}><b>Draft questions with AI</b><div className="hint">Paste your notes or name a topic. The AI writes questions you can edit before publishing. Uses 1 AI action.</div></div>
      <button className="btn sm pri" onClick={() => setOpen(true)}>Draft with AI</button>
    </div>
  );
  return (
    <div className="panel form" style={{ borderColor: "var(--accent)" }}>
      <b>Draft questions with AI</b>
      <div className="field"><label className="lbl" htmlFor="ain">Your notes, or a topic</label><textarea id="ain" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paste a page of notes, a summary, or write e.g. “Functions of a public library and types of library users”" /></div>
      <div className="meta"><span className="lbl">How many</span><div className="seg">{[5, 10, 15, 20].map((x) => <button key={x} type="button" aria-pressed={n === x} onClick={() => setN(x)}>{x}</button>)}</div></div>
      {!!err && <div className="note err">{aiMessage(err)}{(err as AiError)?.code === "limit" && <> <Link className="link" href="/upgrade">Get a pass</Link></>}</div>}
      <div className="meta" style={{ justifyContent: "flex-end" }}><button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn pri" onClick={draft} disabled={busy}>{busy ? <><span className="spin" /> Drafting…</> : `Draft ${n} questions`}</button></div>
      <span className="hint">Always check the AI’s answers before you publish. You are the quiz master.</span>
    </div>
  );
}
