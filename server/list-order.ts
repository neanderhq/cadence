import { and, asc, eq, sql } from "drizzle-orm";
import { ApiError } from "./api";
import { getDb } from "./db";
import { cards, lists } from "./schema";

async function lockBoardLists(transaction: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], boardId: string) {
  await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${boardId}, 1))`);
}

async function currentListIds(transaction: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], boardId: string) {
  const rows = await transaction.select({ id: lists.id }).from(lists).where(eq(lists.boardId, boardId))
    .orderBy(asc(lists.position), asc(lists.id));
  return rows.map((row) => row.id);
}

async function persistOrder(transaction: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], listIds: string[]) {
  for (const [position, id] of listIds.entries()) {
    await transaction.update(lists).set({ position }).where(eq(lists.id, id));
  }
}

export async function createBoardList(boardId: string, name: string, requestedPosition?: number) {
  return getDb().transaction(async (transaction) => {
    await lockBoardLists(transaction, boardId);
    const listIds = await currentListIds(transaction, boardId);
    if (listIds.length >= 30) throw new ApiError(400, "You can have up to 30 lists per board.");
    const [created] = await transaction.insert(lists).values({
      boardId,
      name,
      position: listIds.length,
    }).returning();
    const position = Math.min(requestedPosition ?? listIds.length, listIds.length);
    listIds.splice(position, 0, created.id);
    await persistOrder(transaction, listIds);
    return { ...created, position };
  });
}

export async function reorderBoardLists(boardId: string, requestedIds: string[]) {
  return getDb().transaction(async (transaction) => {
    await lockBoardLists(transaction, boardId);
    const currentIds = await currentListIds(transaction, boardId);
    if (requestedIds.length !== currentIds.length) {
      throw new ApiError(400, "List order must include every list on this board exactly once.");
    }
    const currentSet = new Set(currentIds);
    if (new Set(requestedIds).size !== requestedIds.length || requestedIds.some((id) => !currentSet.has(id))) {
      throw new ApiError(404, "Resource not found.");
    }
    await persistOrder(transaction, requestedIds);
    return requestedIds;
  });
}

export async function moveBoardList(boardId: string, listId: string, position: number, name?: string) {
  return getDb().transaction(async (transaction) => {
    await lockBoardLists(transaction, boardId);
    const listIds = await currentListIds(transaction, boardId);
    const currentIndex = listIds.indexOf(listId);
    if (currentIndex < 0) throw new ApiError(404, "Resource not found.");
    listIds.splice(currentIndex, 1);
    const nextIndex = Math.min(position, listIds.length);
    listIds.splice(nextIndex, 0, listId);
    if (name !== undefined) await transaction.update(lists).set({ name }).where(eq(lists.id, listId));
    await persistOrder(transaction, listIds);
    const [updated] = await transaction.select().from(lists).where(eq(lists.id, listId)).limit(1);
    return updated;
  });
}

export async function deleteBoardList(boardId: string, listId: string) {
  return getDb().transaction(async (transaction) => {
    await lockBoardLists(transaction, boardId);
    const listIds = await currentListIds(transaction, boardId);
    const index = listIds.indexOf(listId);
    if (index < 0) throw new ApiError(404, "Resource not found.");
    const remainingIds = listIds.filter((id) => id !== listId);
    const archivedCards = await transaction.select({ id: cards.id, position: cards.position }).from(cards)
      .where(and(eq(cards.listId, listId), eq(cards.archived, true))).orderBy(asc(cards.position), asc(cards.id));
    if (archivedCards.length && remainingIds.length === 0) {
      throw new ApiError(400, "Create another list before deleting the last list with archived cards.");
    }
    if (archivedCards.length) {
      const destinationId = remainingIds[0];
      const destinationCards = await transaction.select({ position: cards.position }).from(cards)
        .where(eq(cards.listId, destinationId)).orderBy(asc(cards.position), asc(cards.id));
      if (destinationCards.length + archivedCards.length > 500) {
        throw new ApiError(400, "Deleting this list would exceed the 500-card limit in the destination list.");
      }
      for (const [offset, card] of archivedCards.entries()) {
        await transaction.update(cards).set({ listId: destinationId, position: destinationCards.length + offset })
          .where(eq(cards.id, card.id));
      }
    }
    await transaction.delete(lists).where(eq(lists.id, listId));
    listIds.splice(index, 1);
    await persistOrder(transaction, listIds);
  });
}
