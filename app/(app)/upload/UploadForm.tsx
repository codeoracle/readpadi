"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { openLocalPdf } from "@/lib/pdf";
import { newId } from "@/lib/study";

const MAX_MB = 50;
type Existing = { id: string; code: string; title: string; school: string; status: string };

export default function UploadForm({ userId, defaultSchool, existing, staff }: { userId: string; defaultSchool: string; existing: Existing[]; staff: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState(""); const [title, setTitle] = useState(""); const [school, setSchool] = useState(defaultSchool);
  const [desc, setDesc] = useState(""); const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle"); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const norm = (s: string) => s.toUpperCase().replace(/\s+/g, "");
  const dupes = code.trim().length >= 4 ? existing.filter((c) => norm(c.code) === norm(code)) : [];
  const schools = [...new Set(["National Open University of Nigeria", ...existing.map((c) => c.school).filter(Boolean)])];

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!code.trim() || !title.trim()) return setErr("Enter the course code and title.");
    if (!file) return setErr("Choose the course material PDF.");
    if (file.type && file.type !== "application/pdf") return setErr("That file is not a PDF.");
    if (file.size > MAX_MB * 1048576) return setErr(`This PDF is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_MB} MB; compress it or split it by module.`);
    setState("busy");
    try {
      setMsg("Checking the PDF…");
      const doc = await openLocalPdf(file);
      const pages = doc.numPages;
      setMsg(`Uploading ${pages} pages…`);
      const path = `${userId}/${newId()}.pdf`;
      const sb = supabaseBrowser();
      const up = await sb.storage.from("materials").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (up.error) throw new Error(up.error.message);
      const ins = await sb.from("courses").insert({ code: code.trim().toUpperCase().replace(/\s+/g, " "), title: title.trim(), school: school.trim(), description: desc.trim(), pages, file_path: path, file_bytes: file.size }).select("id").single();
      if (ins.error) { await sb.storage.from("materials").remove([path]); throw new Error(ins.error.message); }
      setState("done"); setMsg(ins.data.id);
    } catch (e: any) {
      setState("idle"); setErr(e?.name === "InvalidPDFException" ? "That file is not a readable PDF." : e?.message || "The upload failed. Try again.");
    }
  }

  if (state === "done") return (
    <div className="panel form" style={{ maxWidth: 640 }}>
      <b>Thanks, {code.toUpperCase()} is in the review queue.</b>
      <p className="muted" style={{ margin: 0 }}>You can already open it yourself while it waits. Once a moderator approves it, everyone will see it in the library.</p>
      <div className="meta"><button className="btn pri" onClick={() => router.push(`/course/${msg}`)}>Open it now</button><button className="btn" onClick={() => { setState("idle"); setCode(""); setTitle(""); setDesc(""); setFile(null); }}>Add another</button></div>
    </div>
  );

  return (
    <form className="panel form" onSubmit={submit} style={{ maxWidth: 640 }}>
      <div className="row2">
        <div className="field"><label className="lbl" htmlFor="code">Course code</label><input id="code" required maxLength={24} placeholder="LIS 211" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} /></div>
        <div className="field"><label className="lbl" htmlFor="school">School</label><input id="school" list="schools" maxLength={120} value={school} onChange={(e) => setSchool(e.target.value)} /><datalist id="schools">{schools.map((s) => <option key={s} value={s} />)}</datalist></div>
      </div>
      {dupes.length > 0 && <div className="note">{dupes.map((d) => `${d.code} “${d.title}” is already ${d.status === "approved" ? "in the library" : "awaiting review"}`).join(". ")}. Only add this if it is a different or newer edition.</div>}
      <div className="field"><label className="lbl" htmlFor="title">Course title</label><input id="title" required maxLength={160} placeholder="Organisation of Knowledge I" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="field"><label className="lbl" htmlFor="desc">Note for reviewers (optional)</label><input id="desc" maxLength={500} placeholder="e.g. 2023 revised edition, modules 1–4" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
      <div className="field"><span className="lbl">Course material</span>
        <label className={`drop ${file ? "has" : ""}`} htmlFor="file">{file ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB` : `Choose the course PDF (up to ${MAX_MB} MB)`}</label>
        <input id="file" type="file" accept="application/pdf,.pdf" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <span className="hint">Text-based PDFs work best. Scanned PDFs still work, but the professor reads them more slowly.</span>
      </div>
      {err && <div className="note err">{err}</div>}
      {state === "busy" && <div className="note ok"><span className="spin" /> {msg}</div>}
      <div className="meta" style={{ justifyContent: "space-between" }}>
        <span className="hint">{staff ? "As a moderator, approve it from the Admin page after upload." : "Only upload material you are allowed to share with classmates."}</span>
        <button className="btn pri" disabled={state === "busy"}>Submit for review</button>
      </div>
    </form>
  );
}
