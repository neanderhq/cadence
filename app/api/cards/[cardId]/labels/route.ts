import { and, eq } from "drizzle-orm";
import { handleApi, notFound, ownedCard, ownedLabel, pathId, readJson, requiredText } from "../../../../../server/api";
import { getDb } from "../../../../../server/db";
import { boards, cardLabels, labels } from "../../../../../server/schema";

type Context = { params: Promise<{ cardId: string }> };

export function GET(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { cardId } = await params;
    const card = await ownedCard(userId, cardId);
    const assigned = await getDb().select({ id: labels.id, boardId: labels.boardId, name: labels.name, color: labels.color })
      .from(cardLabels).innerJoin(labels, eq(cardLabels.labelId, labels.id))
      .innerJoin(boards, eq(labels.boardId, boards.id))
      .where(and(eq(cardLabels.cardId, card.id), eq(labels.boardId, card.boardId), eq(boards.ownerId, userId)));
    return Response.json(assigned);
  });
}

export function POST(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { cardId } = await params;
    const validatedCardId = pathId(cardId);
    const body = await readJson(request);
    const labelId = pathId(requiredText(body, "labelId", "Label ID", 64));
    const card = await ownedCard(userId, validatedCardId);
    const label = await ownedLabel(userId, labelId);
    if (card.boardId !== label.boardId) notFound();
    await getDb().insert(cardLabels).values({ cardId: card.id, labelId: label.id }).onConflictDoNothing();
    return Response.json({ cardId: card.id, labelId: label.id }, { status: 201 });
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { cardId } = await params;
    const validatedCardId = pathId(cardId);
    const body = await readJson(request);
    const labelId = pathId(requiredText(body, "labelId", "Label ID", 64));
    const card = await ownedCard(userId, validatedCardId);
    const label = await ownedLabel(userId, labelId);
    if (card.boardId !== label.boardId) notFound();
    const [deleted] = await getDb().delete(cardLabels)
      .where(and(eq(cardLabels.cardId, card.id), eq(cardLabels.labelId, label.id))).returning();
    if (!deleted) notFound();
    return new Response(null, { status: 204 });
  });
}
