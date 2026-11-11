import { eq } from "drizzle-orm";
import { handleApi, ownedList, optionalPosition, optionalText, readJson } from "../../../../server/api";
import { getDb } from "../../../../server/db";
import { lists } from "../../../../server/schema";
import { deleteBoardList, moveBoardList } from "../../../../server/list-order";

type Context = { params: Promise<{ listId: string }> };

export function GET(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { listId } = await params;
    const owned = await ownedList(userId, listId);
    const [result] = await getDb().select().from(lists).where(eq(lists.id, owned.id)).limit(1);
    return Response.json(result);
  });
}

export function PATCH(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { listId } = await params;
    const owned = await ownedList(userId, listId);
    const body = await readJson(request);
    const name = optionalText(body, "name", "List name", 120);
    const position = optionalPosition(body);
    if (name === undefined && position === undefined) {
      return Response.json({ error: "Provide a list name or position to update." }, { status: 400 });
    }
    if (position !== undefined) {
      return Response.json(await moveBoardList(owned.boardId, owned.id, position, name));
    }
    const [result] = await getDb().update(lists).set({ name, position }).where(eq(lists.id, owned.id)).returning();
    return Response.json(result);
  });
}

export function DELETE(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { listId } = await params;
    const owned = await ownedList(userId, listId);
    await deleteBoardList(owned.boardId, owned.id);
    return new Response(null, { status: 204 });
  });
}
