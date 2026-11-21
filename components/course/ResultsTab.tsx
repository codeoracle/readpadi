"use client";
import { fmtDate, grade, gradeTone, KIND_LABEL, topicRows } from "@/lib/study";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Attempt } from "@/lib/types";
import type { Ctx } from "./Workspace";

export default function ResultsTab({ ctx, onView }: { ctx: Ctx; onView: (a: Attempt) => void }) {
  const att = ctx.attempts;
  if (!att.length) return <div className="empty"><h2>No results yet</h2><p>Sit a practice exam and your grades for {ctx.course.code} will build up here, with the topics you keep missing.</p><button className="btn pri" onClick={() => ctx.setTab("test")}>Set an exam</button></div>;
  const tps = topicRows(att.slice(-5).flatMap((a) => a.items)).filter((t) => t.pct < 60).slice(0, 6);
  const best = Math.max(...att.map((a) => a.pct)), last = att[att.length - 1].pct;
  async function del(id: string) { await supabaseBrowser().from("attempts").delete().eq("id", id); ctx.setAttempts((as) => as.filter((a) => a.id !== id)); }
  return (
    <>
      <div className="panel" style={{ display: "grid", gap: 12 }}>
        <div className="meta"><span className="chip acc">latest {last}% · {grade(last)}</span><span className="chip good">best {best}% · {grade(best)}</span><span className="chip">{att.length} attempts</span></div>
        <div className="scroll-x"><Chart att={att} /></div>
      </div>
      {tps.length > 0 && <>
        <div className="section-t"><h2>Keep missing</h2><span className="hint">From your last {Math.min(5, att.length)} tests</span></div>
        <div className="panel"><div className="topics">{tps.map((t) => (
          <div key={t.k} className="topic weak"><span style={{ minWidth: 0 }}>{t.k} {t.pages.length > 0 && <button className="link" onClick={() => ctx.goPage(t.pages[0])}>p.{t.pages.slice(0, 4).join(", ")}</button>}</span>
            <div className="bar"><i style={{ width: `${t.pct}%` }} /></div><span className="mono" style={{ textAlign: "right" }}>{t.pct}%</span></div>))}</div></div>
      </>}
      <div className="section-t"><h2>All attempts</h2></div>
      <div className="hist">{[...att].reverse().map((a) => (
        <div key={a.id} style={{ display: "flex", gap: 6 }}>
          <button className="hrow" onClick={() => onView(a)}><span style={{ minWidth: 0 }}><b>{fmtDate(a.created_at)}</b> <span className="hint">· {KIND_LABEL[a.kind]} · {a.items.length} q · pp. {a.page_from}–{a.page_to}</span></span><span className={`chip ${gradeTone(a.pct)}`}>{grade(a.pct)}</span><span className="pct">{a.pct}%</span></button>
          <button className="btn sm ghost danger" onClick={() => del(a.id)} aria-label="Delete attempt">✕</button>
        </div>))}</div>
    </>
  );
}

function Chart({ att }: { att: Attempt[] }) {
  const pts = att.slice(-20); const W = Math.max(320, pts.length * 44 + 60), H = 180, L = 34, R = 10, T = 10, B = 26;
  const iw = W - L - R, ih = H - T - B, bw = Math.min(28, (iw / pts.length) * 0.6);
  const y = (v: number) => T + ih - (v / 100) * ih;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Score per attempt" style={{ display: "block" }}>
        {[0, 40, 50, 70, 100].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={v === 40 ? "4 3" : undefined} /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fontFamily="var(--f-mono)" fill="var(--muted)">{v}</text></g>)}
        {pts.map((a, i) => { const cx = L + ((i + 0.5) * iw) / pts.length; return <g key={a.id}><rect x={cx - bw / 2} y={y(a.pct)} width={bw} height={Math.max(1, ih - (y(a.pct) - T))} rx="3" fill={`var(--${gradeTone(a.pct)})`} /><text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fontFamily="var(--f-mono)" fill="var(--muted)">{new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</text></g>; })}
      </svg>
      <div className="hint" style={{ marginTop: 4 }}>Dashed line: pass mark (40%).</div>
    </>
  );
}
