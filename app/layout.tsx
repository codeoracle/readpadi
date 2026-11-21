import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Source_Serif_4, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "800"], variable: "--font-display", display: "swap" });
const read = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], style: ["normal", "italic"], variable: "--font-read", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://study-carrel.netlify.app"),
  title: { default: "Study Carrel", template: "%s · Study Carrel" },
  description: "Read your course materials with an AI professor, sit CBT-style practice exams set from the material, and track your grade before the exam.",
  openGraph: { title: "Study Carrel", description: "Read, ask, test and pass. Practice exams set from your own course materials.", type: "website" },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#EEF2EF" }, { media: "(prefers-color-scheme: dark)", color: "#0F1512" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${read.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
