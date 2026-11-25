import { and, eq, or } from "drizzle-orm";
import { ApiError, notFound, pathId } from "./api";
import { getDb } from "./db";
import { boardReviewers, boards, cards, lists, user } from "./schema";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export async function boardReviewer(boardId: string) {
  const [reviewer] = await getDb().select({ id: user.id, name: user.name }).from(boardReviewers)
    .innerJoin(user, eq(user.id, boardReviewers.reviewerId)).where(eq(boardReviewers.boardId, boardId));
  return reviewer ?? null;
}

async function lockOwnedBoard(transaction: Transaction, ownerId: string, rawBoardId: string) {
  const [board] = await transaction.select({ id: boards.id }).from(boards)
    .where(and(eq(boards.id, pathId(rawBoardId)), eq(boards.ownerId, ownerId))).for("no key update");
  if (!board) notFound();
  return board.id;
}

export function grantBoardReviewer(ownerId: string, rawBoardId: string, reviewerId: string) {
  return getDb().transaction(async (transaction) => {
    const boardId = await lockOwnedBoard(transaction, ownerId, rawBoardId);
    if (ownerId === reviewerId) throw new ApiError(400, "The board owner already has access.");
    const [current] = await transaction.select({ id: boardReviewers.reviewerId }).from(boardReviewers)
      .where(eq(boardReviewers.boardId, boardId));
    if (current && current.id !== reviewerId) throw new ApiError(409, "Revoke the current reviewer before adding another.");
    const [reviewer] = await transaction.select({ id: user.id, name: user.name }).from(user)
      .where(eq(user.id, reviewerId)).for("key share");
    if (!reviewer) throw new ApiError(400, "No account matches that reviewer ID. Ask your reviewer to copy their ID from Cadence.");
    if (!current) await transaction.insert(boardReviewers).values({ boardId, reviewerId });
    return { reviewer, created: !current };
  });
}

export function revokeBoardReviewer(ownerId: string, rawBoardId: string, reviewerId: string) {
  return getDb().transaction(async (transaction) => {
    const boardId = await lockOwnedBoard(transaction, ownerId, rawBoardId);
    const [current] = await transaction.select({ id: boardReviewers.reviewerId }).from(boardReviewers)
      .where(eq(boardReviewers.boardId, boardId));
    if (!current) return;
    if (current.id !== reviewerId) throw new ApiError(409, "Reviewer access changed. Reload the board before revoking access.");
    await transaction.delete(boardReviewers).where(and(eq(boardReviewers.boardId, boardId), eq(boardReviewers.reviewerId, reviewerId)));
  });
}

export async function readableCard(userId: string, rawCardId: string, transaction?: Transaction) {
  const db = transaction ?? getDb();
  const id = pathId(rawCardId);
  const [result] = await db.select({ card: cards, boardId: boards.id, ownerId: boards.ownerId }).from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId)).innerJoin(boards, eq(boards.id, lists.boardId))
    .leftJoin(boardReviewers, and(eq(boardReviewers.boardId, boards.id), eq(boardReviewers.reviewerId, userId)))
    .where(and(eq(cards.id, id), or(eq(boards.ownerId, userId), and(eq(boardReviewers.reviewerId, userId), eq(cards.archived, false)))));
  if (!result) notFound();
  const isOwner = result.ownerId === userId;

  if (transaction && !isOwner) {
    // A comment commits before a concurrent revoke or archive, or it uses the new access state.
    const [grant] = await transaction.select({ id: boardReviewers.boardId }).from(boardReviewers)
      .where(and(eq(boardReviewers.boardId, result.boardId), eq(boardReviewers.reviewerId, userId))).for("share");
    if (!grant) notFound();
    const [active] = await transaction.select({ id: cards.id }).from(cards)
      .innerJoin(lists, eq(lists.id, cards.listId))
      .where(and(eq(cards.id, id), eq(cards.archived, false), eq(lists.boardId, result.boardId))).for("share", { of: cards });
    if (!active) notFound();
  }
  return { card: result.card, boardId: result.boardId, isOwner };
}
