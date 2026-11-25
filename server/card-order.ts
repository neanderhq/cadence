import { and, asc, eq, sql } from "drizzle-orm";
import { ApiError } from "./api";
import { getDb } from "./db";
import { boards, briefCopies, cardLabels, cards, checklistItems, comments, labels, lists } from "./schema";

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

export async function copyBoardCard(userId: string, sourceId: string, destinationId: string, title: string, requestId: string) {
  return getDb().transaction(async (transaction) => {
    const sourceBoard = await ownedBoardCard(transaction, userId, sourceId);
    await lockBoard(transaction, sourceBoard.boardId);
    const [source] = await transaction.select({ description: cards.description, archived: cards.archived, boardId: lists.boardId })
      .from(cards).innerJoin(lists, eq(cards.listId, lists.id)).innerJoin(boards, eq(lists.boardId, boards.id))
      .where(and(eq(cards.id, sourceId), eq(boards.ownerId, userId))).for("update", { of: cards });
    if (!source || source.archived || source.boardId !== sourceBoard.boardId) throw new ApiError(404, "Resource not found.");

    const [previous] = await transaction.select().from(briefCopies)
      .where(and(eq(briefCopies.boardId, source.boardId), eq(briefCopies.requestId, requestId)));
    let copy: typeof cards.$inferSelect | undefined;
    if (previous) {
      if (previous.sourceId !== sourceId || previous.destinationId !== destinationId || previous.title !== title) {
        throw new ApiError(409, "This copy request was already used. Cancel and start a new copy.");
      }
      if (previous.copyId) {
        [copy] = await transaction.select().from(cards)
          .where(and(eq(cards.id, previous.copyId), eq(cards.archived, false)));
      }
      if (!copy) throw new ApiError(409, "The earlier copy is no longer active. Check this board before starting again.");
    } else {
      const [destination] = await transaction.select({ id: lists.id }).from(lists)
        .where(and(eq(lists.id, destinationId), eq(lists.boardId, source.boardId))).for("key share");
      if (!destination) throw new ApiError(404, "Choose a list on this board.");
      const order = await orderedCardIds(transaction, destinationId);
      if (order.active.length + order.archived.length >= 500) {
        throw new ApiError(400, "You can have up to 500 cards per list.");
      }

      const [created] = await transaction.insert(cards).values({
        listId: destinationId, title, description: source.description, position: order.active.length,
      }).returning();
      const sourceLabels = await transaction.select({ labelId: labels.id }).from(cardLabels)
        .innerJoin(labels, eq(cardLabels.labelId, labels.id))
        .where(and(eq(cardLabels.cardId, sourceId), eq(labels.boardId, source.boardId)));
      if (sourceLabels.length) {
        await transaction.insert(cardLabels).values(sourceLabels.map(({ labelId }) => ({ cardId: created.id, labelId })));
      }
      const sourceItems = await transaction.select({ text: checklistItems.text }).from(checklistItems)
        .where(eq(checklistItems.cardId, sourceId)).orderBy(asc(checklistItems.position), asc(checklistItems.id));
      if (sourceItems.length) {
        await transaction.insert(checklistItems).values(sourceItems.map(({ text }, position) => ({ cardId: created.id, text, position })));
      }
      await persistOrder(transaction, destinationId, [...order.active, created.id, ...order.archived]);
      await transaction.insert(briefCopies).values({ boardId: source.boardId, requestId, sourceId, destinationId, title, copyId: created.id });
      copy = created;
    }

    const copyLabels = await transaction.select({ id: labels.id, name: labels.name, color: labels.color }).from(cardLabels)
      .innerJoin(labels, eq(cardLabels.labelId, labels.id)).where(eq(cardLabels.cardId, copy.id)).orderBy(asc(labels.name), asc(labels.id));
    const copyItems = await transaction.select({ done: checklistItems.done }).from(checklistItems).where(eq(checklistItems.cardId, copy.id));
    const [copyComments] = await transaction.select({ count: sql<number>`count(*)::integer` }).from(comments).where(eq(comments.cardId, copy.id));
    return {
      card: {
        id: copy.id,
        title: copy.title,
        description: copy.description,
        dueDate: copy.dueDate?.toISOString() ?? null,
        labels: copyLabels,
        checklistDone: copyItems.filter((item) => item.done).length,
        checklistTotal: copyItems.length,
        commentCount: copyComments.count,
      },
      listId: copy.listId,
      position: copy.position,
      replayed: Boolean(previous),
    };
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
