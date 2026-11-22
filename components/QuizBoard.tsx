"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/study";

type Row = { code: string; title: string; description: string; n: number; time_limit_secs: number; creator: string; course_code: string | null; takers: number; created_at: string; mine_score: number | null };

export default function QuizBoard({ courseId, emptyText }: { courseId?: string; emptyText: React.ReactNode }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => { supabaseBrowser().rpc("public_quizzes", { p_course: courseId ?? null, p_limit: 30 }).then(({ data }: { data: Row[] | null }) => setRows(data ?? [])); }, [courseId]);
  if (rows === null) return <p className="hint"><span className="spin" /> Loading quizzes…</p>;
  if (!rows.length) return <div className="empty"><p style={{ marginBottom: 0 }}>{emptyText}</p></div>;
  return (
    <div className="hist">{rows.map((r) => (
      <Link key={r.code} href={`/q/${r.code}`} className="hrow">
        <span style={{ minWidth: 0 }}>
          {!courseId && r.course_code && <span className="chip acc">{r.course_code}</span>} <b>{r.title}</b>
          <div className="hint">{r.n} questions · {r.time_limit_secs ? `${Math.round(r.time_limit_secs / 60)} min` : "untimed"} · by {r.creator} · {fmtDate(r.created_at)}{r.description ? ` · ${r.description}` : ""}</div>
        </span>
        <span className="chip">{r.takers} played</span>
        {r.mine_score != null ? <span className="chip good">you: {r.mine_score}/{r.n}</span> : <span className="btn sm pri">Play</span>}
      </Link>
    ))}</div>
  );
}
