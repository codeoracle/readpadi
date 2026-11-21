"use client";
import { useState } from "react";
import { ask } from "@/lib/ai";
import { packPages, pageText } from "@/lib/pdf";
import { fmtDate, md, profIntro } from "@/lib/study";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import AiErr from "./AiErr";
import type { Ctx } from "./Workspace";

export default function NotesTab({ ctx }: { ctx: Ctx }) {
  const { course, notes, setNotes, page, profile, exam } = ctx;
  const P = course.pages || 1;
  const [from, setFrom] = useState(Math.min(page, P));
  const [to, setTo] = useState(Math.min(page + 14, P));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const toast = useToast();

  async function guide() {
    const f = Math.max(1, Math.min(from, P)), t = Math.max(f, Math.min(to, P, f + 40));
    setBusy(true); setErr(null);
    try {
      const pages = [];
      for (let n = f; n <= t; n++) { setStatus(`Reading page ${n - f + 1} of ${t - f + 1}…`); pages.push({ n, t: await pageText(course.id, course.file_path, n) }); }
      const mat = packPages(pages);
      if (mat.trim().length < 200) throw { message: "These pages have almost no text the professor can read (the PDF may be scanned). Use “Explain this page” in the reader instead, which can read scanned pages." };
      setStatus("The professor is writing your guide…");
      const r = await ask(`${profIntro(course, profile, exam)}\n\nWrite revision notes for pages ${f}–${t} of the course material below. Structure:\n## Overview (3 sentences)\n## Key terms (term — definition, as the material defines it)\n## Must-know lists (numbered lists students are asked to "state" or "enumerate", with page numbers)\n## Concepts explained (short paragraphs)\n## How this is examined (5 sample questions, one-line model answers)\nCite page numbers like (p. 12). Use only the material.\n\nMATERIAL:\n${mat}`);
      const { data, error } = await supabaseBrowser().from("notes").insert({ course_id: course.id, label: `Study guide · pages ${f}–${t}`, body: r.text, page_from: f, page_to: t }).select().single();
      if (error) throw { message: error.message };
      setNotes((ns) => [data, ...ns]); toast("Study guide saved");
    } catch (e) { setErr(e); }
    setBusy(false); setStatus("");
  }
  async function del(id: string) {
    await supabaseBrowser().from("notes").delete().eq("id", id);
    setNotes((ns) => ns.filter((n) => n.id !== id));
  }
  const sorted = [...notes].sort((a, b) => (a.page_from || 0) - (b.page_from || 0) || b.created_at.localeCompare(a.created_at));

  return (
    <>
      <div className="panel form" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18 }}>Make a study guide</h2>
        <p className="hint" style={{ margin: 0 }}>The professor condenses a stretch of pages into revision notes: key definitions, lists to memorise, and how each idea is usually examined. One unit (10–25 pages) works best; the maximum is 40 pages.</p>
        <div className="row2">
          <div className="field"><label className="lbl" htmlFor="nFrom">From page</label><input id="nFrom" type="number" min={1} max={P} value={from} onChange={(e) => setFrom(+e.target.value)} /></div>
          <div className="field"><label className="lbl" htmlFor="nTo">To page</label><input id="nTo" type="number" min={1} max={P} value={to} onChange={(e) => setTo(+e.target.value)} /></div>
        </div>
        {status && <div className="note ok"><span className="spin" /> {status}</div>}
        <AiErr e={err} />
        <div><button className="btn pri" onClick={guide} disabled={busy}>{busy ? <><span className="spin" /> Writing…</> : "Write study guide"}</button></div>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {sorted.length ? sorted.map((n) => (
          <article key={n.id} className="notecard">
            <header>
              <div><div className="lbl">{n.label}</div><div className="hint">{fmtDate(n.created_at)}</div></div>
              <div className="meta">{n.page_from && <button className="btn sm" onClick={() => ctx.goPage(n.page_from!)}>Open p.{n.page_from}</button>}<button className="btn sm danger" onClick={() => del(n.id)}>Delete</button></div>
            </header>
            <div className="md" dangerouslySetInnerHTML={{ __html: md(n.body) }} />
          </article>
        )) : <div className="empty"><h2>No notes yet</h2><p>Write a study guide above, or tap “Save to notes” under any answer from the professor while reading.</p></div>}
      </div>
    </>
  );
}
