"use client";

import { useRef, useState, type FormEvent } from "react";
import type { BoardColumnView } from "./board-client";

type Props = {
  title: string;
  listId: string;
  columns: BoardColumnView[];
  busy: boolean;
  onCopy: (title: string, listId: string, requestId: string) => Promise<void>;
};

export function BriefCopyForm({ title, listId, columns, busy, onCopy }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(title);
  const [destination, setDestination] = useState(listId);
  const [error, setError] = useState<{ message: string; invalidTitle?: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef("");

  function showForm() {
    requestId.current = crypto.randomUUID();
    setDraft(title);
    setDestination(listId);
    setError(null);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function cancel() {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const name = draft.trim();
    if (!name || name.length > 200) {
      setError({ message: name ? "Brief title must be 200 characters or fewer." : "Brief title is required.", invalidTitle: true });
      inputRef.current?.focus();
      return;
    }
    setError(null);
    try {
      await onCopy(name, destination, requestId.current);
    } catch (failure) {
      setError({ message: failure instanceof Error ? failure.message : "Couldn’t copy the brief. Try again." });
    }
  }

  return <section className="detail-section brief-copy-section">
    {!open ? <button className="button-quiet brief-copy-trigger" type="button" ref={triggerRef} onClick={showForm} disabled={busy}>Duplicate as new brief</button> :
      <form aria-labelledby="brief-copy-heading" className="brief-copy-form" onSubmit={(event) => void submit(event)}>
        <h3 id="brief-copy-heading">Duplicate as new brief</h3>
        <p>Keep the description, labels and checklist. The new brief starts with an unchecked checklist and no dates or comments.</p>
        <label htmlFor="brief-copy-title">Brief title</label>
        <input id="brief-copy-title" ref={inputRef} value={draft} maxLength={200} disabled={busy} aria-invalid={error?.invalidTitle} aria-describedby={error ? "brief-copy-error" : undefined} onChange={(event) => { setDraft(event.target.value); setError(null); }} />
        <label htmlFor="brief-copy-list">Destination list</label>
        <select id="brief-copy-list" value={destination} disabled={busy} onChange={(event) => { setDestination(event.target.value); setError(null); }}>
          {columns.map((column) => <option value={column.id} key={column.id}>{column.name}</option>)}
        </select>
        {error && <span className="field-error" id="brief-copy-error" role="alert">{error.message}</span>}
        <div className="inline-actions">
          <button className="button-small" type="submit" disabled={busy}>{busy ? "Creating…" : "Create brief"}</button>
          <button className="button-quiet" type="button" disabled={busy} onClick={cancel}>Cancel</button>
        </div>
      </form>}
  </section>;
}
