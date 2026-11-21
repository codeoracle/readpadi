"use client";
import { BRAND } from "@/lib/brand";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AiMeter from "./AiMeter";

const icons: Record<string, React.ReactNode> = {
  library: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l4 1-3 14-4-1z" /></svg>,
  upload: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4M6 10l6-6 6 6M4 20h16" /></svg>,
  profile: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></svg>,
  admin: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /></svg>,
  locker: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 12h16M10 7h4M10 16h4" /></svg>,
  quiz: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.5" /></svg>,
  ranks: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 21V11M16 21V7M12 21V3M4 21h16" /></svg>,
  pro: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l2.7 5.6 6.3.9-4.5 4.4 1 6.1L12 17l-5.5 3 1-6.1L3 9.5l6.3-.9z" /></svg>,
};

export default function AppNav({ initials, staff, pendingCount }: { initials: string; staff: boolean; pendingCount: number }) {
  const path = usePathname();
  const items = [
    { href: "/library", label: "Library", icon: "library" },
    { href: "/quizzes", label: "Quizzes", icon: "quiz" },
    { href: "/locker", label: "Locker", icon: "locker" },
    { href: "/ranks", label: "Ranks", icon: "ranks" },
    { href: "/upload", label: "Add material", icon: "upload" },
    ...(staff ? [{ href: "/admin", label: pendingCount ? `Admin · ${pendingCount}` : "Admin", icon: "admin" }] : []),
    { href: "/upgrade", label: "Pro", icon: "pro" },
  ];
  const cur = (h: string) => (path === h || path.startsWith(h + "/") || (h === "/library" && path.startsWith("/course")) ? "page" : undefined);
  return (
    <>
      <header className="top"><div className="wrap">
        <Link href="/library" className="brand"><span className="brand-mark">{BRAND.short}</span>{BRAND.name}</Link>
        <nav className="nav" aria-label="Main">{items.map((i) => <Link key={i.href} href={i.href} aria-current={cur(i.href)}>{i.label}</Link>)}</nav>
        <AiMeter />
        <Link href="/profile" className="avatar" aria-label="My profile">{initials}</Link>
      </div></header>
      <nav className="bottom-nav" aria-label="Main">
        {[...items.filter((i) => i.icon !== "pro" && i.icon !== "upload" && i.icon !== "admin"), { href: "/profile", label: "Me", icon: "profile" }].map((i) => (
          <Link key={i.href} href={i.href} aria-current={cur(i.href)}>{icons[i.icon]}<span>{i.label.replace(/ · \d+$/, "")}</span></Link>
        ))}
      </nav>
    </>
  );
}
