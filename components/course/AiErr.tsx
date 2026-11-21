"use client";
import Link from "next/link";
import { aiMessage, type AiError } from "@/lib/ai";

export default function AiErr({ e }: { e: unknown }) {
  if (!e) return null;
  const err = e as AiError;
  return (
    <div className="note err">
      {aiMessage(e)}
      {err.code === "limit" && <> <Link className="link" href="/upgrade">Get a pass</Link></>}
      {err.code === "auth" && <> <Link className="link" href="/login">Sign in</Link></>}
    </div>
  );
}
