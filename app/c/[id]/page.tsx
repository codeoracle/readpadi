import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { BRAND } from "@/lib/brand";
import { splitCode } from "@/lib/study";
import { RefCapture } from "@/components/RefCapture";

export const revalidate = 600;

async function getCourse(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from("courses").select("id,code,title,school,pages,status").eq("id", id).eq("status", "approved").maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const c = await getCourse((await params).id);
  if (!c) return { title: "Course" };
  const title = `${c.code}: ${c.title}`;
  const description = `Read ${c.code} with an AI professor and sit free CBT-style practice exams set from the course material.${c.school ? " " + c.school + "." : ""}`;
  return { title, description, openGraph: { title: `${title} · ${BRAND.name}`, description, type: "article" }, twitter: { card: "summary", title, description } };
}

export default async function SharedCourse({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCourse(id);
  if (!c) notFound();
  const [a, b] = splitCode(c.code);
  return (
    <>
      <RefCapture />
      <header className="top"><div className="wrap"><Link href="/" className="brand"><span className="brand-mark">{BRAND.short}</span>{BRAND.name}</Link><span style={{ flex: 1 }} /><Link href={`/login?next=/course/${c.id}`} className="btn sm">Sign in</Link></div></header>
      <main className="wrap" style={{ maxWidth: 720, paddingTop: 40 }}>
        <div className="spine" style={{ minHeight: 150, marginBottom: 22 }}>
          <div className="callno"><span className="a">{a}</span><span className="b">{b}</span><span className="c">{c.pages} pp.</span></div>
          <div className="body"><span className="lbl">Shared course material</span><div className="ttl" style={{ fontSize: 22 }}>{c.title}</div>{c.school && <div className="hint">{c.school}</div>}</div>
        </div>
        <h1 style={{ fontSize: "clamp(24px,5vw,34px)", fontWeight: 800, letterSpacing: "-.02em" }}>Study {c.code} with an AI professor</h1>
        <ul style={{ fontFamily: "var(--f-read)", fontSize: 17, lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Read all {c.pages} pages and ask about anything you don’t understand</li>
          <li>Sit timed e-Exam (CBT) or theory practice exams set from this material</li>
          <li>See your grade, the right answers, and exactly which pages to reread</li>
        </ul>
        <div className="meta" style={{ gap: 10, marginTop: 10 }}>
          <Link href={`/login?next=/course/${c.id}`} className="btn pri lg">Start studying free</Link>
          <span className="hint">Free account · Google or email · no card needed</span>
        </div>
      </main>
    </>
  );
}
