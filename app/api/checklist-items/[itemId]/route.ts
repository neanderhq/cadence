import { count, eq } from "drizzle-orm";
import { handleApi, optionalPosition, optionalText, ownedChecklistItem, readJson } from "../../../../server/api";
import { getDb } from "../../../../server/db";
import { checklistItems } from "../../../../server/schema";

type Context = { params: Promise<{ itemId: string }> };

export function GET(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { itemId } = await params;
    const owned = await ownedChecklistItem(userId, itemId);
    const [result] = await getDb().select().from(checklistItems).where(eq(checklistItems.id, owned.id)).limit(1);
    return Response.json(result);
  });
}

export function PATCH(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { itemId } = await params;
    const owned = await ownedChecklistItem(userId, itemId);
    const body = await readJson(request);
    const text = optionalText(body, "text", "Checklist item", 500);
    const position = optionalPosition(body);
    let done: boolean | undefined;
    if ("done" in body) {
      if (typeof body.done !== "boolean") {
        return Response.json({ error: "Done must be true or false." }, { status: 400 });
      }
      done = body.done;
    }
    if (text === undefined && position === undefined && done === undefined) {
      return Response.json({ error: "Provide checklist text, done, or position to update." }, { status: 400 });
    }
    const boundedPosition = position === undefined
      ? undefined
      : Math.min(position, Math.max(0, Number((await getDb().select({ value: count() }).from(checklistItems)
        .where(eq(checklistItems.cardId, owned.cardId)))[0]?.value ?? 1) - 1));
    const [result] = await getDb().update(checklistItems).set({ text, position: boundedPosition, done })
      .where(eq(checklistItems.id, owned.id)).returning();
    return Response.json(result);
  });
}

export function DELETE(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { itemId } = await params;
    const owned = await ownedChecklistItem(userId, itemId);
    await getDb().delete(checklistItems).where(eq(checklistItems.id, owned.id));
    return new Response(null, { status: 204 });
  });
}
