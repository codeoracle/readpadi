"use client";
import { useState } from "react";
import { BRAND } from "@/lib/brand";

export default function ShareCourse({ courseId, code, title, refCode }: { courseId: string; code: string; title: string; refCode?: string }) {
  const [open, setOpen] = useState(false); const [copied, setCopied] = useState(false);
  const base = typeof window !== "undefined" ? window.location.origin : BRAND.siteUrl;
  const url = `${base}/c/${courseId}${refCode ? `?ref=${refCode}` : ""}`;
  const text = `Study ${code} (${title}) with me on ${BRAND.name}: read it with an AI professor and sit practice exams free. ${url}`;
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }
  async function native() {
    if (navigator.share) { try { await navigator.share({ title: `${code} on ${BRAND.name}`, text, url }); return; } catch {} }
    setOpen(true);
  }
  return (
    <div style={{ position: "relative" }}>
      <button className="btn sm" onClick={() => (typeof navigator !== "undefined" && "share" in navigator ? native() : setOpen(!open))}>Share</button>
      {open && (
        <div className="panel" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 15, width: "min(340px, calc(100vw - 32px))", display: "grid", gap: 10, boxShadow: "0 12px 30px -12px rgba(0,0,0,.3)" }}>
          <b>Share {code}</b>
          <input className="input mono" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Course link" style={{ fontSize: 12 }} />
          <div className="meta">
            <button className="btn sm pri" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
            <a className="btn sm" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <a className="btn sm" href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`Study ${code} on ${BRAND.name}`)}`} target="_blank" rel="noopener noreferrer">Telegram</a>
          </div>
          {refCode && <span className="hint">Friends who join through your link count toward free Pro days.</span>}
          <button className="link" style={{ justifySelf: "start" }} onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </div>
  );
}
