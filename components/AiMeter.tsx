"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { onAiUsage } from "@/lib/ai";
import type { AiStatus } from "@/lib/types";

export function useAiStatus() {
  const [s, setS] = useState<AiStatus | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().rpc("my_ai_status");
    if (data) setS(data as AiStatus);
  }, []);
  useEffect(() => {
    load();
    const off = onAiUsage(load);
    const t = setInterval(load, 5 * 60 * 1000);
    return () => { off(); clearInterval(t); };
  }, [load]);
  return s;
}
export const refillTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" }) : "");

export default function AiMeter() {
  const s = useAiStatus();
  if (!s) return null;
  if (s.pro) return <Link href="/upgrade" className="meter"><span className="chip acc">PRO · unlimited</span></Link>;
  const left = Math.max(0, s.limit - s.used);
  return (
    <Link href="/upgrade" className="meter" title={s.resets_at ? `Refills to ${s.limit} at ${refillTime(s.resets_at)}` : `${s.limit} AI actions every ${s.window_hours} hours`}>
      <span className="pip"><i style={{ width: `${s.limit ? (left / s.limit) * 100 : 0}%`, background: left <= 2 ? "var(--bad)" : undefined }} /></span>
      {left}/{s.limit}{s.resets_at && left < s.limit ? ` · refills ${refillTime(s.resets_at)}` : " AI"}
    </Link>
  );
}
