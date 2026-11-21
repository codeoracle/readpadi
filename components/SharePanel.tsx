"use client";
import { useState } from "react";

export default function SharePanel({ url, text, title }: { url: string; text: string; title: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }
  async function native() { try { await navigator.share({ title, text, url }); } catch {} }
  return (
    <div className="panel" style={{ display: "grid", gap: 10, borderColor: "var(--accent)" }}>
      <b>{title}</b>
      <input className="input mono" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link" style={{ fontSize: 12 }} />
      <div className="meta">
        <button type="button" className="btn sm pri" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
        <a className="btn sm" href={`https://wa.me/?text=${encodeURIComponent(text + " " + url)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <a className="btn sm" href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">Telegram</a>
        {typeof navigator !== "undefined" && "share" in navigator && <button type="button" className="btn sm" onClick={native}>More…</button>}
      </div>
    </div>
  );
}
