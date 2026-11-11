import { asc, eq } from "drizzle-orm";
import { ApiError, handleApi, notFound, ownedBoard, ownedCard, pathId, readJson, requiredText } from "../../../../../server/api";
import { getDb } from "../../../../../server/db";
import { cardLabels, labels } from "../../../../../server/schema";

type Context = { params: Promise<{ boardId: string }> };

function checkedColor(value: string) {
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
    throw new ApiError(400, "Label color must be a 3- or 6-digit hex color, such as #336699.");
  }
  return value;
}

export function GET(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { boardId } = await params;
    const board = await ownedBoard(userId, boardId);
    return Response.json(await getDb().select().from(labels).where(eq(labels.boardId, board.id))
      .orderBy(asc(labels.name), asc(labels.id)));
  });
}

export function POST(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { boardId } = await params;
    const validatedBoardId = pathId(boardId);
    const body = await readJson(request);
    const name = requiredText(body, "name", "Label name", 80);
    const color = checkedColor(requiredText(body, "color", "Label color", 32));
    if ("cardId" in body && typeof body.cardId !== "string") throw new ApiError(400, "Card ID must be text.");
    const cardId = typeof body.cardId === "string" ? pathId(body.cardId) : undefined;
    const board = await ownedBoard(userId, validatedBoardId);
    const card = cardId ? await ownedCard(userId, cardId) : null;
    if (card && card.boardId !== board.id) notFound();
    const db = getDb();
    const [created] = card
      ? await db.transaction(async (transaction) => {
        const [newLabel] = await transaction.insert(labels).values({ boardId: board.id, name, color }).returning();
        await transaction.insert(cardLabels).values({ cardId: card.id, labelId: newLabel.id });
        return [newLabel];
      })
      : await db.insert(labels).values({ boardId: board.id, name, color }).returning();
    return Response.json(created, { status: 201 });
  });
}
