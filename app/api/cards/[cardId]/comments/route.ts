import { asc, count, eq, sql } from "drizzle-orm";
import { ApiError, handleApi, ownedCard, readJson, requiredText } from "../../../../../server/api";
import { getDb } from "../../../../../server/db";
import { comments, user } from "../../../../../server/schema";

type Context = { params: Promise<{ cardId: string }> };

export function GET(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { cardId } = await params;
    const card = await ownedCard(userId, cardId);
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
    return Response.json(rows.map((comment) => ({ ...comment, canDelete: comment.authorId === userId })));
  });
}

export function POST(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { cardId } = await params;
    const card = await ownedCard(userId, cardId);
    const body = await readJson(request);
    const text = requiredText(body, "text", "Comment", 5000);
    const [created] = await getDb().transaction(async (transaction) => {
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${card.id}, 3))`);
      const [current] = await transaction.select({ value: count() }).from(comments).where(eq(comments.cardId, card.id));
      if (Number(current.value) >= 500) throw new ApiError(400, "You can have up to 500 comments per card.");
      return transaction.insert(comments).values({ cardId: card.id, authorId: userId, text }).returning();
    });
    const [author] = await getDb().select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
    return Response.json({ ...created, authorName: author?.name ?? "User", canDelete: true }, { status: 201 });
  });
}
