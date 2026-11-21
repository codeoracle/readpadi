"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { levelInfo, type MyLevel } from "@/lib/levels";

export function useMyLevel() {
  const [l, setL] = useState<MyLevel | null>(null);
  useEffect(() => { supabaseBrowser().rpc("my_level").then(({ data }: { data: MyLevel | null }) => data && setL(data)); }, []);
  return l;
}

export default function LevelCard() {
  const l = useMyLevel();
  if (!l) return null;
  const info = levelInfo(l.xp);
  return (
    <Link href="/ranks" className="panel" style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: 14, alignItems: "center", textDecoration: "none", marginBottom: 16 }}>
      <div className="seal" style={{ width: 46, height: 46, fontSize: 15 }}>L{info.n}</div>
      <div style={{ minWidth: 0, display: "grid", gap: 6 }}>
        <div className="meta"><b>{info.name}</b><span className="hint">{l.xp.toLocaleString()} XP{info.next ? ` · ${info.toNext.toLocaleString()} to ${info.next.name}` : " · top level"}</span></div>
        <div className="bar"><i style={{ width: `${info.pct}%` }} /></div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{l.streak}<span style={{ fontSize: 13 }}> day{l.streak === 1 ? "" : "s"}</span></div>
        <div className="hint">{l.today_xp > 0 ? "streak kept today" : l.streak ? "study today to keep it" : "start a streak"}</div>
      </div>
    </Link>
  );
}
