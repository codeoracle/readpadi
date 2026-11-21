"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { BRAND } from "@/lib/brand";
import SharePanel from "./SharePanel";
import type { Attempt } from "@/lib/types";

export default function CreateChallenge({ attempt, courseId, courseCode, refCode }: { attempt: Attempt; courseId: string; courseCode: string; refCode?: string }) {
  const items = attempt.items.filter((r) => r.type === "mcq" || r.type === "fib");
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [timed, setTimed] = useState(true);
  if (items.length < 3) return null;
  async function create() {
    setBusy(true); setErr("");
    const payload = items.map(({ type, q, options, answer, accept, explanation, topic, page }) => ({ type, q, options, answer, accept, explanation, topic, page }));
    const { data, error } = await supabaseBrowser().rpc("create_challenge", { p_title: `${courseCode} quiz`, p_course: courseId, p_items: payload, p_time_limit: timed ? Math.max(120, items.length * 45) : 0 });
    setBusy(false);
    if (error) return setErr(error.message);
    setCode(data as string);
  }
  if (code) {
    const url = `${window.location.origin}/q/${code}${refCode ? `?ref=${refCode}` : ""}`;
    return <SharePanel url={url} title="Your quiz is ready. Send it to your class." text={`I scored ${attempt.pct}% on this ${courseCode} quiz on ${BRAND.name}. Can you beat me? ${items.length} questions:`} />;
  }
  return (
    <div className="panel" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ minWidth: 0 }}><b>Challenge your classmates</b><div className="hint">Send these {items.length} questions as a quiz link. Friends answer the same questions, free, and land on a leaderboard against you.</div></div>
      <div className="meta">
        <label className="meta hint" style={{ cursor: "pointer" }}><input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} /> Timed</label>
        <button className="btn pri sm" onClick={create} disabled={busy}>{busy ? <><span className="spin" /> Creating…</> : "Create quiz link"}</button>
      </div>
      {err && <div className="note err" style={{ width: "100%" }}>{err}</div>}
    </div>
  );
}
