"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { openPdf, pageImage, pageText } from "@/lib/pdf";
import { ask, type AiError } from "@/lib/ai";
import { md, newId, profIntro } from "@/lib/study";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import AiErr from "./AiErr";
import type { Ctx } from "./Workspace";

type Msg = { role: "user" | "assistant"; content: string; show?: string; src?: string; page?: number; pending?: boolean; failed?: boolean; err?: unknown; saved?: boolean };
const chats = new Map<string, Msg[]>();

const PROMPTS: Record<string, [string, (n: number) => string]> = {
  explain: ["Explain this page", (n) => `Explain page ${n} to me as you would in a tutorial. Start with a two-sentence plain summary, then go through the main ideas in order, define every technical term, and give one Nigerian example where it helps. Finish with a "Remember for the exam" list of 3–5 points.`],
  exampoints: ["Likely exam points", (n) => `From page ${n}, list what an examiner is most likely to ask: definitions, lists ("state four functions of…"), names and dates, and distinctions between terms. For each, give the exact short answer a student should write. Use a bulleted list.`],
  quickcheck: ["Quiz me on this page", (n) => `Ask me 3 quick questions on page ${n} (mix of recall and understanding), numbered, without answers. I will reply with my answers for you to mark.`],
};

export default function Reader({ ctx, initialSeen }: { ctx: Ctx; initialSeen: string }) {
  const { course, page, setPage, profile, exam } = ctx;
  const [pages, setPages] = useState(course.pages || 0);
  const [zoom, setZoom] = useState(1);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [pgInput, setPgInput] = useState(String(page));
  const cvRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<any>(null);
  const seenRef = useRef(initialSeen);
  const saveT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [chat, setChatState] = useState<Msg[]>(() => chats.get(course.id) || []);
  const setChat = (m: Msg[]) => { chats.set(course.id, m); setChatState([...m]); };
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const draw = useCallback(async () => {
    const cv = cvRef.current, box = boxRef.current; if (!cv || !box) return;
    try {
      setLoading(true);
      const doc = await openPdf(course.id, course.file_path);
      setPages(doc.numPages);
      const n = Math.min(Math.max(1, page), doc.numPages);
      if (n !== page) { setPage(n); return; }
      const pg = await doc.getPage(n);
      const base = pg.getViewport({ scale: 1 });
      const w = Math.max(280, box.clientWidth - 2);
      const dpr = window.devicePixelRatio || 1;
      const vp = pg.getViewport({ scale: (w / base.width) * zoom * dpr });
      try { taskRef.current?.cancel(); } catch {}
      cv.width = vp.width; cv.height = vp.height; cv.style.width = vp.width / dpr + "px"; cv.style.height = vp.height / dpr + "px";
      taskRef.current = pg.render({ canvasContext: cv.getContext("2d")!, viewport: vp });
      await taskRef.current.promise.catch(() => {});
      setLoading(false);
      // reading progress (debounced upsert)
      const s = seenRef.current.padEnd(doc.numPages, "0").split(""); s[n - 1] = "1"; seenRef.current = s.join("");
      clearTimeout(saveT.current);
      saveT.current = setTimeout(() => { supabaseBrowser().from("progress").upsert({ course_id: course.id, seen: seenRef.current, last_page: n, updated_at: new Date().toISOString() }).then(() => {}); }, 1500);
    } catch (e) { setLoading(false); setLoadErr((e as Error).message || "This PDF could not be opened."); }
  }, [course.id, course.file_path, page, zoom]);

  useEffect(() => { draw(); setPgInput(String(page)); }, [draw, page]);
  useEffect(() => { let t: any; const on = () => { clearTimeout(t); t = setTimeout(draw, 200); }; window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, [draw]);
  useEffect(() => { const on = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return; if (e.key === "ArrowRight") setPage(Math.min(pages || page, page + 1)); if (e.key === "ArrowLeft") setPage(Math.max(1, page - 1)); }; window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on); }, [page, pages, setPage]);
  useEffect(() => { if (chatRef.current && window.innerWidth > 900) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [chat]);

  async function profAsk(kind: string, question?: string) {
    if (busy) return;
    const n = page;
    const [show, q] = kind === "ask" ? [question!, question!] : [PROMPTS[kind][0], PROMPTS[kind][1](n)];
    const msgs = [...(chats.get(course.id) || [])];
    msgs.push({ role: "user", content: q, show });
    const reply: Msg = { role: "assistant", content: "", src: `Page ${n} · ${show}`, pending: true, page: n };
    msgs.push(reply); setChat(msgs); setBusy(true);
    try {
      const text = await pageText(course.id, course.file_path, n).catch(() => "");
      let images: Blob[] | undefined;
      let c = `${profIntro(course, profile, exam)}\n\nThe student is reading page ${n} of the course material. Text of the page:\n`;
      if (text.length > 80) {
        const prev = n > 1 ? await pageText(course.id, course.file_path, n - 1).catch(() => "") : "";
        if (prev) c += `[Page ${n - 1}]\n${prev.slice(-2500)}\n`;
        c += `[Page ${n}]\n${text}\n`;
      } else { images = [await pageImage(course.id, course.file_path, n)]; c += "(This page is a scanned image; it is attached.)\n"; }
      c += "\nAnswer in Markdown with short paragraphs and lists. Keep it focused; under 350 words unless the student asks for more.";
      const history = msgs.filter((m) => !m.pending && !m.failed).slice(-9, -1).map((m) => ({ role: m.role, content: m.content }));
      const r = await ask([{ role: "user", content: c + "\n\nUnderstood?" }, { role: "assistant", content: "Yes. I have the page in front of me. What would you like to go through?" }, ...history, { role: "user", content: q }],
        { images, onText: (t) => { reply.content = t; setChat(msgs); } });
      reply.content = r.text;
    } catch (e) { reply.failed = true; reply.err = e; reply.content = ""; }
    reply.pending = false; setChat(msgs); setBusy(false);
  }

  async function saveNote(m: Msg) {
    const { data, error } = await supabaseBrowser().from("notes").insert({ course_id: course.id, label: m.src, body: m.content, page_from: m.page, page_to: m.page }).select().single();
    if (error) return toast("Could not save: " + error.message);
    ctx.setNotes((ns) => [data, ...ns]); m.saved = true; setChat(chats.get(course.id) || []); toast("Saved to notes");
  }

  return (
    <div className="desk">
      <div className="pagebox">
        <div className="pagetools">
          <button className="btn sm" onClick={() => setPage(Math.max(1, page - 1))} aria-label="Previous page">‹ Prev</button>
          <span className="pg"><input inputMode="numeric" value={pgInput} aria-label="Page number" onChange={(e) => setPgInput(e.target.value)} onBlur={() => setPage(Math.min(Math.max(1, +pgInput || 1), pages || 1))} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} /> / {pages || "…"}</span>
          <button className="btn sm" onClick={() => setPage(Math.min(pages || page + 1, page + 1))} aria-label="Next page">Next ›</button>
          <span style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out">−</button>
          <button className="btn sm" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Zoom in">+</button>
        </div>
        <div className="canvasbox" ref={boxRef}>
          {loadErr ? <div className="note err" style={{ margin: 16 }}>{loadErr}</div> : <><canvas ref={cvRef} />{loading && <div className="loading"><span><span className="spin" /> Loading page…</span></div>}</>}
        </div>
      </div>
      <aside className="prof"><div className="panel">
        <div className="prof-head"><div className="seal">PROF</div><div><b>Your professor</b><div className="hint">On page {page} of {course.code}</div></div></div>
        <div className="acts">
          {Object.entries(PROMPTS).map(([k, [label]]) => <button key={k} className="btn sm" disabled={busy} onClick={() => profAsk(k)}>{label}</button>)}
        </div>
        <div className="chat" ref={chatRef}>
          {chat.length === 0 ? <p className="muted" style={{ margin: 0, fontFamily: "var(--f-read)" }}>Ask about anything on this page, or use a shortcut. The professor answers from your course material and points out what is likely to come out in the exam.</p>
            : chat.map((m, i) => m.role === "user" ? <div key={i} className="msg me">{m.show || m.content}</div> : (
              <div key={i} className="msg pf">
                <div className="src">{m.src}</div>
                {m.failed ? <AiErr e={m.err} /> : m.pending && !m.content ? <span className="hint"><span className="spin" /> Thinking…</span> : <div className="md" dangerouslySetInnerHTML={{ __html: md(m.content) }} />}
                {!m.pending && !m.failed && <button className="link" disabled={m.saved} onClick={() => saveNote(m)}>{m.saved ? "Saved" : "Save to notes"}</button>}
              </div>
            ))}
        </div>
        <form className="ask" onSubmit={(e) => { e.preventDefault(); const v = q.trim(); if (v) { setQ(""); profAsk("ask", v); } }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this page…" disabled={busy} aria-label="Ask the professor" />
          <button className="btn pri" disabled={busy}>Ask</button>
        </form>
        {chat.length > 0 && <button className="link" style={{ alignSelf: "flex-start" }} onClick={() => setChat([])}>Clear conversation</button>}
      </div></aside>
    </div>
  );
}
