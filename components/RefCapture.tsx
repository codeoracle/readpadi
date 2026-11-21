"use client";
import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const KEY = "akada.ref";
/** On public pages: remember ?ref=code. Inside the app: claim it once after sign-up. */
export function RefCapture() {
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("ref");
    if (r && /^[a-z0-9]{5,12}$/i.test(r)) { try { localStorage.setItem(KEY, r.toLowerCase()); } catch {} }
  }, []);
  return null;
}
export function RefClaim() {
  useEffect(() => {
    let code: string | null = null;
    try { code = localStorage.getItem(KEY); } catch {}
    if (!code) return;
    supabaseBrowser().rpc("claim_referral", { p_code: code }).then(() => { try { localStorage.removeItem(KEY); } catch {} });
  }, []);
  return null;
}
