"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fmtDate, naira } from "@/lib/study";
import type { Plan } from "@/lib/types";

type S = { free_limit: number; free_window_hours: number; plans: Plan[]; locker_free_items: number };

export default function UpgradeView({ settings, proUntil, reference }: { settings: S; proUntil: string | null; reference: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState("");
  const [verify, setVerify] = useState<"idle" | "checking" | "ok" | "fail">(reference ? "checking" : "idle");
  const [until, setUntil] = useState(proUntil);
  const once = useRef(false);
  const pro = until && new Date(until) > new Date();

  useEffect(() => {
    if (!reference || once.current) return; once.current = true;
    fetch("/api/paystack/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reference }) })
      .then((r) => r.json()).then((j) => { if (j.ok) { setVerify("ok"); setUntil(j.until); router.replace("/upgrade"); router.refresh(); } else setVerify("fail"); })
      .catch(() => setVerify("fail"));
  }, [reference, router]);

  async function pay(plan: string) {
    setBusy(plan); setErr("");
    try {
      const r = await fetch("/api/paystack/init", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.error || "Could not start payment");
      window.location.href = j.url;
    } catch (e: any) { setErr(e.message); setBusy(null); }
  }

  return (
    <div>
      <div className="page-head"><div><h1>Passes</h1><p>Unlimited AI professor, exams, study guides and Locker for as long as you need. One-off payment; nothing renews automatically.</p></div></div>
      {verify === "checking" && <div className="note info" style={{ marginBottom: 14 }}><span className="spin" /> Confirming your payment with Paystack…</div>}
      {verify === "ok" && <div className="note ok" style={{ marginBottom: 14 }}>Payment confirmed. You have unlimited access until {fmtDate(until!)}.</div>}
      {verify === "fail" && <div className="note err" style={{ marginBottom: 14 }}>We could not confirm that payment yet. If you were charged, it will activate within a few minutes; refresh this page shortly.</div>}
      {pro && verify !== "ok" && <div className="note ok" style={{ marginBottom: 14 }}>Your pass is active until {fmtDate(until!)}. Buying another adds its days on top.</div>}
      {err && <div className="note err" style={{ marginBottom: 14 }}>{err}</div>}
      <div className="price">
        <div className="panel"><span className="lbl">Free</span><h2 style={{ fontSize: 26 }}>{naira(0)}</h2>
          <ul><li>{settings.free_limit} AI actions, refilled every {settings.free_window_hours} hours</li><li>Locker for {settings.locker_free_items} documents</li><li>Every course, levels and ranks</li></ul>
          {!pro && <span className="chip">Your current plan</span>}
        </div>
        {settings.plans.map((p, i) => (
          <div key={p.id} className="panel" style={i === 1 ? { borderColor: "var(--accent)" } : undefined}>
            <span className="lbl" style={i === 1 ? { color: "var(--accent)" } : undefined}>{p.label}{i === 1 ? " · most popular" : ""}</span>
            <h2 style={{ fontSize: 26 }}>{naira(p.price_ngn)} <span className="hint" style={{ fontSize: 14 }}>/ {p.days} days</span></h2>
            <ul><li>Unlimited AI professor and exams</li><li>Unlimited Locker + AI receipt filing</li><li>{naira(p.price_ngn / p.days)} a day</li></ul>
            <button className={`btn lg ${i === 1 ? "pri" : ""}`} onClick={() => pay(p.id)} disabled={!!busy}>{busy === p.id ? <><span className="spin" /> Opening Paystack…</> : `Pay ${naira(p.price_ngn)}`}</button>
          </div>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 16 }}>One AI action is one professor answer, one batch of up to 10 exam questions, one study guide, one receipt read, or marking one script. Pay with card, bank transfer or USSD through Paystack. Invite classmates from your profile to earn free days.</p>
    </div>
  );
}
