import { count, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardClient, type DashboardBoard } from "./dashboard-client";
import { getAuth } from "../../server/auth";
import { getDb } from "../../server/db";
import { boardReviewers, boards, cards, lists } from "../../server/schema";

export default async function HomePage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const ownedBoards = await getDb().select().from(boards).where(eq(boards.ownerId, session.user.id))
    .orderBy(boards.position, boards.id);
  const boardIds = ownedBoards.map((board) => board.id);
  let listCounts: { boardId: string; count: number }[] = [];
  let cardCounts: { boardId: string; count: number }[] = [];
  if (boardIds.length) {
    listCounts = await getDb().select({ boardId: lists.boardId, count: count() }).from(lists)
      .where(inArray(lists.boardId, boardIds)).groupBy(lists.boardId);
    cardCounts = await getDb().select({ boardId: lists.boardId, count: count() }).from(cards)
      .innerJoin(lists, eq(cards.listId, lists.id)).where(inArray(lists.boardId, boardIds)).groupBy(lists.boardId);
  }
  const countByBoard = (rows: { boardId: string; count: number }[]) => new Map(rows.map((row) => [row.boardId, row.count]));
  const listsByBoard = countByBoard(listCounts);
  const cardsByBoard = countByBoard(cardCounts);
  const dashboardBoards: DashboardBoard[] = ownedBoards.map((board) => ({
    id: board.id,
    name: board.name,
    listCount: listsByBoard.get(board.id) ?? 0,
    cardCount: cardsByBoard.get(board.id) ?? 0,
  }));

  const sharedBoards = await getDb().select({ id: boards.id, name: boards.name }).from(boardReviewers)
    .innerJoin(boards, eq(boardReviewers.boardId, boards.id))
    .where(eq(boardReviewers.reviewerId, session.user.id)).orderBy(boards.name, boards.id);
  return <DashboardClient initialBoards={dashboardBoards} userName={session.user.name} reviewerId={session.user.id} sharedBoards={sharedBoards} />;
}
