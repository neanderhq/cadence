import { eq } from "drizzle-orm";
import { handleApi, optionalDate, optionalPosition, optionalText, ownedCard, pathId, readJson } from "../../../../server/api";
import { deleteBoardCard, moveBoardCard, restoreBoardCard } from "../../../../server/card-order";
import { getDb } from "../../../../server/db";
import { readableCard } from "../../../../server/reviewer-access";
import { cards } from "../../../../server/schema";

type Context = { params: Promise<{ cardId: string }> };

export function GET(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { cardId } = await params;
    const { card } = await readableCard(userId, cardId);
    return Response.json(card);
  });
}

export function PATCH(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { cardId } = await params;
    const validatedCardId = pathId(cardId);
    const body = await readJson(request);
    const title = optionalText(body, "title", "Card title", 200);
    const description = optionalText(body, "description", "Description", 10000);
    const position = optionalPosition(body);
    const dueDate = optionalDate(body, "dueDate", "Due date");
    let listId: string | undefined;
    if ("listId" in body) {
      if (typeof body.listId !== "string") {
        return Response.json({ error: "List ID must be text." }, { status: 400 });
      }
      listId = pathId(body.listId);
    }
    let archived: boolean | undefined;
    let archivedAt: Date | null | undefined;
    if ("archived" in body) {
      if (typeof body.archived !== "boolean") {
        return Response.json({ error: "Archived must be true or false." }, { status: 400 });
      }
      archived = body.archived;
      archivedAt = archived ? new Date() : null;
    }
    const owned = await ownedCard(userId, validatedCardId);
    if ([title, description, position, dueDate, archived, listId].every((value) => value === undefined)) {
      return Response.json({ error: "Provide at least one valid card field to update." }, { status: 400 });
    }
    let result = archived === false ? await restoreBoardCard(userId, owned.id) : undefined;
    if ([title, description, dueDate].some((value) => value !== undefined) || archived === true) {
      [result] = await getDb().update(cards).set({ title, description, dueDate, archived, archivedAt })
        .where(eq(cards.id, owned.id)).returning();
    }
    const moved = listId !== undefined || position !== undefined
      ? await moveBoardCard(userId, owned.id, listId, position)
      : result;
    return Response.json(moved);
  });
}

export function DELETE(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { cardId } = await params;
    const owned = await ownedCard(userId, cardId);
    await deleteBoardCard(userId, owned.id);
    return new Response(null, { status: 204 });
  });
}

export function POST(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { cardId } = await params;
    return Response.json(await restoreBoardCard(userId, cardId));
  });
}
