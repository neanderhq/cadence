"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { SignOutButton } from "../sign-out-button";
import { apiRequest } from "./client-api";

export type DashboardBoard = { id: string; name: string; listCount: number; cardCount: number };
type Props = { initialBoards: DashboardBoard[]; userName: string };

export function DashboardClient({ initialBoards, userName }: Props) {
  const [boards, setBoards] = useState(initialBoards);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function createBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      setError("Give your board a name before creating it.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const created = await apiRequest<{ id: string; name: string }>("/api/boards", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setBoards((current) => [...current, { ...created, listCount: 0, cardCount: 0 }]);
      setNewName("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn’t create that board.");
    } finally {
      setBusy(false);
    }
  }

  async function renameBoard(event: FormEvent<HTMLFormElement>, boardId: string) {
    event.preventDefault();
    const name = editingName.trim();
    if (!name) {
      setError("Board name is required.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const updated = await apiRequest<{ id: string; name: string }>(`/api/boards/${boardId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setBoards((current) => current.map((board) => board.id === boardId ? { ...board, name: updated.name } : board));
      setEditingId(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn’t rename that board.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteBoard(board: DashboardBoard) {
    if (!window.confirm(`Delete “${board.name}” and all of its lists and cards? This cannot be undone.`)) return;
    setError("");
    setBusy(true);
    try {
      await apiRequest<void>(`/api/boards/${board.id}`, { method: "DELETE" });
      setBoards((current) => current.filter((item) => item.id !== board.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn’t delete that board.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-main workspace-page">
      <div className="app-shell">
        <header className="topbar">
          <Link href="/" className="brand"><span className="brand-mark">C</span><span>Content Board</span></Link>
          <div className="topbar-actions"><span className="private-pill"><span /> Private workspace</span><SignOutButton /></div>
        </header>

        <section className="dashboard-intro">
          <div>
            <p className="eyebrow">Your workspace</p>
            <h1>Good to see you, {userName.split(" ")[0]}.</h1>
            <p>Keep every campaign moving, from the first spark to publish day.</p>
          </div>
          <div className="intro-note"><span className="intro-note-icon">✳</span><span>Your boards are private to you.</span></div>
        </section>

        {error && <p className="app-error" role="alert">{error}</p>}

        <section className="workspace-section" aria-labelledby="boards-heading">
          <div className="section-heading">
            <div><h2 id="boards-heading">Your boards</h2><p>A clear view of what your team is creating.</p></div>
            <span className="board-total">{boards.length} {boards.length === 1 ? "board" : "boards"}</span>
          </div>
          <div className="board-grid">
            {boards.map((board, index) => (
              <article className={`board-tile board-tile-${index % 4}`} key={board.id}>
                <div className="board-tile-art" aria-hidden="true"><span /><span /><span /></div>
                <div className="board-tile-body">
                  {editingId === board.id ? (
                    <form className="rename-board-form" onSubmit={(event) => void renameBoard(event, board.id)}>
                      <label className="visually-hidden" htmlFor={`rename-${board.id}`}>Board name</label>
                      <input id={`rename-${board.id}`} autoFocus maxLength={120} value={editingName} onChange={(event) => setEditingName(event.target.value)} />
                      <div className="inline-actions"><button className="button-small" type="submit" disabled={busy}>Save</button><button className="button-quiet" type="button" onClick={() => setEditingId(null)}>Cancel</button></div>
                    </form>
                  ) : (
                    <>
                      <Link className="board-tile-link" href={`/boards/${board.id}`}>
                        <span className="board-tile-title">{board.name}</span>
                        <span className="board-tile-meta">{board.listCount} lists <span>·</span> {board.cardCount} cards</span>
                      </Link>
                      <div className="board-tile-actions">
                        <button type="button" className="button-quiet" onClick={() => { setEditingId(board.id); setEditingName(board.name); setError(""); }}>Rename</button>
                        <button type="button" className="button-quiet danger-text" disabled={busy} onClick={() => void deleteBoard(board)}>Delete</button>
                      </div>
                    </>
                  )}
                </div>
              </article>
            ))}

            <article className="create-board-tile">
              <div className="create-board-icon" aria-hidden="true">＋</div>
              <h3>Create a board</h3>
              <p>Start a new space for a campaign or content series.</p>
              <form onSubmit={(event) => void createBoard(event)}>
                <label className="visually-hidden" htmlFor="new-board-name">Board name</label>
                <input id="new-board-name" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. Product launch" maxLength={120} required />
                <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create board"}</button>
              </form>
            </article>
          </div>
          {boards.length === 0 && <p className="empty-workspace">No boards yet. Create one to start planning.</p>}
        </section>
        <footer className="workspace-footer"><span>Small steps make great stories.</span><span>Content Board · Private by design</span></footer>
      </div>
    </main>
  );
}
