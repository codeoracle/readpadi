"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  const redirect = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function google() {
    const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirect() } });
    if (error) { setState("error"); setMsg(error.message.includes("not enabled") ? "Google sign-in is not switched on yet. Use your email instead." : error.message); }
  }
  async function magic(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) { setState("error"); setMsg("Enter a valid email address."); return; }
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect() } });
    if (error) { setState("error"); setMsg(error.status === 429 ? "Too many requests. Wait a minute, then try again." : error.message); }
    else setState("sent");
  }

  if (state === "sent") return (
    <div className="panel form">
      <b>Check your email</b>
      <p className="muted" style={{ margin: 0 }}>We sent a sign-in link to <b>{email}</b>. Open it on this device. It can take a minute, and may land in spam or promotions.</p>
      <button className="link" style={{ justifySelf: "start" }} onClick={() => setState("idle")}>Use a different email</button>
    </div>
  );
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
