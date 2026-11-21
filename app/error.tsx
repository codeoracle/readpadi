"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <main className="wrap" style={{ paddingTop: 80 }}><div className="empty"><h2>Something went wrong</h2><p>Check your connection and try again.</p><button className="btn pri" onClick={reset}>Try again</button></div></main>;
}
