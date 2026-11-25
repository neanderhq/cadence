import { and, asc, eq, inArray, or } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { BoardClient, type BoardView, type BoardColumnView, type ArchivedCardView } from "../../board-client";
import { ReviewerBoard } from "../../reviewer-board";
import { boardReviewer } from "../../../../server/reviewer-access";
import { getAuth } from "../../../../server/auth";
import { getDb } from "../../../../server/db";
import { boardReviewers, boards, cardLabels, cards, checklistItems, comments, labels, lists } from "../../../../server/schema";

type Context = { params: Promise<{ boardId: string }> };

export default async function BoardPage({ params }: Context) {
  const { boardId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(boardId)) notFound();
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const [board] = await getDb().select({ id: boards.id, name: boards.name, ownerId: boards.ownerId }).from(boards)
    .leftJoin(boardReviewers, and(eq(boardReviewers.boardId, boards.id), eq(boardReviewers.reviewerId, session.user.id)))
    .where(and(eq(boards.id, boardId), or(eq(boards.ownerId, session.user.id), eq(boardReviewers.reviewerId, session.user.id)))).limit(1);
  if (!board) notFound();

  const isOwner = board.ownerId === session.user.id;
  const boardLists = await getDb().select().from(lists).where(eq(lists.boardId, board.id))
    .orderBy(asc(lists.position), asc(lists.id));
  const listIds = boardLists.map((list) => list.id);
  const boardCards = listIds.length
    ? await getDb().select().from(cards).where(and(inArray(cards.listId, listIds), isOwner ? undefined : eq(cards.archived, false)))
      .orderBy(asc(cards.position), asc(cards.id))
    : [];
  const cardIds = boardCards.map((card) => card.id);
  let cardLabelRows: { cardId: string; id: string; name: string; color: string }[] = [];
  let checklistRows: { cardId: string; done: boolean }[] = [];
  let commentRows: { cardId: string }[] = [];
  if (cardIds.length) {
    cardLabelRows = await getDb().select({ cardId: cardLabels.cardId, id: labels.id, name: labels.name, color: labels.color })
      .from(cardLabels).innerJoin(labels, eq(cardLabels.labelId, labels.id)).where(inArray(cardLabels.cardId, cardIds));
    checklistRows = await getDb().select({ cardId: checklistItems.cardId, done: checklistItems.done })
      .from(checklistItems).where(inArray(checklistItems.cardId, cardIds));
    commentRows = await getDb().select({ cardId: comments.cardId }).from(comments).where(inArray(comments.cardId, cardIds));
  }

  const makeCard = (card: typeof boardCards[number]): BoardColumnView["cards"][number] => {
    const checklist = checklistRows.filter((item) => item.cardId === card.id);
    return {
      id: card.id,
      title: card.title,
      description: card.description,
      dueDate: card.dueDate?.toISOString() ?? null,
      labels: cardLabelRows.filter((label) => label.cardId === card.id).map(({ id, name, color }) => ({ id, name, color })),
      checklistDone: checklist.filter((item) => item.done).length,
      checklistTotal: checklist.length,
      commentCount: commentRows.filter((comment) => comment.cardId === card.id).length,
    };
  };
  const columns: BoardColumnView[] = boardLists.map((list) => ({
    id: list.id,
    name: list.name,
    position: list.position,
    cards: boardCards.filter((card) => card.listId === list.id && !card.archived).map(makeCard),
  }));
  const boardView: BoardView = { id: board.id, name: board.name, columns };
  if (!isOwner) return <ReviewerBoard board={boardView} />;

  const archivedCards: ArchivedCardView[] = boardCards.filter((card) => card.archived).map((card) => ({
    ...makeCard(card),
    listId: card.listId,
    listName: boardLists.find((list) => list.id === card.listId)?.name ?? "Deleted list",
    archivedAt: card.archivedAt?.toISOString() ?? null,
  }));
  return <BoardClient initialBoard={boardView} initialArchivedCards={archivedCards} initialReviewer={await boardReviewer(board.id)} />;
}
