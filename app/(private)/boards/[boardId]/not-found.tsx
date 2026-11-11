import Link from "next/link";

export default function BoardNotFound() {
  return (
    <main className="app-main not-found-page">
      <div className="not-found-card">
        <span className="not-found-mark" aria-hidden="true">?</span>
        <p className="eyebrow">Private workspace</p>
        <h1>Board not found</h1>
        <p>This board may have been deleted, or it isn’t part of your workspace.</p>
        <Link className="button-link" href="/">Back to your boards</Link>
      </div>
    </main>
  );
}
