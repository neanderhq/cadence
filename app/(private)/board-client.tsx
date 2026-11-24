"use client";

import Link from "next/link";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { SignOutButton } from "../sign-out-button";
import { apiRequest } from "./client-api";
import { CardDetail } from "./card-detail";

export type BoardCardView = {
  id: string;
  title: string;
  description: string;
  dueDate: string | null;
  labels: { id: string; name: string; color: string }[];
  checklistDone: number;
  checklistTotal: number;
  commentCount: number;
};

export type ArchivedCardView = BoardCardView & { listId: string; listName: string; archivedAt: string | null };
export type BoardColumnView = { id: string; name: string; position: number; cards: BoardCardView[] };
export type BoardView = { id: string; name: string; columns: BoardColumnView[] };

type Props = { initialBoard: BoardView; initialArchivedCards: ArchivedCardView[] };
const CARD_TRIGGER_PREFIX = "open-card-";

type SortableCardProps = {
  card: BoardCardView;
  column: BoardColumnView;
  columns: BoardColumnView[];
  busy: boolean;
  onOpen: () => void;
  onMove: (cardId: string, listId: string, position: number) => Promise<void>;
  formatDueDate: (value: string) => { label: string; overdue: boolean };
};

function SortableCard({ card, column, columns, busy, onOpen, onMove, formatDueDate }: SortableCardProps) {
  const index = column.cards.findIndex((item) => item.id === card.id);
  const [targetListId, setTargetListId] = useState(column.id);
  const [targetPosition, setTargetPosition] = useState(index + 1);
  const [moveError, setMoveError] = useState("");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", listId: column.id },
    disabled: busy,
  });

  useEffect(() => {
    setTargetListId(column.id);
    setTargetPosition(index + 1);
  }, [column.id, index]);

  const targetColumn = columns.find((item) => item.id === targetListId);
  const positionCount = (targetColumn?.cards.length ?? 0) + (targetColumn?.cards.some((item) => item.id === card.id) ? 0 : 1);
  const due = card.dueDate ? formatDueDate(card.dueDate) : null;

  async function submitMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMoveError("");
    try {
      await onMove(card.id, targetListId, targetPosition - 1);
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : "We couldn’t move that card.");
    }
  }

  return (
    <article ref={setNodeRef} className={`task-card${isDragging ? " is-dragging" : ""}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <div className="task-card-topline">
        <button className="card-drag-handle" type="button" aria-label={`Drag ${card.title}`} title="Drag to reorder or move" {...attributes} {...listeners}>⠿</button>
        {card.labels.length > 0 && <div className="label-row">{card.labels.map((label) => <span className="label-chip" style={{ backgroundColor: label.color }} key={label.id}>{label.name}</span>)}</div>}
      </div>
      <button id={CARD_TRIGGER_PREFIX + card.id} className="task-card-open" type="button" onClick={onOpen}><span className="task-card-title">{card.title}</span>
        {(due || card.checklistTotal > 0 || card.commentCount > 0) && <span className="card-meta">
          {due && <span className={`due-badge${due.overdue ? " is-overdue" : ""}`}><span aria-hidden="true">◷</span> {due.label}</span>}
          {card.checklistTotal > 0 && <span className="meta-count" aria-label={`${card.checklistDone} of ${card.checklistTotal} checklist items complete`}><span aria-hidden="true">☑</span> {card.checklistDone}/{card.checklistTotal}</span>}
          {card.commentCount > 0 && <span className="meta-count" aria-label={`${card.commentCount} comments`}><span aria-hidden="true">▤</span> {card.commentCount}</span>}
        </span>}
      </button>
      <details className="card-move-details">
        <summary>Move to</summary>
        <form className="card-move-form" onSubmit={(event) => void submitMove(event)}>
          <label><span>List</span><select disabled={busy} value={targetListId} onChange={(event) => { setTargetListId(event.target.value); setTargetPosition(1); }}>{columns.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label><span>Position</span><select disabled={busy} value={Math.min(targetPosition, Math.max(1, positionCount))} onChange={(event) => setTargetPosition(Number(event.target.value))}>{Array.from({ length: Math.max(1, positionCount) }, (_, itemIndex) => <option value={itemIndex + 1} key={itemIndex}>{itemIndex + 1}</option>)}</select></label>
          <button className="button-small" type="submit" disabled={busy}>Move</button>
        </form>
        {moveError && <span className="field-error" role="alert">{moveError}</span>}
      </details>
    </article>
  );
}

function DroppableCardStack({ column, children }: { column: BoardColumnView; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `list:${column.id}`, data: { type: "list", listId: column.id } });
  return <div ref={setNodeRef} className={`card-stack${isOver ? " is-drop-target" : ""}`}>{children}</div>;
}

export function BoardClient({ initialBoard, initialArchivedCards }: Props) {
  const board = initialBoard;
  const dndContextId = useId();
  const [columns, setColumns] = useState(initialBoard.columns);
  const [archivedCards, setArchivedCards] = useState(initialArchivedCards);
  const [archiveView, setArchiveView] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [dueFilter, setDueFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [showAddList, setShowAddList] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");
  const [cardDrafts, setCardDrafts] = useState<Record<string, string>>({});
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const boardHeadingRef = useRef<HTMLHeadingElement>(null);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function startBusy() {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  }

  function finishBusy() {
    busyRef.current = false;
    setBusy(false);
  }

  useEffect(() => {
    function closeMenuFromOutside(event: PointerEvent) {
      if (!(event.target instanceof Element) || !event.target.closest(".list-menu")) setOpenMenuId(null);
    }
    function closeMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenuId(null);
    }
    document.addEventListener("pointerdown", closeMenuFromOutside);
    document.addEventListener("keydown", closeMenuOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenuFromOutside);
      document.removeEventListener("keydown", closeMenuOnEscape);
    };
  }, []);

  async function addList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newListName.trim();
    if (!name) {
      setError("List name is required.");
      return;
    }
    if (!startBusy()) return;
    setError("");
    try {
      const created = await apiRequest<BoardColumnView>(`/api/boards/${board.id}/lists`, { method: "POST", body: JSON.stringify({ name }) });
      setColumns((current) => [...current, { ...created, cards: [] }].sort((a, b) => a.position - b.position));
      setNewListName("");
      setShowAddList(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn’t create that list.");
    } finally {
      finishBusy();
    }
  }

  async function renameList(event: FormEvent<HTMLFormElement>, listId: string) {
    event.preventDefault();
    const name = renamingValue.trim();
    if (!name) {
      setError("List name is required.");
      return;
    }
    if (!startBusy()) return;
    setError("");
    try {
      await apiRequest(`/api/lists/${listId}`, { method: "PATCH", body: JSON.stringify({ name }) });
      setColumns((current) => current.map((column) => column.id === listId ? { ...column, name } : column));
      setRenamingId(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn’t rename that list.");
    } finally {
      finishBusy();
    }
  }

  async function deleteList(column: BoardColumnView) {
    if (!window.confirm(`Delete “${column.name}” and its ${column.cards.length} cards? This cannot be undone.`)) return;
    if (!startBusy()) return;
    setError("");
    try {
      await apiRequest<void>(`/api/lists/${column.id}`, { method: "DELETE" });
      setColumns((current) => current.filter((item) => item.id !== column.id).map((item, position) => ({ ...item, position })));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn’t delete that list.");
    } finally {
      finishBusy();
    }
  }

  async function saveOrder(nextColumns: BoardColumnView[]) {
    if (!startBusy()) return;
    const previous = columns;
    setColumns(nextColumns.map((column, position) => ({ ...column, position })));
    setError("");
    try {
      await apiRequest(`/api/boards/${board.id}/lists/reorder`, { method: "POST", body: JSON.stringify({ listIds: nextColumns.map((column) => column.id) }) });
    } catch (requestError) {
      setColumns(previous);
      setError(requestError instanceof Error ? requestError.message : "We couldn’t save the list order.");
    } finally {
      finishBusy();
    }
  }

  function moveColumn(listId: string, targetIndex: number) {
    const sourceIndex = columns.findIndex((column) => column.id === listId);
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= columns.length || sourceIndex === targetIndex) return;
    const next = [...columns];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    void saveOrder(next);
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData("text/plain");
    const sourceIndex = columns.findIndex((column) => column.id === draggedId);
    const targetIndex = columns.findIndex((column) => column.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    moveColumn(draggedId, targetIndex);
  }

  async function addCard(event: FormEvent<HTMLFormElement>, column: BoardColumnView) {
    event.preventDefault();
    const input = event.currentTarget.querySelector("input");
    function showError(message: string) {
      setCardErrors((current) => ({ ...current, [column.id]: message }));
      input?.focus();
    }
    const title = (cardDrafts[column.id] ?? "").trim();
    if (!title) return showError("Card title is required.");
    if (title.length > 200) return showError("Card title must be 200 characters or fewer.");
    if (!startBusy()) return;
    setCardErrors((current) => ({ ...current, [column.id]: "" }));
    setError("");
    try {
      const created = await apiRequest<{ id: string; title: string; description: string; dueDate: string | null }>(`/api/lists/${column.id}/cards`, { method: "POST", body: JSON.stringify({ title }) });
      setColumns((current) => current.map((item) => item.id === column.id ? { ...item, cards: [...item.cards, { ...created, labels: [], checklistDone: 0, checklistTotal: 0, commentCount: 0 }] } : item));
      setCardDrafts((current) => ({ ...current, [column.id]: "" }));
    } catch (requestError) {
      showError(requestError instanceof Error ? requestError.message : "We couldn’t add that card.");
    } finally {
      finishBusy();
    }
  }

  function applyOptimisticMove(source: BoardColumnView[], cardId: string, destinationId: string, position: number) {
    const next = source.map((column) => ({ ...column, cards: [...column.cards] }));
    const sourceColumn = next.find((column) => column.cards.some((card) => card.id === cardId));
    const destination = next.find((column) => column.id === destinationId);
    if (!sourceColumn || !destination) return source;
    const sourceIndex = sourceColumn.cards.findIndex((card) => card.id === cardId);
    const [card] = sourceColumn.cards.splice(sourceIndex, 1);
    destination.cards.splice(Math.max(0, Math.min(position, destination.cards.length)), 0, card);
    return next;
  }

  async function moveCard(cardId: string, destinationId: string, position: number) {
    if (busyRef.current) throw new Error("Another change is still saving. Please wait and try again.");
    const previous = columns;
    const next = applyOptimisticMove(previous, cardId, destinationId, position);
    if (next === previous) return;
    if (!startBusy()) throw new Error("Another change is still saving. Please wait and try again.");
    setColumns(next);
    setError("");
    try {
      await apiRequest(`/api/cards/${cardId}/move`, { method: "POST", body: JSON.stringify({ listId: destinationId, position }) });
    } catch (requestError) {
      setColumns(previous);
      const message = requestError instanceof Error ? requestError.message : "We couldn’t move that card.";
      setError(message);
      throw new Error(message);
    } finally {
      finishBusy();
    }
  }

  function finishCardDrag(event: DragEndEvent) {
    const cardId = String(event.active.id);
    setDraggingCardId(null);
    if (busyRef.current) return;
    if (!event.over) return;
    const overId = String(event.over.id);
    if (cardId === overId) return;
    const source = columns.find((column) => column.cards.some((card) => card.id === cardId));
    const targetListId = event.over.data.current?.listId as string | undefined
      ?? (columns.find((column) => column.cards.some((card) => card.id === overId))?.id);
    const target = columns.find((column) => column.id === targetListId);
    if (!source || !target) return;
    const targetPosition = target.cards.findIndex((card) => card.id === overId);
    const position = targetPosition >= 0 ? targetPosition : target.cards.length;
    void moveCard(cardId, target.id, position).catch(() => undefined);
  }

  function updateCardFront(cardId: string, updates: Partial<BoardCardView> & { archived?: boolean }) {
    if (updates.archived) {
      const source = columns.find((column) => column.cards.some((card) => card.id === cardId));
      const card = source?.cards.find((item) => item.id === cardId);
      if (card && source) {
        setArchivedCards((current) => [{ ...card, ...updates, listId: source.id, listName: source.name, archivedAt: new Date().toISOString() }, ...current.filter((item) => item.id !== cardId)]);
      }
    }
    if (!updates.archived) {
      setArchivedCards((current) => current.map((card) => card.id === cardId ? { ...card, ...updates } : card));
    }
    setColumns((current) => current.map((column) => ({
      ...column,
      cards: column.cards
        .filter((card) => !(card.id === cardId && updates.archived))
        .map((card) => card.id === cardId ? { ...card, ...updates } : card),
    })));
  }

  async function restoreCard(card: ArchivedCardView) {
    if (!startBusy()) return;
    setError("");
    try {
      const restored = await apiRequest<{ id: string; listId: string }>(`/api/cards/${card.id}`, { method: "POST" });
      setColumns((current) => current.map((column) => column.id === restored.listId
        ? { ...column, cards: [...column.cards, card] }
        : column));
      setArchivedCards((current) => current.filter((item) => item.id !== card.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn’t restore that card.");
    } finally {
      finishBusy();
    }
  }

  async function permanentlyDeleteCard(card: ArchivedCardView) {
    if (!window.confirm(`Permanently delete “${card.title}” and all of its details? This cannot be undone.`)) return;
    if (!startBusy()) return;
    setError("");
    try {
      await apiRequest<void>(`/api/cards/${card.id}`, { method: "DELETE" });
      setArchivedCards((current) => current.filter((item) => item.id !== card.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn’t delete that card.");
    } finally {
      finishBusy();
    }
  }

  function formatDueDate(value: string) {
    const date = new Date(value);
    const now = new Date();
    const dueDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return {
      label: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(date),
      overdue: dueDay < today,
    };
  }

  function matchesDueFilter(card: BoardCardView) {
    if (!dueFilter) return true;
    if (dueFilter === "no-date") return card.dueDate === null;
    if (!card.dueDate) return false;
    const date = new Date(card.dueDate);
    const today = new Date();
    const dueDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const todayDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    if (dueFilter === "overdue") return dueDay < todayDay;
    return dueDay >= todayDay && dueDay < todayDay + 7 * 24 * 60 * 60 * 1000;
  }

  const boardCards = columns.flatMap((column) => column.cards);
  const boardLabels = Array.from(new Map(boardCards.flatMap((card) => card.labels).map((label) => [label.id, label])).values());
  const normalizedSearch = searchText.trim().toLocaleLowerCase();
  const filteredColumns = columns.map((column) => ({
    ...column,
    cards: column.cards.filter((card) => {
      const matchesText = !normalizedSearch || `${card.title} ${card.description}`.toLocaleLowerCase().includes(normalizedSearch);
      const matchesLabels = selectedLabelIds.length === 0 || selectedLabelIds.some((id) => card.labels.some((label) => label.id === id));
      return matchesText && matchesLabels && matchesDueFilter(card);
    }),
  }));
  const matchingCardCount = filteredColumns.reduce((count, column) => count + column.cards.length, 0);
  const hasFilters = Boolean(normalizedSearch || selectedLabelIds.length || dueFilter);
  function clearFilters() {
    setSearchText("");
    setSelectedLabelIds([]);
    setDueFilter("");
  }

  function closeCard(cardId: string) {
    setActiveCardId(null);
    requestAnimationFrame(() => {
      (document.getElementById(CARD_TRIGGER_PREFIX + cardId) ?? boardHeadingRef.current)?.focus();
    });
  }

  const activePosition = activeCardId ? columns.find((column) => column.cards.some((card) => card.id === activeCardId))?.cards.findIndex((card) => card.id === activeCardId) ?? 0 : 0;
  const addListForm = showAddList && <form className="new-list-column" onSubmit={(event) => void addList(event)}><label className="visually-hidden" htmlFor="new-list-name">New list name</label><input id="new-list-name" autoFocus value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="Name your list" maxLength={120} required onKeyDown={(event) => { if (event.key === "Escape") setShowAddList(false); }} /><div className="inline-actions"><button className="button-small" type="submit" disabled={busy}>Add list</button><button className="button-quiet" type="button" onClick={() => setShowAddList(false)}>Cancel</button></div></form>;

  return (
    <main className="app-main board-page">
      <header className="topbar board-topbar">
        <div className="board-breadcrumbs"><Link href="/" className="brand"><span className="brand-mark">C</span><span>Cadence</span></Link><span className="breadcrumb-divider">/</span><span className="breadcrumb-current">Boards</span></div>
        <div className="topbar-actions"><span className="private-pill"><span /> Private workspace</span><SignOutButton /></div>
      </header>

      <section className="board-heading">
        <div><p className="eyebrow">Marketing workspace</p><h1 ref={boardHeadingRef} tabIndex={-1}>{archiveView ? "Archive" : board.name}</h1><p>{archiveView ? "Archived cards stay here until they are restored or permanently deleted." : "Plan the work, make room for good ideas, and keep every story moving."}</p></div>
        <div className="board-heading-actions"><span className="board-summary">{archiveView ? `${archivedCards.length} archived ${archivedCards.length === 1 ? "card" : "cards"}` : `${columns.length} ${columns.length === 1 ? "list" : "lists"} · ${matchingCardCount} matching ${matchingCardCount === 1 ? "card" : "cards"}`}</span>{!archiveView && <button className="button-primary" type="button" disabled={busy} onClick={() => setShowAddList((visible) => !visible)}>＋ Add a list</button>}<button className="button-small" type="button" onClick={() => setArchiveView((visible) => !visible)}>{archiveView ? "← Back to board" : `Archive (${archivedCards.length})`}</button></div>
      </section>

      {error && <p className="app-error board-error" role="alert">{error}</p>}

      {archiveView ? <section className="archive-view" aria-label="Archived cards">
        {archivedCards.length === 0 ? <p className="archive-empty">No archived cards yet.</p> : archivedCards.map((card) => <article className="archive-card" key={card.id}>
          <div className="archive-card-content"><h2>{card.title}</h2><p>{card.listName} <span>·</span> Archived {card.archivedAt ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }).format(new Date(card.archivedAt)) : "date unavailable"}</p>{card.description && <p className="archive-description">{card.description}</p>}</div>
          <div className="archive-card-actions"><button className="button-small" type="button" disabled={busy} onClick={() => void restoreCard(card)}>{busy ? "Saving…" : "Restore"}</button><button className="button-quiet danger-text" type="button" disabled={busy} onClick={() => void permanentlyDeleteCard(card)}>Delete permanently</button></div>
        </article>)}
      </section> : <>
      <button className="filters-toggle" type="button" aria-expanded={filtersOpen} aria-controls="board-filters" onClick={() => setFiltersOpen((open) => !open)}>Filters{hasFilters ? ` (${selectedLabelIds.length + (dueFilter ? 1 : 0) + (normalizedSearch ? 1 : 0)})` : ""}</button>
      <section id="board-filters" className={`board-filters${filtersOpen ? " is-open" : " is-collapsed"}`} aria-label="Search and filters">
        <label className="board-search"><span>Search cards</span><input type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search titles and descriptions…" /></label>
        <fieldset className="board-label-filters"><legend>Labels</legend>{boardLabels.length === 0 ? <span className="filter-muted">No labels</span> : boardLabels.map((label) => <label key={label.id}><input type="checkbox" aria-label={label.name} checked={selectedLabelIds.includes(label.id)} onChange={(event) => setSelectedLabelIds((current) => event.target.checked ? [...current, label.id] : current.filter((id) => id !== label.id))} /><span className="label-filter-dot" style={{ backgroundColor: label.color }} />{label.name}</label>)}</fieldset>
        <label className="due-filter"><span>Due date</span><select value={dueFilter} onChange={(event) => setDueFilter(event.target.value)}><option value="">Any date</option><option value="overdue">Overdue</option><option value="week">Due this week</option><option value="no-date">No due date</option></select></label>
        {hasFilters && <button className="button-quiet" type="button" onClick={clearFilters}>Clear filters</button>}
      </section>
      {hasFilters && matchingCardCount === 0 && <div className="filter-empty" role="status"><span>No cards match your filters.</span><button className="button-quiet" type="button" onClick={clearFilters}>Clear filters</button></div>}
      <section className="board-scroll" aria-label={`${board.name} lists`}>
        {columns.length === 0 ? <div className="empty-board-state"><h2>No lists yet</h2><p>Add a list to start organizing your cards.</p><button className="button-primary" type="button" disabled={busy} onClick={() => setShowAddList(true)}>＋ Add a list</button>{addListForm}</div> : <div className="list-track">
          <DndContext id={dndContextId} sensors={sensors} collisionDetection={closestCenter} onDragStart={(event) => setDraggingCardId(String(event.active.id))} onDragCancel={() => setDraggingCardId(null)} onDragEnd={finishCardDrag}>
            {filteredColumns.map((column, index) => (
              <article key={column.id} className="list-column" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, column.id)}>
                <header className="list-header">
                  <button className="drag-handle" type="button" draggable={!busy} disabled={busy} aria-label={`Drag ${column.name} to reorder`} title="Drag to reorder" onDragStart={(event) => { event.dataTransfer.setData("text/plain", column.id); event.dataTransfer.effectAllowed = "move"; }}>⠿</button>
                  {renamingId === column.id ? <form className="list-rename-form" onSubmit={(event) => void renameList(event, column.id)}><label className="visually-hidden" htmlFor={`list-name-${column.id}`}>List name</label><input id={`list-name-${column.id}`} autoFocus maxLength={120} disabled={busy} value={renamingValue} onChange={(event) => setRenamingValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setRenamingId(null); }} /><button className="icon-button" type="submit" disabled={busy} aria-label="Save list name">✓</button></form> : <h2>{column.name}</h2>}
                  <span className="list-count">{column.cards.length}</span>
                  <div className="list-menu">
                    <button className="list-menu-trigger" type="button" disabled={busy} aria-label={`Actions for ${column.name}`} aria-expanded={openMenuId === column.id} aria-controls={`list-menu-${column.id}`} title="List actions" onClick={() => setOpenMenuId((current) => current === column.id ? null : column.id)}>•••</button>
                    {openMenuId === column.id && <div className="list-menu-popover" id={`list-menu-${column.id}`}>
                      <button type="button" onClick={() => { setOpenMenuId(null); setRenamingId(column.id); setRenamingValue(column.name); setError(""); }}>Rename list</button>
                      <button type="button" disabled={index === 0 || busy} onClick={() => { setOpenMenuId(null); moveColumn(column.id, index - 1); }}>Move left</button>
                      <button type="button" disabled={index === columns.length - 1 || busy} onClick={() => { setOpenMenuId(null); moveColumn(column.id, index + 1); }}>Move right</button>
                      <button type="button" className="danger-text" disabled={busy} onClick={() => { setOpenMenuId(null); void deleteList(column); }}>Delete list</button>
                    </div>}
                  </div>
                </header>

                <DroppableCardStack column={column}>
                  <SortableContext id={column.id} items={column.cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
                    {column.cards.map((card) => <SortableCard key={card.id} card={card} column={column} columns={columns} busy={busy} onOpen={() => setActiveCardId(card.id)} onMove={moveCard} formatDueDate={formatDueDate} />)}
                  </SortableContext>
                  {column.cards.length === 0 && <span className="empty-drop-hint">{hasFilters && columns[index]?.cards.length ? "No matching cards" : "No cards yet"}</span>}
                </DroppableCardStack>

                <form className="add-card-form" onSubmit={(event) => void addCard(event, column)}>
                  <label className="visually-hidden" htmlFor={`new-card-${column.id}`}>New card title in {column.name}</label>
                  <input
                    id={`new-card-${column.id}`}
                    readOnly={busy}
                    value={cardDrafts[column.id] ?? ""}
                    aria-invalid={cardErrors[column.id] ? true : undefined}
                    aria-describedby={cardErrors[column.id] ? `new-card-error-${column.id}` : undefined}
                    onChange={(event) => {
                      setCardDrafts((current) => ({ ...current, [column.id]: event.target.value }));
                      if (cardErrors[column.id]) setCardErrors((current) => ({ ...current, [column.id]: "" }));
                    }}
                    placeholder="Add a card…"
                  />
                  {cardErrors[column.id] && <span id={`new-card-error-${column.id}`} className="field-error" role="alert">{cardErrors[column.id]}</span>}
                  <button type="submit" className="add-card-button" disabled={busy}>{busy ? "Saving…" : "＋ Add card"}</button>
                </form>
              </article>
            ))}
          </DndContext>

          {addListForm}
          {!showAddList && <button className="add-list-tile" type="button" onClick={() => setShowAddList(true)}>＋ Add another list</button>}
        </div>}
      </section>
      </>}
      <footer className="board-footer"><span>{draggingCardId ? "Drop the card into another list or position." : "Drag a card to reorder it, or use Move to."}</span><Link href="/">← All boards</Link></footer>

      {activeCardId && <CardDetail key={activeCardId} boardId={board.id} cardId={activeCardId} columns={columns} initialPosition={activePosition} onClose={() => closeCard(activeCardId)} onCardChange={updateCardFront} onMove={moveCard} />}
    </main>
  );
}
