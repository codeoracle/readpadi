"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { LEVELS_LADDER, levelInfo } from "@/lib/levels";
import LevelCard, { useMyLevel } from "@/components/LevelCard";

type Row = { rank: number; display_name: string; school: string; week_xp: number; level: number; is_me: boolean };

export default function RanksView() {
  const [schoolOnly, setSchoolOnly] = useState(true);
  const [rows, setRows] = useState<Row[] | null>(null);
  const me = useMyLevel();
  useEffect(() => { setRows(null); supabaseBrowser().rpc("leaderboard", { p_school_only: schoolOnly }).then(({ data }: { data: Row[] | null }) => setRows(data ?? [])); }, [schoolOnly]);
  return (
    <>
      <div className="page-head"><div><h1>Ranks</h1><p>XP comes from real study: 1 XP per new page read (up to 100 a day) and 10 XP per mark in practice exams, plus 20 for every pass.</p></div></div>
      <LevelCard />
      <div className="section-t" style={{ marginTop: 0 }}><h2>This week</h2>
        <div className="seg"><button aria-pressed={schoolOnly} onClick={() => setSchoolOnly(true)}>My school</button><button aria-pressed={!schoolOnly} onClick={() => setSchoolOnly(false)}>Everyone</button></div></div>
      <div className="panel scroll-x" style={{ padding: 0 }}>
        {rows === null ? <p className="hint" style={{ padding: 16 }}><span className="spin" /> Loading…</p> : rows.length === 0 ? <p className="hint" style={{ padding: 16 }}>Nobody has earned XP this week yet. Read a few pages or sit a test to take first place.</p> : (
          <table className="tbl"><thead><tr><th>#</th><th>Student</th><th>Level</th><th style={{ textAlign: "right" }}>XP this week</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.rank + r.display_name} style={r.is_me ? { background: "var(--tint)" } : undefined}>
                <td className="mono">{r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}</td>
                <td><b>{r.display_name}{r.is_me ? " (you)" : ""}</b>{!schoolOnly && r.school && <div className="hint">{r.school}</div>}</td>
                <td><span className="chip acc">{LEVELS_LADDER[r.level - 1]?.name}</span></td>
                <td className="mono" style={{ textAlign: "right" }}>{r.week_xp.toLocaleString()}</td>
              </tr>))}</tbody></table>
        )}
      </div>
      {me && !me.show_on_board && <p className="hint" style={{ marginTop: 10 }}>You are hidden from other students’ boards. Change this in your profile.</p>}
      <div className="section-t"><h2>The ladder</h2></div>
      <div className="hist">{LEVELS_LADDER.map((l) => {
        const reached = me ? levelInfo(me.xp).n >= l.n : false;
        return <div key={l.n} className="hrow" style={{ gridTemplateColumns: "auto minmax(0,1fr) auto", opacity: reached ? 1 : 0.65 }}><span className="chip acc">L{l.n}</span><b>{l.name}</b><span className="mono hint">{l.min.toLocaleString()} XP</span></div>;
      })}</div>
    </>
  );
}
