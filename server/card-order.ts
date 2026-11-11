import { and, asc, eq, sql } from "drizzle-orm";
import { ApiError } from "./api";
import { getDb } from "./db";
import { boards, cards, lists } from "./schema";

async function lockBoard(transaction: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], boardId: string) {
  await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${boardId}, 1))`);
}

async function orderedCardIds(transaction: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], listId: string) {
  const rows = await transaction.select({ id: cards.id, archived: cards.archived }).from(cards)
    .where(eq(cards.listId, listId)).orderBy(asc(cards.position), asc(cards.id));
  return {
    active: rows.filter((card) => !card.archived).map((card) => card.id),
    archived: rows.filter((card) => card.archived).map((card) => card.id),
  };
}

async function persistOrder(transaction: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], listId: string, cardIds: string[]) {
  for (const [position, id] of cardIds.entries()) {
    await transaction.update(cards).set({ listId, position }).where(eq(cards.id, id));
  }
}

async function ownedBoardCard(transaction: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], userId: string, cardId: string) {
  const [card] = await transaction.select({ id: cards.id, listId: cards.listId, boardId: lists.boardId, archived: cards.archived })
    .from(cards).innerJoin(lists, eq(cards.listId, lists.id)).innerJoin(boards, eq(lists.boardId, boards.id))
    .where(and(eq(cards.id, cardId), eq(boards.ownerId, userId))).limit(1);
  if (!card) throw new ApiError(404, "Resource not found.");
  return card;
}

export async function moveBoardCard(userId: string, cardId: string, destinationListId: string | undefined, requestedPosition: number | undefined) {
  return getDb().transaction(async (transaction) => {
    const currentCard = await ownedBoardCard(transaction, userId, cardId);
    await lockBoard(transaction, currentCard.boardId);
    const card = await ownedBoardCard(transaction, userId, cardId);
    const targetListId = destinationListId ?? card.listId;
    const [target] = await transaction.select({ id: lists.id, boardId: lists.boardId }).from(lists)
      .innerJoin(boards, eq(lists.boardId, boards.id))
      .where(and(eq(lists.id, targetListId), eq(boards.ownerId, userId))).limit(1);
    if (!target || target.boardId !== card.boardId) throw new ApiError(404, "Resource not found.");

    const sourceOrder = await orderedCardIds(transaction, card.listId);
    const sourceIds = [...sourceOrder.active, ...sourceOrder.archived];
    if (!sourceIds.includes(card.id)) throw new ApiError(404, "Resource not found.");
    const sourceActive = sourceOrder.active.filter((id) => id !== card.id);
    const sourceArchived = sourceOrder.archived.filter((id) => id !== card.id);

    if (target.id === card.listId) {
      const nextActive = sourceActive;
      const nextArchived = sourceArchived;
      const destination = card.archived ? nextArchived : nextActive;
      const index = Math.min(requestedPosition ?? destination.length, destination.length);
      destination.splice(index, 0, card.id);
      await persistOrder(transaction, target.id, [...nextActive, ...nextArchived]);
    } else {
      const targetOrder = await orderedCardIds(transaction, target.id);
      if (targetOrder.active.length + targetOrder.archived.length >= 500) {
        throw new ApiError(400, "You can have up to 500 cards per list.");
      }
      const targetActive = targetOrder.active;
      const targetArchived = targetOrder.archived;
      const destination = card.archived ? targetArchived : targetActive;
      const index = Math.min(requestedPosition ?? destination.length, destination.length);
      destination.splice(index, 0, card.id);
      await persistOrder(transaction, card.listId, [...sourceActive, ...sourceArchived]);
      await persistOrder(transaction, target.id, [...targetActive, ...targetArchived]);
    }
    const [updated] = await transaction.select().from(cards).where(eq(cards.id, card.id)).limit(1);
    return updated;
  });
}

export async function createBoardCard(userId: string, listId: string, values: { title: string; description: string; dueDate: Date | null; position?: number }) {
  return getDb().transaction(async (transaction) => {
    const [list] = await transaction.select({ id: lists.id, boardId: lists.boardId }).from(lists)
      .innerJoin(boards, eq(lists.boardId, boards.id))
      .where(and(eq(lists.id, listId), eq(boards.ownerId, userId))).limit(1);
    if (!list) throw new ApiError(404, "Resource not found.");
    await lockBoard(transaction, list.boardId);
    const [currentList] = await transaction.select({ id: lists.id }).from(lists)
      .innerJoin(boards, eq(lists.boardId, boards.id))
      .where(and(eq(lists.id, list.id), eq(boards.ownerId, userId))).limit(1);
    if (!currentList) throw new ApiError(404, "Resource not found.");
    const order = await orderedCardIds(transaction, list.id);
    if (order.active.length + order.archived.length >= 500) {
      throw new ApiError(400, "You can have up to 500 cards per list.");
    }
    const [created] = await transaction.insert(cards).values({
      listId: list.id,
      title: values.title,
      description: values.description,
      dueDate: values.dueDate,
      position: order.active.length + order.archived.length,
    }).returning();
    const index = Math.min(values.position ?? order.active.length, order.active.length);
    order.active.splice(index, 0, created.id);
    await persistOrder(transaction, list.id, [...order.active, ...order.archived]);
    return { ...created, position: index };
  });
}

export async function deleteBoardCard(userId: string, cardId: string) {
  return getDb().transaction(async (transaction) => {
    const currentCard = await ownedBoardCard(transaction, userId, cardId);
    await lockBoard(transaction, currentCard.boardId);
    const card = await ownedBoardCard(transaction, userId, cardId);
    await transaction.delete(cards).where(eq(cards.id, card.id));
    const order = await orderedCardIds(transaction, card.listId);
    await persistOrder(transaction, card.listId, [...order.active, ...order.archived]);
  });
}

export async function restoreBoardCard(userId: string, cardId: string) {
  return getDb().transaction(async (transaction) => {
    const currentCard = await ownedBoardCard(transaction, userId, cardId);
    await lockBoard(transaction, currentCard.boardId);
    const card = await ownedBoardCard(transaction, userId, cardId);
    if (!card.archived) throw new ApiError(400, "This card is not archived.");
    const order = await orderedCardIds(transaction, card.listId);
    const activeOrder = [...order.active, card.id];
    await transaction.update(cards)
      .set({ archived: false, archivedAt: null })
      .where(eq(cards.id, card.id)).returning();
    await persistOrder(transaction, card.listId, [...activeOrder, ...order.archived.filter((id) => id !== card.id)]);
    const [updated] = await transaction.select().from(cards).where(eq(cards.id, card.id)).limit(1);
    return updated;
  });
}
