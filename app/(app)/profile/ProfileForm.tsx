"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { fmtDate, LEVELS, levelLabel } from "@/lib/study";
import type { Profile } from "@/lib/types";
import { useMyLevel } from "@/components/LevelCard";
import { BRAND } from "@/lib/brand";

export default function ProfileForm({ profile, email, schools }: { profile: Profile | null; email: string; schools: string[] }) {
  const p = profile;
  const [f, setF] = useState({ name: p?.name || "", school: p?.school || "National Open University of Nigeria", programme: p?.programme || "", level: p?.level || "200", centre: p?.centre || "", session: p?.session || "" });
  const [busy, setBusy] = useState(false);
  const toast = useToast(); const router = useRouter();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabaseBrowser().from("profiles").update(f).eq("id", p!.id);
    setBusy(false);
    if (error) return toast("Could not save: " + error.message);
    toast("Details saved"); router.refresh();
  }
  async function signOut() { await supabaseBrowser().auth.signOut(); router.push("/"); router.refresh(); }
  const pro = p?.pro_until && new Date(p.pro_until) > new Date();
  const lvl = useMyLevel();
  const [board, setBoard] = useState(p?.show_on_board ?? true);
  const [copied, setCopied] = useState(false);
  const [invite, setInvite] = useState("");
  useEffect(() => { if (p?.referral_code) setInvite(`${window.location.origin}/?ref=${p.referral_code}`); }, [p?.referral_code]);
  async function toggleBoard(v: boolean) { setBoard(v); await supabaseBrowser().from("profiles").update({ show_on_board: v }).eq("id", p!.id); toast(v ? "You appear on ranks" : "Hidden from ranks"); }
  async function copyInvite() { try { await navigator.clipboard.writeText(invite); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 680 }}>
      <form className="panel form" onSubmit={save}>
        <div className="row2">
          <div className="field"><label className="lbl" htmlFor="pName">Name</label><input id="pName" maxLength={80} value={f.name} onChange={set("name")} placeholder="What the professor calls you" autoComplete="name" /></div>
          <div className="field"><label className="lbl" htmlFor="pSchool">School</label><input id="pSchool" maxLength={120} list="schoolList" value={f.school} onChange={set("school")} required /><datalist id="schoolList">{[...new Set(["National Open University of Nigeria", ...schools])].map((s) => <option key={s} value={s} />)}</datalist></div>
        </div>
        <div className="row2">
          <div className="field"><label className="lbl" htmlFor="pProg">Programme</label><input id="pProg" maxLength={120} value={f.programme} onChange={set("programme")} placeholder="e.g. B.Sc. Mass Communication" /></div>
          <div className="field"><label className="lbl" htmlFor="pLevel">Level</label><select id="pLevel" value={f.level} onChange={set("level")}>{LEVELS.map((l) => <option key={l} value={l}>{levelLabel(l)}</option>)}</select></div>
        </div>
        <div className="row2">
          <div className="field"><label className="lbl" htmlFor="pCentre">Study centre</label><input id="pCentre" maxLength={80} value={f.centre} onChange={set("centre")} placeholder="Lagos" /></div>
          <div className="field"><label className="lbl" htmlFor="pSession">Semester / session</label><input id="pSession" maxLength={30} value={f.session} onChange={set("session")} placeholder="2026_1" /></div>
        </div>
        <div className="meta" style={{ justifyContent: "flex-end" }}><button className="btn pri" disabled={busy}>{busy ? "Saving…" : "Save details"}</button></div>
      </form>
      {invite && (
        <div className="panel" style={{ display: "grid", gap: 10 }}>
          <div className="lbl">Invite classmates</div>
          <p style={{ margin: 0 }}>{lvl ? <>Every {lvl.referral_every} friends who join with your link earns you <b>{lvl.referral_days} free Pro days</b>. You have invited <b>{lvl.referrals}</b>{lvl.referrals % lvl.referral_every ? `; ${lvl.referral_every - (lvl.referrals % lvl.referral_every)} more for your next reward` : ""}.</> : "Share your link to earn free Pro days."}</p>
          <input className="input mono" readOnly value={invite} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" style={{ fontSize: 12 }} />
          <div className="meta">
            <button type="button" className="btn sm pri" onClick={copyInvite}>{copied ? "Copied" : "Copy link"}</button>
            <a className="btn sm" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`I'm preparing for exams on ${BRAND.name}: an AI professor for our course materials and free CBT practice tests. Join me: ${invite}`)}`}>Share on WhatsApp</a>
          </div>
        </div>
      )}
      <div className="panel" style={{ display: "grid", gap: 10 }}>
        <div className="lbl">Ranks</div>
        <label className="meta" style={{ justifyContent: "space-between", cursor: "pointer" }}><span>Show me on the weekly ranks (as first name and initial)</span><input type="checkbox" checked={board} onChange={(e) => toggleBoard(e.target.checked)} style={{ width: 20, height: 20 }} /></label>
      </div>
      <div className="panel" style={{ display: "grid", gap: 10 }}>
        <div className="lbl">Account</div>
        <div className="meta" style={{ justifyContent: "space-between" }}><span>{email}</span>{p?.role !== "student" && <span className="chip acc">{p?.role}</span>}</div>
        <div className="meta" style={{ justifyContent: "space-between" }}>
          <span>{pro ? <>Pass active until <b>{fmtDate(p!.pro_until!)}</b></> : "Free plan"}</span>
          <a className="btn sm" href="/upgrade">{pro ? "Extend" : "Get a pass"}</a>
        </div>
        <div><button className="btn sm danger" onClick={signOut}>Sign out</button></div>
      </div>
    </div>
  );
}
