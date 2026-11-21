"use client";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { supabaseBrowser } from "./supabase/client";

let lib: typeof import("pdfjs-dist") | null = null;
async function pdfjs() {
  if (!lib) { lib = await import("pdfjs-dist"); lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"; }
  return lib;
}
const docs = new Map<string, Promise<PDFDocumentProxy>>();
const texts = new Map<string, string>();

export async function openPdf(courseId: string, filePath: string) {
  if (docs.has(courseId)) return docs.get(courseId)!;
  const p = (async () => {
    const { data, error } = await supabaseBrowser().storage.from("materials").createSignedUrl(filePath, 60 * 60 * 6);
    if (error || !data) throw new Error("This course material could not be opened. It may still be awaiting approval.");
    const pj = await pdfjs();
    return pj.getDocument({ url: data.signedUrl, isEvalSupported: false, rangeChunkSize: 262144 }).promise;
  })();
  docs.set(courseId, p);
  p.catch(() => docs.delete(courseId));
  return p;
}
export async function openLocalPdf(file: File) {
  const pj = await pdfjs();
  return pj.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
}

export async function pageText(courseId: string, filePath: string, n: number) {
  const key = courseId + ":" + n;
  if (texts.has(key)) return texts.get(key)!;
  const doc = await openPdf(courseId, filePath);
  const tc = await (await doc.getPage(n)).getTextContent();
  let s = "";
  for (const it of tc.items as any[]) { s += it.str ?? ""; s += it.hasEOL ? "\n" : " "; }
  const t = s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  texts.set(key, t);
  return t;
}

export async function pageImage(courseId: string, filePath: string, n: number): Promise<Blob> {
  const doc = await openPdf(courseId, filePath);
  const pg = await doc.getPage(n);
  const v = pg.getViewport({ scale: 1 });
  const vp = pg.getViewport({ scale: Math.min(2, 1400 / v.width) });
  const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height;
  await pg.render({ canvasContext: cv.getContext("2d")!, viewport: vp }).promise;
  return new Promise((r) => cv.toBlob((b) => r(b!), "image/jpeg", 0.82));
}

/** Keep pages in order; if over budget, sample evenly across the range. */
export function packPages(pages: { n: number; t: string }[], budget = 140000) {
  const tot = pages.reduce((s, p) => s + p.t.length + 12, 0);
  let pick = pages;
  if (tot > budget) {
    const keep = Math.max(1, Math.floor((pages.length * budget) / tot)); const step = pages.length / keep;
    pick = []; for (let i = 0; i < keep; i++) pick.push(pages[Math.floor(i * step)]);
  }
  let out = "";
  for (const p of pick) { if (!p.t) continue; const chunk = `\n[Page ${p.n}]\n${p.t}\n`; if (out.length + chunk.length > budget) break; out += chunk; }
  return out;
}
