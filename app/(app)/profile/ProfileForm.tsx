"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { fmtDate, LEVELS, levelLabel } from "@/lib/study";
import type { Profile } from "@/lib/types";

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

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 680 }}>
      <form className="panel form" onSubmit={save}>
        <div className="row2">
          <div className="field"><label className="lbl" htmlFor="pName">Name</label><input id="pName" maxLength={80} value={f.name} onChange={set("name")} placeholder="What the professor calls you" autoComplete="name" /></div>
          <div className="field"><label className="lbl" htmlFor="pSchool">School</label><input id="pSchool" maxLength={120} list="schoolList" value={f.school} onChange={set("school")} required /><datalist id="schoolList">{[...new Set(["National Open University of Nigeria", ...schools])].map((s) => <option key={s} value={s} />)}</datalist></div>
        </div>
        <div className="row2">
          <div className="field"><label className="lbl" htmlFor="pProg">Programme</label><input id="pProg" maxLength={120} value={f.programme} onChange={set("programme")} placeholder="B.Sc. Library and Information Science" /></div>
          <div className="field"><label className="lbl" htmlFor="pLevel">Level</label><select id="pLevel" value={f.level} onChange={set("level")}>{LEVELS.map((l) => <option key={l} value={l}>{levelLabel(l)}</option>)}</select></div>
        </div>
        <div className="row2">
          <div className="field"><label className="lbl" htmlFor="pCentre">Study centre</label><input id="pCentre" maxLength={80} value={f.centre} onChange={set("centre")} placeholder="Lagos" /></div>
          <div className="field"><label className="lbl" htmlFor="pSession">Semester / session</label><input id="pSession" maxLength={30} value={f.session} onChange={set("session")} placeholder="2026_1" /></div>
        </div>
        <div className="meta" style={{ justifyContent: "flex-end" }}><button className="btn pri" disabled={busy}>{busy ? "Saving…" : "Save details"}</button></div>
      </form>
      <div className="panel" style={{ display: "grid", gap: 10 }}>
        <div className="lbl">Account</div>
        <div className="meta" style={{ justifyContent: "space-between" }}><span>{email}</span>{p?.role !== "student" && <span className="chip acc">{p?.role}</span>}</div>
        <div className="meta" style={{ justifyContent: "space-between" }}>
          <span>{pro ? <>Pro until <b>{fmtDate(p!.pro_until!)}</b></> : "Free plan"}</span>
          <a className="btn sm" href="/upgrade">{pro ? "Extend Pro" : "Get Pro"}</a>
        </div>
        <div><button className="btn sm danger" onClick={signOut}>Sign out</button></div>
      </div>
    </div>
  );
}
