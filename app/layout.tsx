import { BRAND } from "@/lib/brand";
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Source_Serif_4, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "800"], variable: "--font-display", display: "swap" });
const read = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], style: ["normal", "italic"], variable: "--font-read", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.siteUrl),
  title: { default: `${BRAND.name} · ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  openGraph: { title: BRAND.name, description: "Read, ask, test and pass. Practice exams set from your own course materials.", type: "website", siteName: BRAND.name },
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
