import { asc, eq, sql } from "drizzle-orm";
import { ApiError, handleApi, optionalPosition, ownedCard, readJson, requiredText } from "../../../../../server/api";
import { getDb } from "../../../../../server/db";
import { checklistItems } from "../../../../../server/schema";

type Context = { params: Promise<{ cardId: string }> };

export function GET(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { cardId } = await params;
    const card = await ownedCard(userId, cardId);
    return Response.json(await getDb().select().from(checklistItems).where(eq(checklistItems.cardId, card.id))
      .orderBy(asc(checklistItems.position), asc(checklistItems.id)));
  });
}

export function POST(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { cardId } = await params;
    const card = await ownedCard(userId, cardId);
    const body = await readJson(request);
    const text = requiredText(body, "text", "Checklist item", 500);
    const requestedPosition = optionalPosition(body);
    const created = await getDb().transaction(async (transaction) => {
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${card.id}, 2))`);
      const current = await transaction.select({ id: checklistItems.id }).from(checklistItems)
        .where(eq(checklistItems.cardId, card.id)).orderBy(asc(checklistItems.position), asc(checklistItems.id));
      if (current.length >= 100) throw new ApiError(400, "You can have up to 100 checklist items per card.");
      const position = Math.min(requestedPosition ?? current.length, current.length);
      const [createdItem] = await transaction.insert(checklistItems).values({ cardId: card.id, text, position }).returning();
      const orderedIds = current.map((item) => item.id);
      orderedIds.splice(position, 0, createdItem.id);
      for (const [index, id] of orderedIds.entries()) {
        await transaction.update(checklistItems).set({ position: index }).where(eq(checklistItems.id, id));
      }
      return { ...createdItem, position };
    });
    return Response.json(created, { status: 201 });
  });
}
