import { BRAND } from "@/lib/brand";
import type { Metadata } from "next";
import Link from "next/link";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <header className="top"><div className="wrap"><Link href="/" className="brand"><span className="brand-mark">{BRAND.short}</span>{BRAND.name}</Link></div></header>
      <main className="wrap" style={{ maxWidth: 440, paddingTop: 48 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em" }}>Sign in to study</h1>
        <p className="muted" style={{ margin: "6px 0 20px" }}>Use Google, or get a one-time sign-in link by email. No password needed.</p>
        {sp.error && <div className="note err" style={{ marginBottom: 14 }}>That sign-in link has expired or was already used. Request a new one.</div>}
        <LoginForm next={sp.next || "/library"} />
      </main>
    </>
  );
}
