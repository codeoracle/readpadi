"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import LevelCard from "@/components/LevelCard";
import { daysTo, fmtDate, fmtExam, grade, gradeTone, levelLabel, splitCode } from "@/lib/study";
import type { ClassStat, Course, Exam, Profile, Progress } from "@/lib/types";

type Props = {
  courses: Course[]; myPending: Pick<Course, "id" | "code" | "title" | "status" | "reject_reason" | "created_at">[];
  exams: Exam[]; progress: Progress[]; attempts: { course_id: string; pct: number; created_at: string }[];
  stats: ClassStat[]; profile: Profile | null;
};

export function DueChip({ x }: { x?: Exam | null }) {
  const d = daysTo(x?.exam_date);
  if (d == null) return null;
  if (d < 0) return <span className="chip">exam passed</span>;
  return <span className={`chip ${d <= 7 ? "bad" : d <= 21 ? "warn" : ""}`}>exam {d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`}</span>;
}

export default function LibraryView({ courses, myPending, exams, progress, attempts, stats, profile }: Props) {
  const [q, setQ] = useState("");
  const mySchool = profile?.school?.trim().toLowerCase() || "";
  const schools = useMemo(() => [...new Set(courses.map((c) => c.school.trim()).filter(Boolean))].sort(), [courses]);
  const [school, setSchool] = useState<string>(mySchool && schools.some((s) => s.toLowerCase() === mySchool) ? profile!.school.trim() : "all");
  const [onlyMine, setOnlyMine] = useState(false);

  const examBy = Object.fromEntries(exams.map((e) => [e.course_id, e]));
  const progBy = Object.fromEntries(progress.map((p) => [p.course_id, p]));
  const statBy = Object.fromEntries(stats.map((s) => [s.course_id, s]));
  const attBy: Record<string, { n: number; best: number }> = {};
  for (const a of attempts) { const r = (attBy[a.course_id] ||= { n: 0, best: 0 }); r.n++; r.best = Math.max(r.best, a.pct); }

  const needle = q.trim().toLowerCase().replace(/\s+/g, "");
  const shown = courses.filter((c) => {
    if (school !== "all" && c.school.trim() !== school) return false;
    if (onlyMine && !attBy[c.id] && !examBy[c.id] && !progBy[c.id]) return false;
    if (!needle) return true;
    return (c.code + c.title + c.school).toLowerCase().replace(/\s+/g, "").includes(needle);
  });

  const timetable = exams.filter((x) => (daysTo(x.exam_date) ?? -1) >= 0).sort((a, b) => (a.exam_date + a.exam_time).localeCompare(b.exam_date + b.exam_time));
  const courseBy = Object.fromEntries(courses.map((c) => [c.id, c]));
  const p = profile;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{p?.name ? `Welcome, ${p.name.split(" ")[0]}` : "The library"}</h1>
          <p>Every course material shared by students. Open one to read with the professor, make notes, and sit practice exams.</p>
        </div>
        <Link href="/upload" className="btn pri">Add course material</Link>
      </div>

      <LevelCard />
      {!p?.school && (
        <div className="panel" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}><b>Add your school and level</b><div className="hint">The professor tailors explanations to your programme, and the library shows your school first.</div></div>
          <Link className="btn sm pri" href="/profile">Add my details</Link>
        </div>
      )}
      {p?.school && (
        <div className="hint" style={{ marginBottom: 14 }}>{[p.school, p.programme, p.level && levelLabel(p.level), p.centre && p.centre + " study centre"].filter(Boolean).join(" · ")} · <Link href="/profile" className="link">Edit</Link></div>
      )}

      {myPending.length > 0 && (
        <div className="panel" style={{ marginBottom: 16, display: "grid", gap: 8 }}>
          <div className="lbl">Your uploads</div>
          {myPending.map((c) => (
            <div key={c.id} className="meta" style={{ justifyContent: "space-between" }}>
              <span><span className="chip acc">{c.code}</span> {c.title}</span>
              {c.status === "pending" ? <span className="chip warn">awaiting review</span> : <span className="chip bad" title={c.reject_reason}>not approved{c.reject_reason ? `: ${c.reject_reason}` : ""}</span>}
            </div>
          ))}
        </div>
      )}

      {timetable.length > 0 && (
        <>
          <div className="section-t" style={{ marginTop: 0 }}><h2>My exam timetable</h2><span className="hint">{timetable.length} upcoming</span></div>
          <div className="hist" style={{ marginBottom: 24 }}>
            {timetable.map((x) => courseBy[x.course_id] && (
              <Link key={x.course_id} href={`/course/${x.course_id}`} className="hrow">
                <span style={{ minWidth: 0 }}><span className="chip acc">{courseBy[x.course_id].code}</span> <b>{fmtExam(x)}</b>{x.notes && <span className="hint"> · {x.notes}</span>}</span>
                <DueChip x={x} /><span />
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="section-t" style={{ marginTop: 0 }}><h2>Courses</h2><span className="hint">{shown.length} of {courses.length}</span></div>
      <div className="search">
        <input className="input" type="search" placeholder="Search by code or title, e.g. LIS 211" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search courses" />
        {schools.length > 1 && (
          <select className="input" style={{ width: "auto", maxWidth: "100%" }} value={school} onChange={(e) => setSchool(e.target.value)} aria-label="School">
            <option value="all">All schools</option>
            {schools.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <div className="seg"><button aria-pressed={!onlyMine} onClick={() => setOnlyMine(false)}>All</button><button aria-pressed={onlyMine} onClick={() => setOnlyMine(true)}>Studying</button></div>
      </div>

      {courses.length === 0 ? (
        <div className="empty"><h2>The shelf is empty</h2><p>Be the first to add a course material. Once it is approved, everyone can read it and sit practice exams on it.</p><Link className="btn pri" href="/upload">Add the first course</Link></div>
      ) : shown.length === 0 ? (
        <div className="empty"><p>No course matches “{q}”{school !== "all" ? ` in ${school}` : ""}. <Link className="link" href="/upload">Add it</Link> if you have the material.</p></div>
      ) : (
        <div className="shelf">
          {shown.map((c) => {
            const [a, b] = splitCode(c.code);
            const att = attBy[c.id]; const st = statBy[c.id];
            const seen = (progBy[c.id]?.seen || "").split("").filter((x) => x === "1").length;
            const readPct = c.pages ? Math.min(100, Math.round((seen / c.pages) * 100)) : 0;
            return (
              <Link key={c.id} href={`/course/${c.id}`} className="spine">
                <div className="callno"><span className="a">{a}</span><span className="b">{b}</span><span className="c">{c.pages || "?"} pp.</span></div>
                <div className="body">
                  <div className="ttl">{c.title}</div>
                  <div className="meta">
                    {att ? <span className={`chip ${gradeTone(att.best)}`}>best {att.best}% · {grade(att.best)}</span> : <span className="chip">no test yet</span>}
                    <DueChip x={examBy[c.id]} />
                    {st && <span className="chip acc">class avg {st.avg_best}% · {st.students}</span>}
                  </div>
                  {c.school && <div className="hint">{c.school}</div>}
                  <div><div className="lbl" style={{ marginBottom: 4 }}>Read {readPct}%</div><div className="bar"><i style={{ width: `${readPct}%` }} /></div></div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <p className="hint" style={{ marginTop: 24 }}>Added {courses.length ? fmtDate(courses.reduce((m, c) => (c.created_at > m ? c.created_at : m), courses[0].created_at)) : "—"} most recently.</p>
    </>
  );
}
