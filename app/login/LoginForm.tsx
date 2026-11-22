"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Accepts 0803…, 803…, 234803… or +234803… and returns E.164 (+234…). Other countries: type the full +code number. */
function toE164(raw: string) {
  const d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  if (d.startsWith("234")) return "+" + d;
  if (d.startsWith("0")) return "+234" + d.slice(1);
  if (/^[789]\d{9}$/.test(d)) return "+234" + d;
  return "+" + d;
}

export default function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const mode = "email" as "email" | "phone";
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState(""); const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "verifying" | "error">("idle");
  const [msg, setMsg] = useState("");
  const redirect = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const fail = (m: string) => { setState("error"); setMsg(m); };

  async function google() {
    const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirect() } });
    if (error) fail(error.message.includes("not enabled") ? "Google sign-in is not switched on yet. Use your email instead." : error.message);
  }
  async function magic(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail("Enter a valid email address.");
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect() } });
    if (error) fail(error.status === 429 ? "Too many requests. Wait a minute, then try again." : error.message);
    else setState("sent");
  }
  async function sendSms(e?: React.FormEvent) {
    e?.preventDefault();
    const p = toE164(phone);
    if (!/^\+\d{10,15}$/.test(p)) return fail("Enter a valid phone number, e.g. 0803 123 4567.");
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({ phone: p });
    if (error) fail(error.status === 429 ? "Too many requests. Wait a minute, then try again." : /provider|not enabled|unsupported/i.test(error.message) ? "Phone sign-in is not available right now. Use Google or email." : error.message);
    else { setState("sent"); setCode(""); }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(code.trim())) return fail("Enter the code from the SMS.");
    setState("verifying");
    const { error } = await supabaseBrowser().auth.verifyOtp({ phone: toE164(phone), token: code.trim(), type: "sms" });
    if (error) { setState("sent"); setMsg(/expired|invalid/i.test(error.message) ? "That code is wrong or has expired. Check it, or send a new one." : error.message); return; }
    router.replace(next.startsWith("/") ? next : "/library"); router.refresh();
  }

  if (state === "sent" || state === "verifying") {
    if (mode === "email") return (
      <div className="panel form">
        <b>Check your email</b>
        <p className="muted" style={{ margin: 0 }}>We sent a sign-in link to <b>{email}</b>. Open it on this device. It can take a minute, and may land in spam or promotions.</p>
        <button className="link" style={{ justifySelf: "start" }} onClick={() => setState("idle")}>Use a different email</button>
      </div>
    );
    return (
      <form className="panel form" onSubmit={verify}>
        <b>Enter the code</b>
        <p className="muted" style={{ margin: 0 }}>We texted a code to <b>{toE164(phone)}</b>. It can take up to a minute.</p>
        <div className="field"><label className="lbl" htmlFor="otp">Code</label><input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" style={{ fontFamily: "var(--f-mono)", fontSize: 20, letterSpacing: ".2em" }} autoFocus /></div>
        {msg && <div className="note err">{msg}</div>}
        <button className="btn pri lg" disabled={state === "verifying"}>{state === "verifying" ? <><span className="spin" /> Checking…</> : "Sign in"}</button>
        <div className="meta"><button type="button" className="link" onClick={() => sendSms()}>Send a new code</button><button type="button" className="link" onClick={() => { setState("idle"); setMsg(""); }}>Change number</button></div>
      </form>
    );
  }

  return (
    <div className="panel form">
      <button className="btn lg" onClick={google} type="button">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Continue with Google
      </button>
      <div className="hint" style={{ textAlign: "center" }}>or</div>
        <form onSubmit={magic} className="form">
          <div className="field"><label className="lbl" htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
          {state === "error" && <div className="note err">{msg}</div>}
          <button className="btn pri lg" disabled={state === "sending"}>{state === "sending" ? <><span className="spin" /> Sending…</> : "Email me a sign-in link"}</button>
        </form>
      <p className="hint" style={{ margin: 0 }}>By continuing you agree to use course materials for personal study only.</p>
    </div>
  );
}
