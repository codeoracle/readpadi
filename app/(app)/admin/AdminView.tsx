"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { fmtDate, naira } from "@/lib/study";
import type { Course } from "@/lib/types";

type Stats = { students: number; pro: number; courses: number; pending: number; tests_7d: number; ai_today: number; revenue_kobo: number } | null;
type UserRow = { id: string; email: string; name: string; school: string; role: string; pro_until: string | null; created_at: string; used_today: number; attempts: number };

export default function AdminView({ isAdmin, meId, stats, pending, settings, recent }: { isAdmin: boolean; meId: string; stats: Stats; pending: Course[]; settings: any; recent: Pick<Course, "id" | "code" | "title" | "school" | "status" | "pages" | "created_at">[] }) {
  const [tab, setTab] = useState<"review" | "library" | "users" | "settings">("review");
  return (
    <>
      <div className="page-head"><div><h1>Admin</h1><p>Review uploads, manage students and set limits.</p></div></div>
      {stats && (
        <div className="stats">
          <div className="stat"><span className="lbl">Students</span><b>{stats.students}</b></div>
          <div className="stat"><span className="lbl">Pro now</span><b>{stats.pro}</b></div>
          <div className="stat"><span className="lbl">Courses live</span><b>{stats.courses}</b></div>
          <div className="stat"><span className="lbl">Awaiting review</span><b style={{ color: stats.pending ? "var(--warn)" : undefined }}>{stats.pending}</b></div>
          <div className="stat"><span className="lbl">Tests · 7 days</span><b>{stats.tests_7d}</b></div>
          <div className="stat"><span className="lbl">AI actions today</span><b>{stats.ai_today}</b></div>
          {isAdmin && <div className="stat"><span className="lbl">Revenue</span><b>{naira(stats.revenue_kobo / 100)}</b></div>}
        </div>
      )}
      <div className="tabs" role="tablist">
        {([["review", `Review${pending.length ? ` (${pending.length})` : ""}`], ["library", "Library"], ...(isAdmin ? [["users", "Students"], ["settings", "Settings"]] : [])] as [typeof tab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "review" && <Review pending={pending} />}
      {tab === "library" && <LibraryAdmin rows={recent} isAdmin={isAdmin} />}
      {tab === "users" && isAdmin && <Users meId={meId} />}
      {tab === "settings" && isAdmin && <SettingsForm s={settings} />}
    </>
  );
}

function Review({ pending }: { pending: Course[] }) {
  const router = useRouter(); const toast = useToast();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, { code: string; title: string; school: string }>>({});
  const sb = supabaseBrowser();
  async function preview(c: Course) {
    const { data } = await sb.storage.from("materials").createSignedUrl(c.file_path, 600);
    if (data) window.open(data.signedUrl, "_blank", "noopener");
  }
  async function decide(c: Course, status: "approved" | "rejected") {
    const { data: { user } } = await sb.auth.getUser();
    const e = edits[c.id] || {};
    const { error } = await sb.from("courses").update({ ...e, status, reject_reason: status === "rejected" ? (reasons[c.id] || "Not suitable") : "", reviewed_by: user!.id, reviewed_at: new Date().toISOString() }).eq("id", c.id);
    if (error) return toast("Could not update: " + error.message);
    toast(status === "approved" ? `${c.code} is live` : `${c.code} rejected`); router.refresh();
  }
  if (!pending.length) return <div className="empty"><h2>Nothing to review</h2><p>New uploads from students will appear here.</p></div>;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {pending.map((c) => {
        const e = edits[c.id] || { code: c.code, title: c.title, school: c.school };
        const setE = (k: "code" | "title" | "school", v: string) => setEdits({ ...edits, [c.id]: { ...e, [k]: v } });
        return (
          <div key={c.id} className="panel form">
            <div className="row2">
              <div className="field"><label className="lbl">Code</label><input value={e.code} onChange={(x) => setE("code", x.target.value)} /></div>
              <div className="field"><label className="lbl">School</label><input value={e.school} onChange={(x) => setE("school", x.target.value)} /></div>
            </div>
            <div className="field"><label className="lbl">Title</label><input value={e.title} onChange={(x) => setE("title", x.target.value)} /></div>
            <div className="meta"><span className="chip">{c.pages} pages</span><span className="chip">{(c.file_bytes / 1048576).toFixed(1)} MB</span><span className="chip">uploaded {fmtDate(c.created_at)}</span>{c.description && <span className="hint">“{c.description}”</span>}</div>
            <div className="meta" style={{ justifyContent: "space-between" }}>
              <span className="meta"><button className="btn sm" onClick={() => preview(c)}>Open PDF</button><a className="btn sm" href={`/course/${c.id}`}>Open in reader</a></span>
              <span className="meta">
                <input className="input" style={{ width: 200 }} placeholder="Reason if rejecting" value={reasons[c.id] || ""} onChange={(x) => setReasons({ ...reasons, [c.id]: x.target.value })} />
                <button className="btn sm danger" onClick={() => decide(c, "rejected")}>Reject</button>
                <button className="btn sm pri" onClick={() => decide(c, "approved")}>Approve</button>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LibraryAdmin({ rows, isAdmin }: { rows: any[]; isAdmin: boolean }) {
  const router = useRouter(); const toast = useToast(); const sb = supabaseBrowser();
  const [confirm, setConfirm] = useState<string | null>(null);
  async function setStatus(id: string, status: string) { const { error } = await sb.from("courses").update({ status }).eq("id", id); if (error) toast(error.message); else router.refresh(); }
  async function del(id: string) {
    const { data: c } = await sb.from("courses").select("file_path").eq("id", id).single();
    const { error } = await sb.from("courses").delete().eq("id", id);
    if (error) return toast(error.message);
    if (c?.file_path) await sb.storage.from("materials").remove([c.file_path]);
    setConfirm(null); toast("Course deleted"); router.refresh();
  }
  return (
    <div className="panel scroll-x" style={{ padding: 0 }}>
      <table className="tbl"><thead><tr><th>Course</th><th>School</th><th>Status</th><th>Added</th><th /></tr></thead>
        <tbody>{rows.map((c) => (
          <tr key={c.id}>
            <td><b className="mono">{c.code}</b> {c.title}</td><td className="hint">{c.school}</td>
            <td><span className={`chip ${c.status === "approved" ? "good" : "bad"}`}>{c.status}</span></td><td className="hint">{fmtDate(c.created_at)}</td>
            <td style={{ whiteSpace: "nowrap" }}>
              {c.status === "approved" ? <button className="btn sm" onClick={() => setStatus(c.id, "rejected")}>Unpublish</button> : <button className="btn sm" onClick={() => setStatus(c.id, "approved")}>Publish</button>}
              {isAdmin && (confirm === c.id ? <> <button className="btn sm danger" onClick={() => del(c.id)}>Delete for good</button> <button className="btn sm ghost" onClick={() => setConfirm(null)}>Cancel</button></> : <> <button className="btn sm ghost danger" onClick={() => setConfirm(c.id)}>Delete</button></>)}
            </td>
          </tr>))}</tbody></table>
      {!rows.length && <p className="hint" style={{ padding: 16 }}>No reviewed courses yet.</p>}
    </div>
  );
}

function Users({ meId }: { meId: string }) {
  const sb = supabaseBrowser(); const toast = useToast();
  const [q, setQ] = useState(""); const [rows, setRows] = useState<UserRow[]>([]); const [loading, setLoading] = useState(true);
  async function load(s = q) { setLoading(true); const { data, error } = await sb.rpc("admin_list_users", { p_search: s.trim() }); setLoading(false); if (error) toast(error.message); else setRows(data as UserRow[]); }
  useEffect(() => { load(""); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function role(id: string, r: string) { const { error } = await sb.rpc("admin_set_role", { p_user: id, p_role: r }); if (error) toast(error.message); else { toast("Role updated"); load(); } }
  async function pro(id: string, days: number) { const { error } = await sb.rpc("admin_grant_pro", { p_user: id, p_days: days }); if (error) toast(error.message); else { toast(days > 0 ? `Gave ${days} days of Pro` : "Pro removed"); load(); } }
  return (
    <>
      <form className="search" onSubmit={(e) => { e.preventDefault(); load(); }}><input className="input" type="search" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn">Search</button></form>
      <div className="panel scroll-x" style={{ padding: 0 }}>
        <table className="tbl"><thead><tr><th>Student</th><th>Role</th><th>Plan</th><th>AI today</th><th>Tests</th><th>Joined</th></tr></thead>
          <tbody>{rows.map((u) => {
            const isPro = u.pro_until && new Date(u.pro_until) > new Date();
            return (
              <tr key={u.id}>
                <td><b>{u.name || "—"}</b><div className="hint">{u.email}{u.school ? ` · ${u.school}` : ""}</div></td>
                <td><select className="input" style={{ width: "auto", minHeight: 32, padding: "4px 8px" }} value={u.role} disabled={u.id === meId} onChange={(e) => role(u.id, e.target.value)}><option value="student">Student</option><option value="moderator">Moderator</option><option value="admin">Admin</option></select></td>
                <td style={{ whiteSpace: "nowrap" }}>{isPro ? <span className="chip acc">Pro to {fmtDate(u.pro_until!)}</span> : <span className="chip">Free</span>} <button className="link" onClick={() => pro(u.id, 30)}>+30 days</button>{isPro && <> · <button className="link" onClick={() => pro(u.id, 0)}>remove</button></>}</td>
                <td className="mono">{u.used_today}</td><td className="mono">{u.attempts}</td><td className="hint">{fmtDate(u.created_at)}</td>
              </tr>);
          })}</tbody></table>
        {loading && <p className="hint" style={{ padding: 16 }}><span className="spin" /> Loading…</p>}
        {!loading && !rows.length && <p className="hint" style={{ padding: 16 }}>No students found.</p>}
      </div>
    </>
  );
}

function SettingsForm({ s }: { s: any }) {
  const toast = useToast(); const router = useRouter();
  const [f, setF] = useState({ free_daily_limit: s.free_daily_limit, pro_price_ngn: s.pro_price_ngn, pro_days: s.pro_days, admin_emails: (s.admin_emails || []).join(", ") });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabaseBrowser().from("settings").update({ free_daily_limit: +f.free_daily_limit, pro_price_ngn: +f.pro_price_ngn, pro_days: +f.pro_days, admin_emails: f.admin_emails.split(",").map((x: string) => x.trim().toLowerCase()).filter(Boolean), updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) toast(error.message); else { toast("Settings saved"); router.refresh(); }
  }
  return (
    <form className="panel form" onSubmit={save} style={{ maxWidth: 560 }}>
      <div className="row2">
        <div className="field"><label className="lbl" htmlFor="sLimit">Free AI actions per day</label><input id="sLimit" type="number" min={0} max={500} value={f.free_daily_limit} onChange={(e) => setF({ ...f, free_daily_limit: e.target.value })} /></div>
        <div className="field"><label className="lbl" htmlFor="sDays">Pro pass length (days)</label><input id="sDays" type="number" min={1} max={366} value={f.pro_days} onChange={(e) => setF({ ...f, pro_days: e.target.value })} /></div>
      </div>
      <div className="field"><label className="lbl" htmlFor="sPrice">Pro price (₦)</label><input id="sPrice" type="number" min={100} step={50} value={f.pro_price_ngn} onChange={(e) => setF({ ...f, pro_price_ngn: e.target.value })} /></div>
      <div className="field"><label className="lbl" htmlFor="sAdmins">Auto-admin emails</label><input id="sAdmins" value={f.admin_emails} onChange={(e) => setF({ ...f, admin_emails: e.target.value })} /><span className="hint">People who sign up with these emails become admins. Use the Students tab to change existing accounts.</span></div>
      <div className="meta" style={{ justifyContent: "flex-end" }}><button className="btn pri">Save settings</button></div>
    </form>
  );
}
