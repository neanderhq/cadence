import { asc, count, eq, sql } from "drizzle-orm";
import { ApiError, handleApi, readJson, requiredText } from "../../../../../server/api";
import { getDb } from "../../../../../server/db";
import { readableCard } from "../../../../../server/reviewer-access";
import { comments, user } from "../../../../../server/schema";

type Context = { params: Promise<{ cardId: string }> };

export function GET(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { cardId } = await params;
    const { card, isOwner } = await readableCard(userId, cardId);
    const rows = await getDb().select({
      id: comments.id,
      cardId: comments.cardId,
      authorId: comments.authorId,
      authorName: user.name,
      text: comments.text,
      createdAt: comments.createdAt,
    }).from(comments).innerJoin(user, eq(comments.authorId, user.id))
      .where(eq(comments.cardId, card.id))
      .orderBy(asc(comments.createdAt), asc(comments.id));
    return Response.json(rows.map((comment) => ({ ...comment, canDelete: isOwner && comment.authorId === userId })));
  });
}

export function POST(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { cardId } = await params;
    const body = await readJson(request);
    const text = requiredText(body, "text", "Comment", 5000);
    const { created, isOwner } = await getDb().transaction(async (transaction) => {
      const { card, isOwner } = await readableCard(userId, cardId, transaction);
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${card.id}, 3))`);
      const [current] = await transaction.select({ value: count() }).from(comments).where(eq(comments.cardId, card.id));
      if (Number(current.value) >= 500) throw new ApiError(400, "You can have up to 500 comments per card.");
      const [created] = await transaction.insert(comments).values({ cardId: card.id, authorId: userId, text }).returning();
      return { created, isOwner };
    });
    const [author] = await getDb().select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
    return Response.json({ ...created, authorName: author?.name ?? "User", canDelete: isOwner }, { status: 201 });
  });
}
