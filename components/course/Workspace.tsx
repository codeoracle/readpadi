"use client";
import Link from "next/link";
import { useState } from "react";
import type { Attempt, Course, Exam, Note, Profile, Progress } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { fmtExam } from "@/lib/study";
import { DueChip } from "@/app/(app)/library/LibraryView";
import Reader from "./Reader";
import NotesTab from "./NotesTab";
import TestTab from "./TestTab";
import ResultsTab from "./ResultsTab";
import ShareCourse from "@/components/ShareCourse";

export type Tab = "read" | "notes" | "test" | "results";
export interface Ctx {
  course: Course; profile: Profile | null; exam: Exam | null;
  page: number; setPage: (n: number) => void; goPage: (n: number) => void;
  notes: Note[]; setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  attempts: Attempt[]; setAttempts: React.Dispatch<React.SetStateAction<Attempt[]>>;
  setTab: (t: Tab) => void;
}

export default function Workspace(props: { course: Course; profile: Profile | null; initialExam: Exam | null; initialProgress: Progress | null; initialNotes: Note[]; initialAttempts: Attempt[] }) {
  const { course, profile } = props;
  const [tab, setTab] = useState<Tab>("read");
  const [page, setPage] = useState(props.initialProgress?.last_page || 1);
  const [exam, setExam] = useState<Exam | null>(props.initialExam);
  const [notes, setNotes] = useState(props.initialNotes);
  const [attempts, setAttempts] = useState(props.initialAttempts);
  const [viewAttempt, setViewAttempt] = useState<Attempt | null>(null);
  const goPage = (n: number) => { setPage(n); setTab("read"); window.scrollTo({ top: 0 }); };
  const ctx: Ctx = { course, profile, exam, page, setPage, goPage, notes, setNotes, attempts, setAttempts, setTab };

  return (
    <>
      <div className="page-head" style={{ marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="meta" style={{ marginBottom: 6 }}><Link href="/library" className="link">← Library</Link>{course.status !== "approved" && <span className="chip warn">{course.status === "pending" ? "awaiting review · only you and moderators can see this" : "not approved"}</span>}</div>
          <h1 style={{ fontSize: "clamp(22px,4vw,30px)" }}><span className="mono" style={{ color: "var(--accent)" }}>{course.code}</span> {course.title}</h1>
        </div>
        {course.status === "approved" && <ShareCourse courseId={course.id} code={course.code} title={course.title} refCode={profile?.referral_code} />}
      </div>
      <ExamStrip course={course} exam={exam} setExam={setExam} />
      <div className="tabs" role="tablist">
        {(["read", "notes", "test", "results"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); if (t !== "test") setViewAttempt(null); }}>
            {{ read: "Read", notes: "Notes", test: "Test", results: "Results" }[t]}
            {t === "notes" && notes.length > 0 && <> <span className="chip">{notes.length}</span></>}
          </button>
        ))}
      </div>
      {tab === "read" && <Reader ctx={ctx} initialSeen={props.initialProgress?.seen || ""} />}
      {tab === "notes" && <NotesTab ctx={ctx} />}
      {tab === "test" && <TestTab ctx={ctx} viewAttempt={viewAttempt} clearView={() => setViewAttempt(null)} />}
      {tab === "results" && <ResultsTab ctx={ctx} onView={(a) => { setViewAttempt(a); setTab("test"); }} />}
    </>
  );
}

function ExamStrip({ course, exam, setExam }: { course: Course; exam: Exam | null; setExam: (e: Exam | null) => void }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState<Exam>(exam || { course_id: course.id, exam_date: "", exam_time: "", mode: "cbt", venue: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!f.exam_date) return;
    setBusy(true);
    const { data, error } = await supabaseBrowser().from("exams").upsert({ ...f, course_id: course.id }).select().single();
    setBusy(false);
    if (error) return toast("Could not save: " + error.message);
    setExam(data as Exam); setEdit(false); toast("Exam saved");
  }
  async function remove() {
    await supabaseBrowser().from("exams").delete().eq("course_id", course.id);
    setExam(null); setEdit(false);
  }
  if (edit) return (
    <form className="panel form" onSubmit={save} style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 16 }}>My {course.code} exam</h2>
      <div className="row2">
        <div className="field"><label className="lbl" htmlFor="eDate">Date</label><input id="eDate" type="date" required value={f.exam_date} onChange={(e) => setF({ ...f, exam_date: e.target.value })} /></div>
        <div className="field"><label className="lbl" htmlFor="eTime">Time</label><input id="eTime" type="time" value={f.exam_time} onChange={(e) => setF({ ...f, exam_time: e.target.value })} /></div>
      </div>
      <div className="row2">
        <div className="field"><label className="lbl" htmlFor="eMode">Exam type</label><select id="eMode" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as "cbt" | "pop" })}><option value="cbt">e-Exam (CBT)</option><option value="pop">Written (POP)</option></select></div>
        <div className="field"><label className="lbl" htmlFor="eVenue">Venue</label><input id="eVenue" maxLength={120} value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} placeholder="Lagos study centre, ICT hall" /></div>
      </div>
      <div className="field"><label className="lbl" htmlFor="eNotes">Notes</label><input id="eNotes" maxLength={200} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Bring exam docket and ID card" /></div>
      <div className="meta" style={{ justifyContent: "space-between" }}>
        {exam ? <button type="button" className="btn sm danger" onClick={remove}>Remove exam</button> : <span />}
        <span className="meta"><button type="button" className="btn ghost" onClick={() => setEdit(false)}>Cancel</button><button className="btn pri" disabled={busy}>Save exam</button></span>
      </div>
    </form>
  );
  return (
    <div className="meta" style={{ margin: "0 0 14px", gap: 10 }}>
      {exam ? <><span className="lbl">My exam</span><span>{fmtExam(exam)}</span><DueChip x={exam} /><button className="link" onClick={() => setEdit(true)}>Edit</button></>
        : <span className="hint">No exam date set. <button className="link" onClick={() => setEdit(true)}>Add my exam</button></span>}
    </div>
  );
}
