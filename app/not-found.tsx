import Link from "next/link";
export default function NotFound() {
  return <main className="wrap" style={{ paddingTop: 80 }}><div className="empty"><h2>Not on the shelf</h2><p>This page or course does not exist, or it is still awaiting review.</p><Link className="btn pri" href="/library">Back to the library</Link></div></main>;
}
