"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "./client-api";
import type { BoardCardView, BoardColumnView } from "./board-client";

type DetailCard = BoardCardView & { description: string; listId: string; archived: boolean };
type ChecklistItem = { id: string; text: string; done: boolean; position: number };
type CardComment = { id: string; authorId: string; authorName: string; text: string; createdAt: string; canDelete?: boolean };
type BoardLabel = { id: string; name: string; color: string };

type Props = {
  boardId: string;
  cardId: string;
  columns: BoardColumnView[];
  initialPosition: number;
  onClose: () => void;
  onCardChange: (cardId: string, updates: Partial<BoardCardView> & { archived?: boolean }) => void;
  onMove: (cardId: string, listId: string, position: number) => Promise<void>;
};

export function CardDetail({ boardId, cardId, columns, initialPosition, onClose, onCardChange, onMove }: Props) {
  const [card, setCard] = useState<DetailCard | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<CardComment[]>([]);
  const [assignedLabels, setAssignedLabels] = useState<BoardLabel[]>([]);
  const [boardLabels, setBoardLabels] = useState<BoardLabel[]>([]);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#52765c");
  const [newItem, setNewItem] = useState("");
  const [newComment, setNewComment] = useState("");
  const [selectedList, setSelectedList] = useState("");
  const [selectedPosition, setSelectedPosition] = useState(initialPosition + 1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  function startSaving() {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setError("");
    return true;
  }

  function finishSaving() {
    savingRef.current = false;
    setSaving(false);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      apiRequest<DetailCard>(`/api/cards/${cardId}`),
      apiRequest<ChecklistItem[]>(`/api/cards/${cardId}/checklist`),
      apiRequest<CardComment[]>(`/api/cards/${cardId}/comments`),
      apiRequest<BoardLabel[]>(`/api/cards/${cardId}/labels`),
      apiRequest<BoardLabel[]>(`/api/boards/${boardId}/labels`),
    ]).then(([loadedCard, loadedItems, loadedComments, loadedLabels, allLabels]) => {
      if (!active) return;
      setCard(loadedCard);
      setTitleDraft(loadedCard.title);
      setDescriptionDraft(loadedCard.description);
      setItems(loadedItems);
      setItemDrafts({});
      setComments(loadedComments);
      setAssignedLabels(loadedLabels);
      setBoardLabels(allLabels);
      setSelectedList(loadedCard.listId);
      const index = columns.find((column) => column.id === loadedCard.listId)?.cards.findIndex((item) => item.id === cardId) ?? initialPosition;
      setSelectedPosition(Math.max(1, index + 1));
      setLoading(false);
    }).catch((requestError) => {
      if (!active) return;
      setError(requestError instanceof Error ? requestError.message : "We couldn’t load this card.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [boardId, cardId]);

  useEffect(() => {
    if (!loading) titleRef.current?.focus();
  }, [loading]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex='0']");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function reflectChecklist(nextItems: ChecklistItem[]) {
    onCardChange(cardId, { checklistDone: nextItems.filter((item) => item.done).length, checklistTotal: nextItems.length });
  }

  async function saveCardField<K extends "title" | "description" | "dueDate" | "archived">(field: K, value: DetailCard[K]) {
    if (!card) return;
    if (!startSaving()) return;
    const previous = card[field];
    setCard((current) => current ? { ...current, [field]: value } : current);
    if (field === "title" || field === "description" || field === "dueDate") onCardChange(cardId, { [field]: value });
    try {
      const saved = await apiRequest<DetailCard>(`/api/cards/${cardId}`, { method: "PATCH", body: JSON.stringify({ [field]: value }) });
      setCard((current) => current ? { ...current, ...saved } : current);
      if (field === "title" || field === "description" || field === "dueDate") onCardChange(cardId, { [field]: value });
      if (field === "archived") onCardChange(cardId, { archived: value as boolean });
      setTitleDraft(saved.title);
      setDescriptionDraft(saved.description);
    } catch (requestError) {
      setCard((current) => current ? { ...current, [field]: previous } : current);
      if (field === "title" || field === "description" || field === "dueDate") onCardChange(cardId, { [field]: previous as never });
      if (field === "title") setTitleDraft(String(previous));
      if (field === "description") setDescriptionDraft(String(previous));
      setError(requestError instanceof Error ? requestError.message : "We couldn’t save that change.");
    } finally {
      finishSaving();
    }
  }

  async function saveTitle() {
    const title = titleDraft.trim();
    if (!title) {
      setError("Card title is required.");
      setTitleDraft(card?.title ?? "");
      return;
    }
    if (title.length > 200) {
      setError("Card title must be 200 characters or fewer.");
      return;
    }
    if (title !== card?.title) await saveCardField("title", title);
  }

  async function saveDescription() {
    if (descriptionDraft !== card?.description) await saveCardField("description", descriptionDraft);
  }

  async function toggleLabel(label: BoardLabel) {
    if (!startSaving()) return;
    const assigned = assignedLabels.some((item) => item.id === label.id);
    const previous = assignedLabels;
    const next = assigned ? previous.filter((item) => item.id !== label.id) : [...previous, label];
    setAssignedLabels(next);
    onCardChange(cardId, { labels: next });
    try {
      await apiRequest(`/api/cards/${cardId}/labels`, {
        method: assigned ? "DELETE" : "POST",
        body: JSON.stringify({ labelId: label.id }),
      });
    } catch (requestError) {
      setAssignedLabels(previous);
      onCardChange(cardId, { labels: previous });
      setError(requestError instanceof Error ? requestError.message : "We couldn’t update labels.");
    } finally {
      finishSaving();
    }
  }

  async function createLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startSaving()) return;
    try {
      const label = await apiRequest<BoardLabel>(`/api/boards/${boardId}/labels`, {
        method: "POST",
        body: JSON.stringify({ name: newLabelName, color: newLabelColor, cardId }),
      });
      setBoardLabels((current) => [...current, label]);
      setNewLabelName("");
      const next = [...assignedLabels, label];
      setAssignedLabels(next);
      onCardChange(cardId, { labels: next });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn’t create that label.");
    } finally {
      finishSaving();
    }
  }

  async function addChecklistItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = newItem.trim();
    if (!text) return;
    if (!startSaving()) return;
    try {
      const created = await apiRequest<ChecklistItem>(`/api/cards/${cardId}/checklist`, { method: "POST", body: JSON.stringify({ text }) });
      const next = [...items, created];
      setItems(next);
      reflectChecklist(next);
      setNewItem("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn’t add that checklist item.");
    } finally {
      finishSaving();
    }
  }

  async function updateChecklistItem(item: ChecklistItem, updates: Partial<ChecklistItem>) {
    if (!startSaving()) return;
    const previous = items;
    const next = items.map((current) => current.id === item.id ? { ...current, ...updates } : current);
    setItems(next);
    reflectChecklist(next);
    try {
      await apiRequest(`/api/checklist-items/${item.id}`, { method: "PATCH", body: JSON.stringify(updates) });
      if ("text" in updates) setItemDrafts((current) => { const nextDrafts = { ...current }; delete nextDrafts[item.id]; return nextDrafts; });
    } catch (requestError) {
      setItems(previous);
      setItemDrafts((current) => { const nextDrafts = { ...current }; delete nextDrafts[item.id]; return nextDrafts; });
      reflectChecklist(previous);
      setError(requestError instanceof Error ? requestError.message : "We couldn’t update that checklist item.");
    } finally {
      finishSaving();
    }
  }

  async function deleteChecklistItem(item: ChecklistItem) {
    if (!startSaving()) return;
    const previous = items;
    const next = items.filter((current) => current.id !== item.id);
    setItems(next);
    reflectChecklist(next);
    try {
      await apiRequest<void>(`/api/checklist-items/${item.id}`, { method: "DELETE" });
    } catch (requestError) {
      setItems(previous);
      reflectChecklist(previous);
      setError(requestError instanceof Error ? requestError.message : "We couldn’t delete that checklist item.");
    } finally {
      finishSaving();
    }
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = newComment.trim();
    if (!text) return;
    if (!startSaving()) return;
    try {
      const created = await apiRequest<CardComment>(`/api/cards/${cardId}/comments`, { method: "POST", body: JSON.stringify({ text }) });
      const next = [...comments, created];
      setComments(next);
      onCardChange(cardId, { commentCount: next.length });
      setNewComment("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn’t add that comment.");
    } finally {
      finishSaving();
    }
  }

  async function deleteComment(comment: CardComment) {
    if (!startSaving()) return;
    const previous = comments;
    const next = comments.filter((item) => item.id !== comment.id);
    setComments(next);
    onCardChange(cardId, { commentCount: next.length });
    try {
      await apiRequest<void>(`/api/comments/${comment.id}`, { method: "DELETE" });
    } catch (requestError) {
      setComments(previous);
      onCardChange(cardId, { commentCount: previous.length });
      setError(requestError instanceof Error ? requestError.message : "We couldn’t delete that comment.");
    } finally {
      finishSaving();
    }
  }

  async function moveCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startSaving()) return;
    try {
      await onMove(cardId, selectedList, selectedPosition - 1);
      setCard((current) => current ? { ...current, listId: selectedList } : current);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn’t move that card.");
    } finally {
      finishSaving();
    }
  }

  const selectedColumn = columns.find((column) => column.id === selectedList);
  const availablePositions = (selectedColumn?.cards.length ?? 0) + (selectedColumn?.cards.some((item) => item.id === cardId) ? 0 : 1);
  const checklistPercent = items.length ? Math.round(items.filter((item) => item.done).length / items.length * 100) : 0;

  return (
    <div className="card-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="card-dialog" role="dialog" aria-modal="true" aria-labelledby="card-dialog-title" ref={dialogRef}>
        <header className="card-dialog-header">
          <span className="eyebrow" id="card-dialog-title">Card details</span>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close card details">×</button>
        </header>
        {loading ? <p className="detail-loading">Loading card details…</p> : error && !card ? <p className="app-error" role="alert">{error}</p> : card && (
          <div className="card-dialog-content">
            {error && <p className="app-error detail-error" role="alert">{error}</p>}
            <label className="detail-field detail-title-field" htmlFor="card-detail-title">Title</label>
            <textarea id="card-detail-title" ref={titleRef} className="detail-title-input" rows={2} disabled={saving} value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} onBlur={() => void saveTitle()} />

            <label className="detail-field" htmlFor="card-detail-description">Description</label>
            <textarea id="card-detail-description" className="detail-description" maxLength={10000} disabled={saving} value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} onBlur={() => void saveDescription()} placeholder="Add more detail…" />

            <section className="detail-section" aria-labelledby="labels-heading">
              <h3 id="labels-heading">Labels</h3>
              <div className="label-picker">{boardLabels.map((label) => <button type="button" disabled={saving} className={`label-toggle${assignedLabels.some((item) => item.id === label.id) ? " is-selected" : ""}`} key={label.id} onClick={() => void toggleLabel(label)}><span className="label-swatch" style={{ backgroundColor: label.color }} />{label.name}<span aria-hidden="true">{assignedLabels.some((item) => item.id === label.id) ? "✓" : "+"}</span></button>)}</div>
              <form className="new-label-form" onSubmit={(event) => void createLabel(event)}>
                <label className="visually-hidden" htmlFor="new-label-name">New label name</label>
                <input id="new-label-name" maxLength={80} disabled={saving} value={newLabelName} onChange={(event) => setNewLabelName(event.target.value)} placeholder="New label name" required />
                <label className="visually-hidden" htmlFor="new-label-color">New label color</label>
                <input id="new-label-color" type="color" disabled={saving} value={newLabelColor} onChange={(event) => setNewLabelColor(event.target.value)} />
                <button className="button-small" type="submit" disabled={saving}>{saving ? "Saving…" : "Create label"}</button>
              </form>
            </section>

            <section className="detail-section due-field" aria-labelledby="due-heading">
              <h3 id="due-heading">Due date</h3>
              <div className="due-input-row"><input aria-label="Due date" type="date" disabled={saving} value={card.dueDate ? new Date(card.dueDate).toISOString().slice(0, 10) : ""} onChange={(event) => void saveCardField("dueDate", event.target.value || null)} /><button className="button-quiet" type="button" disabled={!card.dueDate || saving} onClick={() => void saveCardField("dueDate", null)}>Clear date</button></div>
            </section>

            <section className="detail-section" aria-labelledby="checklist-heading">
              <div className="detail-section-heading"><h3 id="checklist-heading">Checklist <span>{items.filter((item) => item.done).length}/{items.length}</span></h3></div>
              <div className="progress-track" role="progressbar" aria-label="Checklist progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={checklistPercent}><span style={{ width: `${checklistPercent}%` }} /></div>
              <div className="checklist-items">{items.map((item) => <div className="checklist-row" key={item.id}><label className="checklist-checkbox"><input type="checkbox" aria-label={`Mark ${item.text} ${item.done ? "incomplete" : "complete"}`} disabled={saving} checked={item.done} onChange={(event) => void updateChecklistItem(item, { done: event.target.checked })} /></label><input className={item.done ? "checklist-done" : ""} aria-label="Checklist item" maxLength={500} disabled={saving} value={itemDrafts[item.id] ?? item.text} onChange={(event) => setItemDrafts((current) => ({ ...current, [item.id]: event.target.value }))} onBlur={() => { const text = (itemDrafts[item.id] ?? item.text).trim(); if (text && text !== item.text) void updateChecklistItem(item, { text }); else setItemDrafts((current) => { const nextDrafts = { ...current }; delete nextDrafts[item.id]; return nextDrafts; }); }} /><button className="icon-button checklist-delete" type="button" disabled={saving} aria-label={`Delete ${item.text}`} onClick={() => void deleteChecklistItem(item)}>×</button></div>)}</div>
              <form className="detail-inline-form" onSubmit={(event) => void addChecklistItem(event)}><input aria-label="New checklist item" maxLength={500} disabled={saving} value={newItem} onChange={(event) => setNewItem(event.target.value)} placeholder="Add an item…" /><button className="button-small" type="submit" disabled={saving || !newItem.trim()}>{saving ? "Saving…" : "Add"}</button></form>
            </section>

            <section className="detail-section" aria-labelledby="comments-heading">
              <h3 id="comments-heading">Comments <span>{comments.length}</span></h3>
              <div className="comment-list">{comments.map((comment) => <article className="comment-item" key={comment.id}><div className="comment-byline"><strong>{comment.authorName}</strong><time dateTime={comment.createdAt}>{new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }).format(new Date(comment.createdAt))}</time>{comment.canDelete && <button className="button-quiet danger-text" type="button" disabled={saving} onClick={() => void deleteComment(comment)}>Delete</button>}</div><p>{comment.text}</p></article>)}</div>
              <form className="comment-form" onSubmit={(event) => void addComment(event)}><label className="visually-hidden" htmlFor="new-card-comment">Add a comment</label><textarea id="new-card-comment" maxLength={5000} disabled={saving} value={newComment} onChange={(event) => setNewComment(event.target.value)} placeholder="Write a comment…" /><button className="button-small" type="submit" disabled={saving || !newComment.trim()}>{saving ? "Saving…" : "Add comment"}</button></form>
            </section>

            {!card.archived && <section className="detail-section" aria-labelledby="move-heading">
              <h3 id="move-heading">Move to</h3>
              <form className="move-card-form" onSubmit={(event) => void moveCard(event)}><label><span>List</span><select disabled={saving} value={selectedList} onChange={(event) => { setSelectedList(event.target.value); setSelectedPosition(1); }}>{columns.map((column) => <option value={column.id} key={column.id}>{column.name}</option>)}</select></label><label><span>Position</span><select disabled={saving} value={Math.min(selectedPosition, Math.max(1, availablePositions))} onChange={(event) => setSelectedPosition(Number(event.target.value))}>{Array.from({ length: Math.max(1, availablePositions) }, (_, index) => <option value={index + 1} key={index}>{index + 1}</option>)}</select></label><button className="button-small" type="submit" disabled={saving || !selectedList}>{saving ? "Moving…" : "Move card"}</button></form>
            </section>}

            <footer className="card-dialog-footer"><button className="button-quiet danger-text" type="button" disabled={card.archived || saving} onClick={() => void saveCardField("archived", true)}>{card.archived ? "Archived" : "Archive card"}</button><span>Changes save as you edit.</span></footer>
          </div>
        )}
      </section>
    </div>
  );
}
