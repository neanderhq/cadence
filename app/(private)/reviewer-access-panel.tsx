"use client";

import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "./client-api";

type Reviewer = { id: string; name: string };

export function ReviewerAccessPanel({ boardId, initialReviewer }: { boardId: string; initialReviewer: Reviewer | null }) {
  const [open, setOpen] = useState(false);
  const [reviewer, setReviewer] = useState(initialReviewer);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const revokeRef = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);

  useLayoutEffect(() => {
    if (open && !busy) (reviewer ? revokeRef : inputRef).current?.focus();
  }, [open, busy, reviewer]);

  async function changeAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const removing = Boolean(reviewer);
    const reviewerId = reviewer?.id ?? draft.trim();
    if (!reviewerId) {
      setError("Enter the reviewer ID from their Cadence workspace.");
      inputRef.current?.focus();
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await apiRequest<Reviewer | undefined>(`/api/boards/${boardId}/reviewer`, {
        method: removing ? "DELETE" : "POST", body: JSON.stringify({ reviewerId }),
      });
      setReviewer(result ?? null);
      setDraft("");
      setStatus(result ? `${result.name} can now review this board.` : "Reviewer access revoked.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn’t update access. Try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <>
    <button className="button-quiet reviewer-access-toggle" type="button" aria-expanded={open} aria-controls="reviewer-access-panel" onClick={() => setOpen((visible) => !visible)}>Reviewer access</button>
    {open && <section className="reviewer-access-panel" id="reviewer-access-panel" aria-labelledby="reviewer-access-heading">
      <div>
        <h2 id="reviewer-access-heading">Private reviewer access</h2>
        <p>One Cadence account can read active cards and leave comments. You can revoke access anytime.</p>
      </div>
      <form className="reviewer-access-form" onSubmit={(event) => void changeAccess(event)}>
        {reviewer ? <div className="reviewer-current">
          <p><strong>{reviewer.name}</strong><span>Current reviewer</span></p>
          <button ref={revokeRef} className="button-quiet danger-text" type="submit" disabled={busy}>{busy ? "Revoking…" : "Revoke access"}</button>
        </div> : <>
          <label htmlFor="reviewer-account-id">Reviewer ID</label>
          <div className="reviewer-id-controls">
            <input ref={inputRef} id="reviewer-account-id" value={draft} maxLength={128} disabled={busy} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? "reviewer-id-error" : "reviewer-id-help"} onChange={(event) => { setDraft(event.target.value); setError(""); }} />
            <button className="button-small" type="submit" disabled={busy}>{busy ? "Granting…" : "Grant access"}</button>
          </div>
          <span id="reviewer-id-help">Ask your reviewer for the ID shown in their Cadence workspace.</span>
        </>}
        {error && <span className="field-error" id="reviewer-id-error" role="alert">{error}</span>}
        {status && <p className="reviewer-access-status" role="status">{status}</p>}
      </form>
    </section>}
  </>;
}
