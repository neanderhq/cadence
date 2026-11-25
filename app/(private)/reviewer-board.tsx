"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { SignOutButton } from "../sign-out-button";
import type { BoardView } from "./board-client";
import { CardDetail } from "./card-detail";

export function ReviewerBoard({ board }: { board: BoardView }) {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function closeCard() {
    setActiveCardId(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return <main className="app-main board-page reviewer-board">
    <header className="topbar board-topbar">
      <Link href="/" className="brand"><span className="brand-mark">C</span><span>Cadence</span></Link>
      <SignOutButton />
    </header>
    <section className="board-heading">
      <div><p className="eyebrow">Shared with you</p><h1>{board.name}</h1><p>You can read active cards and leave comments.</p></div>
      <span className="reviewer-badge">Reviewer</span>
    </section>
    <section className="reviewer-lists" aria-label={`${board.name} lists`}>
      {board.columns.map((column) => <section className="reviewer-list" key={column.id}>
        <h2>{column.name}</h2>
        {column.cards.length ? <ul>{column.cards.map((card) => <li className="task-card" key={card.id}>
          <button className="task-card-open" type="button" onClick={(event) => { triggerRef.current = event.currentTarget; setActiveCardId(card.id); }}>
            <span className="task-card-title">{card.title}</span>
            {card.dueDate && <span className="due-badge">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(card.dueDate))}</span>}
          </button>
        </li>)}</ul> : <p>No active cards.</p>}
      </section>)}
      {!board.columns.length && <p className="archive-empty">No lists to review yet.</p>}
    </section>
    <footer className="board-footer"><Link href="/">← Back to workspace</Link></footer>
    {activeCardId && <CardDetail key={activeCardId} cardId={activeCardId} boardId={board.id} columns={board.columns} initialPosition={0} reviewOnly onClose={closeCard} />}
  </main>;
}
