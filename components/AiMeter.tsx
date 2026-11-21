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
  useEffect(() => { load(); const off = onAiUsage(load); return () => { off(); }; }, [load]);
  return s;
}

export default function AiMeter() {
  const s = useAiStatus();
  if (!s) return null;
  if (s.pro) return <Link href="/upgrade" className="meter"><span className="chip acc">PRO</span></Link>;
  const left = Math.max(0, s.limit - s.used);
  return (
    <Link href="/upgrade" className="meter" title="Free AI actions left today">
      <span className="pip"><i style={{ width: `${s.limit ? (left / s.limit) * 100 : 0}%`, background: left <= 2 ? "var(--bad)" : undefined }} /></span>
      {left}/{s.limit} today
    </Link>
  );
}
