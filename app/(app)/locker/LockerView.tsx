"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { askJson, aiMessage } from "@/lib/ai";
import { openLocalPdf } from "@/lib/pdf";
import { fmtDate, levelLabel, naira, newId } from "@/lib/study";
import { useToast } from "@/components/Toast";
import type { LockerItem } from "@/lib/types";

const CATS: Record<string, string> = { receipt: "Receipt", course_form: "Course form", result: "Result", admission: "Admission", id_card: "ID card", timetable: "Timetable", material: "Material", other: "Other" };
const SEMS = ["First semester", "Second semester", "Summer", ""];
function currentSession() { const d = new Date(); const y = d.getFullYear(); return d.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`; }
const sessions = () => { const [a] = currentSession().split("/").map(Number); return Array.from({ length: 7 }, (_, i) => `${a - i}/${a - i + 1}`); };

async function toImage(file: File): Promise<Blob> {
  if (file.type.startsWith("image/") && file.type !== "image/heic") {
    const bmp = await createImageBitmap(file); const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas"); cv.width = bmp.width * s; cv.height = bmp.height * s; cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
    return new Promise((r) => cv.toBlob((b) => r(b!), "image/jpeg", 0.85));
  }
  if (file.type === "application/pdf") {
    const doc = await openLocalPdf(file); const pg = await doc.getPage(1); const v = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: Math.min(2, 1400 / v.width) });
    const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height; await pg.render({ canvasContext: cv.getContext("2d")!, viewport: vp }).promise;
    return new Promise((r) => cv.toBlob((b) => r(b!), "image/jpeg", 0.85));
  }
  throw new Error("The AI can read photos (JPG, PNG) and PDFs.");
}

export default function LockerView({ userId, initial, level, pro, freeMax }: { userId: string; initial: LockerItem[]; level: string; pro: boolean; freeMax: number }) {
  const [items, setItems] = useState(initial);
  const [year, setYear] = useState<string>("all");
  const [cat, setCat] = useState<string>("all");
  const [adding, setAdding] = useState(initial.length === 0);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const toast = useToast(); const sb = supabaseBrowser();

  const years = useMemo(() => [...new Set(items.map((i) => i.academic_year || "No session"))].sort().reverse(), [items]);
  const shown = items.filter((i) => (year === "all" || (i.academic_year || "No session") === year) && (cat === "all" || i.category === cat));
  const paid = (list: LockerItem[]) => list.filter((i) => i.category === "receipt").reduce((s, i) => s + Number(i.amount_ngn || 0), 0);
  const grouped = useMemo(() => {
    const g: Record<string, Record<string, LockerItem[]>> = {};
    for (const i of shown) { const y = i.academic_year || "No session"; const s = i.semester || "General"; ((g[y] ||= {})[s] ||= []).push(i); }
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
  }, [shown]);

  async function open(i: LockerItem) {
    const { data, error } = await sb.storage.from("locker").createSignedUrl(i.file_path, 300);
    if (error || !data) return toast("Could not open the file.");
    window.open(data.signedUrl, "_blank", "noopener");
  }
  async function del(i: LockerItem) {
    const { error } = await sb.from("locker_items").delete().eq("id", i.id);
    if (error) return toast(error.message);
    await sb.storage.from("locker").remove([i.file_path]);
    setItems(items.filter((x) => x.id !== i.id)); setConfirmDel(null); toast("Deleted");
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Locker</h1><p>Every school document in one private place, sorted by session and semester: fees receipts, course forms, results, admission letter, ID card.</p></div>
        {!adding && <button className="btn pri" onClick={() => setAdding(true)}>Add document</button>}
      </div>
      <div className="stats">
        <div className="stat"><span className="lbl">Documents</span><b>{items.length}{!pro && <span className="hint" style={{ fontSize: 13 }}> / {freeMax}</span>}</b></div>
        <div className="stat"><span className="lbl">Paid {year === "all" ? "(all sessions)" : year}</span><b>{naira(paid(year === "all" ? items : items.filter((i) => (i.academic_year || "No session") === year)))}</b></div>
        <div className="stat"><span className="lbl">Sessions</span><b>{years.filter((y) => y !== "No session").length}</b></div>
      </div>
      {!pro && items.length >= freeMax - 3 && <div className="note" style={{ marginBottom: 14 }}>{items.length >= freeMax ? "Your free Locker is full." : `You can add ${freeMax - items.length} more document${freeMax - items.length === 1 ? "" : "s"} on the free plan.`} <Link className="link" href="/upgrade">Get a pass</Link> for unlimited storage.</div>}
      {adding && <AddForm userId={userId} level={level} onCancel={() => setAdding(false)} onAdded={(i) => { setItems([i, ...items]); setAdding(false); toast("Saved to your Locker"); }} />}

      {items.length > 0 && (
        <div className="search" style={{ alignItems: "center" }}>
          <select className="input" style={{ width: "auto" }} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Session"><option value="all">All sessions</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
          <div className="seg"><button aria-pressed={cat === "all"} onClick={() => setCat("all")}>All</button>{Object.entries(CATS).filter(([k]) => items.some((i) => i.category === k)).map(([k, l]) => <button key={k} aria-pressed={cat === k} onClick={() => setCat(k)}>{l}</button>)}</div>
        </div>
      )}
      {items.length === 0 && !adding && <div className="empty"><h2>Your Locker is empty</h2><p>Start with this session’s school fees receipt and course registration form. You will always know where they are when the school asks.</p><button className="btn pri" onClick={() => setAdding(true)}>Add first document</button></div>}

      {grouped.map(([y, sems]) => (
        <section key={y}>
          <div className="section-t"><h2>{y}</h2><span className="hint">{Object.values(sems).flat().length} documents{paid(Object.values(sems).flat()) ? ` · ${naira(paid(Object.values(sems).flat()))} paid` : ""}</span></div>
          {Object.entries(sems).map(([s, list]) => (
            <div key={s} style={{ marginBottom: 12 }}>
              <div className="lbl" style={{ margin: "4px 0 6px" }}>{s}</div>
              <div className="hist">{list.map((i) => (
                <div key={i.id} className="hrow" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                  <button onClick={() => open(i)} style={{ all: "unset", cursor: "pointer", minWidth: 0 }}>
                    <b>{i.title}</b>
                    <div className="meta" style={{ marginTop: 4 }}><span className="chip acc">{CATS[i.category]}</span>{i.amount_ngn != null && <span className="chip good">{naira(Number(i.amount_ngn))}</span>}{i.level && <span className="chip">{levelLabel(i.level)}</span>}<span className="hint">{i.doc_date ? fmtDate(i.doc_date) : fmtDate(i.created_at)}</span>{i.notes && <span className="hint">· {i.notes}</span>}</div>
                  </button>
                  <span className="meta">
                    <button className="btn sm" onClick={() => open(i)}>Open</button>
                    {confirmDel === i.id ? <><button className="btn sm danger" onClick={() => del(i)}>Delete</button><button className="btn sm ghost" onClick={() => setConfirmDel(null)}>Keep</button></> : <button className="btn sm ghost danger" onClick={() => setConfirmDel(i.id)} aria-label="Delete">✕</button>}
                  </span>
                </div>
              ))}</div>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

function AddForm({ userId, level, onCancel, onAdded }: { userId: string; level: string; onCancel: () => void; onAdded: (i: LockerItem) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState({ title: "", category: "receipt", academic_year: currentSession(), semester: "First semester", level, amount_ngn: "", doc_date: "", notes: "" });
  const [busy, setBusy] = useState<"" | "ai" | "save">(""); const [err, setErr] = useState<React.ReactNode>("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function readWithAi() {
    if (!file) return;
    setBusy("ai"); setErr("");
    try {
      const img = await toImage(file);
      const r = await askJson(`This is a document a Nigerian university student is filing (often a school fees or portal payment receipt, a course registration form, a result slip, an admission letter, or an ID card). Read it and reply with only a JSON object:
{"title": short descriptive title, e.g. "School fees receipt" or "Course registration form", "category": one of ${Object.keys(CATS).join(", ")}, "amount_ngn": total amount paid in naira as a number or null, "doc_date": "YYYY-MM-DD" or null, "academic_year": session like "2025/2026" or null, "semester": "First semester" | "Second semester" | null, "level": e.g. "200" or null, "notes": reference or transaction number if shown, else ""}`, { images: [img], maxTokens: 600 });
      setF((cur) => ({
        ...cur,
        title: r.title || cur.title, category: CATS[r.category] ? r.category : cur.category,
        amount_ngn: r.amount_ngn != null ? String(r.amount_ngn) : cur.amount_ngn, doc_date: r.doc_date || cur.doc_date,
        academic_year: r.academic_year || cur.academic_year, semester: r.semester || cur.semester, level: r.level ? String(r.level).replace(/\D/g, "") || cur.level : cur.level,
        notes: r.notes ? String(r.notes).slice(0, 200) : cur.notes,
      }));
    } catch (e) { setErr(<>{aiMessage(e)}{(e as any)?.code === "limit" && <> <Link className="link" href="/upgrade">Get a pass</Link></>}</>); }
    setBusy("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!file) return setErr("Choose a file or take a photo.");
    if (file.size > 20 * 1048576) return setErr("That file is over 20 MB.");
    if (!f.title.trim()) return setErr("Give the document a title.");
    setBusy("save");
    const sb = supabaseBrowser();
    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${userId}/${newId()}.${ext}`;
    const up = await sb.storage.from("locker").upload(path, file, { contentType: file.type || undefined });
    if (up.error) { setBusy(""); return setErr(up.error.message.includes("mime") ? "That file type is not supported. Use PDF, JPG, PNG or Word." : up.error.message); }
    const { data, error } = await sb.from("locker_items").insert({
      title: f.title.trim(), category: f.category, academic_year: f.academic_year, semester: f.semester, level: f.level,
      amount_ngn: f.amount_ngn === "" ? null : Number(f.amount_ngn.replace(/[^\d.]/g, "")), doc_date: f.doc_date || null, notes: f.notes.trim(),
      file_path: path, file_bytes: file.size, mime: file.type,
    }).select().single();
    setBusy("");
    if (error) {
      await sb.storage.from("locker").remove([path]);
      return setErr(error.message.includes("locker_full") ? <>Your free Locker is full. <Link className="link" href="/upgrade">Get a pass</Link> for unlimited storage.</> : error.message);
    }
    onAdded(data as LockerItem);
  }

  return (
    <form className="panel form" onSubmit={save} style={{ marginBottom: 18, maxWidth: 720 }}>
      <h2 style={{ fontSize: 18 }}>Add a document</h2>
      <div className="field">
        <label className={`drop ${file ? "has" : ""}`} htmlFor="lfile">{file ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB` : "Choose a file or take a photo (PDF, JPG, PNG, Word · up to 20 MB)"}</label>
        <input id="lfile" type="file" accept="application/pdf,image/*,.docx" capture="environment" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </div>
      {file && (file.type.startsWith("image/") || file.type === "application/pdf") && (
        <div className="meta"><button type="button" className="btn sm" onClick={readWithAi} disabled={!!busy}>{busy === "ai" ? <><span className="spin" /> Reading…</> : "Fill in with AI"}</button><span className="hint">Reads the amount, date and session from a receipt or form. Uses 1 AI action.</span></div>
      )}
      <div className="row2">
        <div className="field"><label className="lbl" htmlFor="lt">Title</label><input id="lt" maxLength={160} value={f.title} onChange={set("title")} placeholder="School fees receipt" /></div>
        <div className="field"><label className="lbl" htmlFor="lc">Type</label><select id="lc" value={f.category} onChange={set("category")}>{Object.entries(CATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      </div>
      <div className="row2">
        <div className="field"><label className="lbl" htmlFor="ly">Session</label><select id="ly" value={f.academic_year} onChange={set("academic_year")}>{[...new Set([f.academic_year, ...sessions()])].map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="field"><label className="lbl" htmlFor="ls">Semester</label><select id="ls" value={f.semester} onChange={set("semester")}>{[...new Set([f.semester, ...SEMS])].map((s) => <option key={s} value={s}>{s || "Not semester-specific"}</option>)}</select></div>
      </div>
      <div className="row2">
        <div className="field"><label className="lbl" htmlFor="la">Amount paid (₦){f.category !== "receipt" && " · optional"}</label><input id="la" inputMode="decimal" value={f.amount_ngn} onChange={set("amount_ngn")} placeholder="e.g. 45000" /></div>
        <div className="field"><label className="lbl" htmlFor="ld">Date on document</label><input id="ld" type="date" value={f.doc_date} onChange={set("doc_date")} /></div>
      </div>
      <div className="field"><label className="lbl" htmlFor="ln">Notes</label><input id="ln" maxLength={500} value={f.notes} onChange={set("notes")} placeholder="Payment reference, RRR, or anything to remember" /></div>
      {err && <div className="note err">{err}</div>}
      <div className="meta" style={{ justifyContent: "flex-end" }}><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button><button className="btn pri" disabled={!!busy}>{busy === "save" ? <><span className="spin" /> Saving…</> : "Save to Locker"}</button></div>
    </form>
  );
}
