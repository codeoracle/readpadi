import type { Course, Exam, MarkedItem, Profile, Question } from "./types";

export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

/** NOUN grading scale. */
export const grade = (p: number) => (p >= 70 ? "A" : p >= 60 ? "B" : p >= 50 ? "C" : p >= 45 ? "D" : p >= 40 ? "E" : "F");
export const gradeTone = (p: number) => (p >= 50 ? "good" : p >= 40 ? "warn" : "bad");

export function splitCode(code: string): [string, string] {
  const m = String(code || "").trim().toUpperCase().match(/^([A-Z]+)\s*(\d+.*)$/);
  return m ? [m[1], m[2]] : [String(code || "").toUpperCase(), ""];
}
export const fmtDate = (t: string | number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export function daysTo(d?: string | null) {
  if (!d) return null;
  return Math.ceil((new Date(d + "T09:00:00").getTime() - Date.now()) / 86400000);
}
export function fmtExam(x?: Exam | null) {
  if (!x?.exam_date) return "";
  const d = new Date(x.exam_date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return [d, x.exam_time, x.mode === "pop" ? "Written (POP)" : "e-Exam (CBT)", x.venue].filter(Boolean).join(" · ");
}
export const levelLabel = (l: string) => (/^\d+$/.test(l) ? l + " level" : l);
export const LEVELS = ["100", "200", "300", "400", "500", "Postgraduate"];

/** Small, safe Markdown renderer (escapes first). */
export function md(src: string) {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const inline = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>").replace(/`(.+?)`/g, '<code>$1</code>');
  let out = "", list: "ul" | "ol" | null = null;
  const close = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const raw of esc(src || "").replace(/\r/g, "").split("\n")) {
    const l = raw.trim(); let m: RegExpMatchArray | null;
    if (!l) { close(); continue; }
    if ((m = l.match(/^#{1,6}\s+(.*)/))) { close(); out += `<h4>${inline(m[1])}</h4>`; }
    else if ((m = l.match(/^[-*•]\s+(.*)/))) { if (list !== "ul") { close(); out += "<ul>"; list = "ul"; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\d+[.)]\s+(.*)/))) { if (list !== "ol") { close(); out += "<ol>"; list = "ol"; } out += `<li>${inline(m[1])}</li>`; }
    else { close(); out += `<p>${inline(l)}</p>`; }
  }
  close();
  return out;
}

export function profIntro(c: Pick<Course, "code" | "title" | "school">, p?: Partial<Profile> | null, x?: Exam | null) {
  const school = c.school || p?.school || "the National Open University of Nigeria (NOUN)";
  const lvl = p?.level ? levelLabel(p.level) : "undergraduate";
  const d = daysTo(x?.exam_date);
  const ex = x?.exam_date ? ` The student's exam is ${x.mode === "pop" ? "a written (POP) paper" : "an e-exam (CBT)"} on ${fmtExam(x)}${d != null && d >= 0 ? `, ${d} days away` : ""}.` : "";
  return `You are a senior lecturer and chief examiner at ${school}. The course is ${c.code}: ${c.title}. The student${p?.name ? ", " + p.name + "," : ""} is at ${lvl}${p?.programme ? ", " + p.programme : ""}.${ex} Be accurate to the course material provided, warm but exacting, and plain-spoken. Use Nigerian context where the material does, and address the student by name only occasionally. When the material does not cover something, say so rather than inventing it.`;
}

export const estMinutes = (kind: string, n: number) => (kind === "theory" ? n * 12 : Math.max(5, Math.round(n * 0.75)));

export function normQ(q: any, mixKind: string): Question | null {
  if (!q || typeof q.q !== "string") return null;
  const type = q.type === "theory" ? "theory" : q.type === "fib" ? "fib" : "mcq";
  if (mixKind !== "cbt" && type !== mixKind) return null;
  const item: Question = { id: newId(), type, q: q.q.trim(), answer: "", explanation: String(q.explanation || ""), page: parseInt(q.page) || null, topic: String(q.topic || "General").trim().slice(0, 60) };
  if (type === "mcq") {
    if (!Array.isArray(q.options) || q.options.length < 3) return null;
    const ai = Number(q.answer); if (!(ai >= 0 && ai < q.options.length)) return null;
    const opts = q.options.map((t: unknown, i: number) => ({ t: String(t), ok: i === ai }));
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    item.options = opts.map((o: { t: string }) => o.t); item.answer = opts.findIndex((o: { ok: boolean }) => o.ok);
  } else if (type === "fib") {
    if (!q.answer) return null;
    item.answer = String(q.answer); item.accept = (Array.isArray(q.accept) ? q.accept : []).map(String);
    if (!/_{2,}/.test(item.q)) item.q += " ______";
  } else { item.answer = String(q.answer || ""); item.marks = 5; }
  return item;
}

export const normAns = (s: unknown) => String(s ?? "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\b(the|a|an)\b/g, " ").replace(/\s+/g, " ").trim();
export const hasAns = (a: unknown) => a !== undefined && a !== null && String(a).trim() !== "";

export function topicRows(items: MarkedItem[]) {
  const m: Record<string, { s: number; t: number; pages: Set<number> }> = {};
  for (const r of items) {
    const t = r.topic || "General";
    (m[t] ||= { s: 0, t: 0, pages: new Set() });
    m[t].s += r.score; m[t].t += r.max; if (r.page) m[t].pages.add(r.page);
  }
  return Object.entries(m).map(([k, v]) => ({ k, pct: Math.round((v.s / v.t) * 100), pages: [...v.pages].sort((a, b) => a - b) })).sort((a, b) => a.pct - b.pct);
}

export function verdict(p: number, weak: { k: string }[]) {
  const w = weak.slice(0, 3).map((t) => t.k).join(", ");
  if (p >= 70) return `Excellent work. You are at A standard on this material.${w ? " Tidy up " + w + " and you are exam-ready." : ""}`;
  if (p >= 50) return `A solid pass. ${w ? "Your marks are leaking on " + w + ". Reread those pages, then retake what you missed." : "Push for an A by retaking the questions you missed."}`;
  if (p >= 40) return `You scraped through. ${w ? "Focus on " + w + " before anything else." : "Go back over the pages linked below."}`;
  return `Not yet at pass level. ${w ? "Start with " + w + ": open the linked pages, ask the professor to explain them, then retake." : "Reread the pages linked below with the professor, then retake."}`;
}

export const KIND_LABEL: Record<string, string> = { cbt: "e-Exam", mcq: "Multiple choice", fib: "Fill-in-the-gap", theory: "Theory" };
export const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");
