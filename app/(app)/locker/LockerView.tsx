"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fmtDate, levelLabel, naira, newId } from "@/lib/study";
import { useToast } from "@/components/Toast";
import type { LockerItem } from "@/lib/types";

const CATS: Record<string, string> = { receipt: "Receipt", course_form: "Course form", result: "Result", admission: "Admission", id_card: "ID card", timetable: "Timetable", material: "Material", other: "Other" };
const SEMS = ["First semester", "Second semester", "Summer", ""];
function currentSession() { const d = new Date(); const y = d.getFullYear(); return d.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`; }
const sessions = () => { const [a] = currentSession().split("/").map(Number); return Array.from({ length: 7 }, (_, i) => `${a - i}/${a - i + 1}`); };

export default function LockerView({ userId, initial, level, pro, freeMax }: { userId: string; initial: LockerItem[]; level: string; pro: boolean; freeMax: number }) {
  const [items, setItems] = useState(initial);
  const [year, setYear] = useState<string>("all");
  const [cat, setCat] = useState<string>("all");
  const [adding, setAdding] = useState(initial.length === 0);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
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
      {adding && <DocForm userId={userId} level={level} onCancel={() => setAdding(false)} onSaved={(i) => { setItems([i, ...items]); setAdding(false); toast("Saved to your Locker"); }} />}

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
              <div className="hist">{list.map((i) => editing === i.id ? (
                <DocForm key={i.id} userId={userId} level={level} item={i} onCancel={() => setEditing(null)}
                  onSaved={(u) => { setItems(items.map((x) => (x.id === u.id ? u : x))); setEditing(null); toast("Document updated"); }} />
              ) : (
                <div key={i.id} className="hrow" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                  <button onClick={() => open(i)} style={{ all: "unset", cursor: "pointer", minWidth: 0 }}>
                    <b>{i.title}</b>
                    <div className="meta" style={{ marginTop: 4 }}><span className="chip acc">{CATS[i.category]}</span>{i.amount_ngn != null && <span className="chip good">{naira(Number(i.amount_ngn))}</span>}{i.level && <span className="chip">{levelLabel(i.level)}</span>}<span className="hint">{i.doc_date ? fmtDate(i.doc_date) : fmtDate(i.created_at)}</span>{i.notes && <span className="hint">· {i.notes}</span>}</div>
                  </button>
                  <span className="meta">
                    <button className="btn sm" onClick={() => open(i)}>Open</button>
                    <button className="btn sm" onClick={() => { setEditing(i.id); setConfirmDel(null); }}>Edit</button>
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

function DocForm({ userId, level, item, onCancel, onSaved }: { userId: string; level: string; item?: LockerItem; onCancel: () => void; onSaved: (i: LockerItem) => void }) {
  const editing = !!item;
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState({
    title: item?.title ?? "", category: item?.category ?? "receipt", academic_year: item?.academic_year || currentSession(),
    semester: item?.semester ?? "First semester", level: item?.level ?? level,
    amount_ngn: item?.amount_ngn != null ? String(item.amount_ngn) : "", doc_date: item?.doc_date ?? "", notes: item?.notes ?? "",
  });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<React.ReactNode>("");
  const pid = editing ? `e${item!.id.slice(0, 6)}-` : "";
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!editing && !file) return setErr("Choose a file or photo.");
    if (file && file.size > 20 * 1048576) return setErr("That file is over 20 MB.");
    if (!f.title.trim()) return setErr("Give the document a title.");
    const amount = f.amount_ngn.trim() === "" ? null : Number(f.amount_ngn.replace(/[^\d.]/g, ""));
    if (amount != null && !Number.isFinite(amount)) return setErr("Enter the amount as a number, e.g. 45000.");
    setBusy(true);
    const sb = supabaseBrowser();
    let upload: { file_path: string; file_bytes: number; mime: string } | null = null;
    if (file) {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${userId}/${newId()}.${ext}`;
      const up = await sb.storage.from("locker").upload(path, file, { contentType: file.type || undefined });
      if (up.error) { setBusy(false); return setErr(/mime|type/i.test(up.error.message) ? "That file type is not supported. Use PDF, JPG, PNG or Word." : up.error.message); }
      upload = { file_path: path, file_bytes: file.size, mime: file.type };
    }
    const fields = {
      title: f.title.trim(), category: f.category, academic_year: f.academic_year, semester: f.semester, level: f.level,
      amount_ngn: amount, doc_date: f.doc_date || null, notes: f.notes.trim(), ...(upload || {}),
    };
    const q = editing ? sb.from("locker_items").update(fields).eq("id", item!.id) : sb.from("locker_items").insert(fields);
    const { data, error } = await q.select().single();
    setBusy(false);
    if (error) {
      if (upload) await sb.storage.from("locker").remove([upload.file_path]);
      return setErr(error.message.includes("locker_full") ? <>Your free Locker is full. <Link className="link" href="/upgrade">Get a pass</Link> for unlimited storage.</> : error.message);
    }
    if (editing && upload && item!.file_path !== upload.file_path) await sb.storage.from("locker").remove([item!.file_path]);
    onSaved(data as LockerItem);
  }

  return (
    <form className="panel form" onSubmit={save} style={{ marginBottom: editing ? 0 : 18, maxWidth: 720, borderColor: editing ? "var(--accent)" : undefined }}>
      <h2 style={{ fontSize: 18 }}>{editing ? "Edit document" : "Add a document"}</h2>
      <div className="field">
        <label className={`drop ${file ? "has" : ""}`} htmlFor={editing ? `lfile-${item!.id}` : "lfile"}>
          {file ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB` : editing ? "Keep the current file, or tap to replace it" : "Choose a file or photo (PDF, JPG, PNG, Word · up to 20 MB)"}
        </label>
        <input id={editing ? `lfile-${item!.id}` : "lfile"} type="file" accept="application/pdf,image/*,.docx" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </div>
      <div className="row2">
        <div className="field"><label className="lbl" htmlFor={pid + "lt"}>Title</label><input id={pid + "lt"} maxLength={160} value={f.title} onChange={set("title")} placeholder="School fees receipt" /></div>
        <div className="field"><label className="lbl" htmlFor={pid + "lc"}>Type</label><select id={pid + "lc"} value={f.category} onChange={set("category")}>{Object.entries(CATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      </div>
      <div className="row2">
        <div className="field"><label className="lbl" htmlFor={pid + "ly"}>Session</label><select id={pid + "ly"} value={f.academic_year} onChange={set("academic_year")}>{[...new Set([f.academic_year, ...sessions()])].map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="field"><label className="lbl" htmlFor={pid + "ls"}>Semester</label><select id={pid + "ls"} value={f.semester} onChange={set("semester")}>{[...new Set([f.semester, ...SEMS])].map((s) => <option key={s} value={s}>{s || "Not semester-specific"}</option>)}</select></div>
      </div>
      <div className="row2">
        <div className="field"><label className="lbl" htmlFor={pid + "la"}>Amount paid (₦){f.category !== "receipt" && " · optional"}</label><input id={pid + "la"} inputMode="decimal" value={f.amount_ngn} onChange={set("amount_ngn")} placeholder="e.g. 45000" /></div>
        <div className="field"><label className="lbl" htmlFor={pid + "ld"}>Date on document</label><input id={pid + "ld"} type="date" value={f.doc_date} onChange={set("doc_date")} /></div>
      </div>
      <div className="row2">
        <div className="field"><label className="lbl" htmlFor={pid + "ll"}>Level</label><input id={pid + "ll"} maxLength={30} value={f.level} onChange={set("level")} placeholder="200" /></div>
        <div className="field"><label className="lbl" htmlFor={pid + "ln"}>Notes</label><input id={pid + "ln"} maxLength={500} value={f.notes} onChange={set("notes")} placeholder="Payment reference, RRR, or anything to remember" /></div>
      </div>
      {err && <div className="note err">{err}</div>}
      <div className="meta" style={{ justifyContent: "flex-end" }}><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button><button className="btn pri" disabled={busy}>{busy ? <><span className="spin" /> Saving…</> : editing ? "Save changes" : "Save to Locker"}</button></div>
    </form>
  );
}
