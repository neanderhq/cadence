import { count, eq } from "drizzle-orm";
import { handleApi, ownedBoard, optionalPosition, optionalText, readJson } from "../../../../server/api";
import { getDb } from "../../../../server/db";
import { boards } from "../../../../server/schema";

type Context = { params: Promise<{ boardId: string }> };

export function GET(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { boardId } = await params;
    const owned = await ownedBoard(userId, boardId);
    const [result] = await getDb().select().from(boards).where(eq(boards.id, owned.id)).limit(1);
    return Response.json(result);
  });
}

export function PATCH(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { boardId } = await params;
    const owned = await ownedBoard(userId, boardId);
    const body = await readJson(request);
    const name = optionalText(body, "name", "Board name", 120);
    const position = optionalPosition(body);
    if (name === undefined && position === undefined) {
      return Response.json({ error: "Provide a board name or position to update." }, { status: 400 });
    }
    const db = getDb();
    const [ownerBoards] = position === undefined
      ? [undefined]
      : await db.select({ value: count() }).from(boards).where(eq(boards.ownerId, userId));
    const boundedPosition = position === undefined ? undefined : Math.min(position, Math.max(0, Number(ownerBoards?.value ?? 1) - 1));
    const [result] = await db.update(boards).set({ name, position: boundedPosition }).where(eq(boards.id, owned.id)).returning();
    return Response.json(result);
  });
}

export function DELETE(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { boardId } = await params;
    const owned = await ownedBoard(userId, boardId);
    await getDb().delete(boards).where(eq(boards.id, owned.id));
    return new Response(null, { status: 204 });
  });
}
