"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fmtDate, naira } from "@/lib/study";

export default function UpgradeView({ settings, proUntil, reference }: { settings: { free_daily_limit: number; pro_price_ngn: number; pro_days: number }; proUntil: string | null; reference: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
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

  async function pay() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/paystack/init", { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.error || "Could not start payment");
      window.location.href = j.url;
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-head"><div><h1>Pro pass</h1><p>Unlimited professor explanations, study guides and practice exams for {settings.pro_days} days. Pay once; it does not renew automatically.</p></div></div>
      {verify === "checking" && <div className="note info" style={{ marginBottom: 14 }}><span className="spin" /> Confirming your payment with Paystack…</div>}
      {verify === "ok" && <div className="note ok" style={{ marginBottom: 14 }}>Payment confirmed. You have Pro until {fmtDate(until!)}.</div>}
      {verify === "fail" && <div className="note err" style={{ marginBottom: 14 }}>We could not confirm that payment yet. If you were charged, it will activate within a few minutes; refresh this page shortly.</div>}
      <div className="price">
        <div className="panel"><span className="lbl">Free</span><h2 style={{ fontSize: 26 }}>{naira(0)}</h2>
          <ul><li>Every course in the library</li><li>{settings.free_daily_limit} AI actions a day</li><li>Results, notes and timetable synced</li></ul>
          {!pro && <span className="chip">Your current plan</span>}
        </div>
        <div className="panel" style={{ borderColor: "var(--accent)" }}><span className="lbl" style={{ color: "var(--accent)" }}>Pro pass</span>
          <h2 style={{ fontSize: 26 }}>{naira(settings.pro_price_ngn)} <span className="hint" style={{ fontSize: 14 }}>/ {settings.pro_days} days</span></h2>
          <ul><li>Unlimited professor and exams</li><li>Whole-unit study guides</li><li>Card, bank transfer or USSD via Paystack</li></ul>
          {pro && <div className="note ok">Active until {fmtDate(until!)}. Buying again adds {settings.pro_days} days.</div>}
          {err && <div className="note err">{err}</div>}
          <button className="btn pri lg" onClick={pay} disabled={busy}>{busy ? <><span className="spin" /> Opening Paystack…</> : pro ? "Extend Pro" : `Pay ${naira(settings.pro_price_ngn)}`}</button>
        </div>
      </div>
      <p className="hint" style={{ marginTop: 16 }}>One AI action is one professor answer, one batch of up to 10 exam questions, one study guide, or marking one script. Free actions reset at midnight Lagos time.</p>
    </div>
  );
}
