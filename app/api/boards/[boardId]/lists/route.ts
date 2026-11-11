import { asc, eq } from "drizzle-orm";
import { handleApi, ownedBoard, optionalPosition, readJson, requiredText } from "../../../../../server/api";
import { getDb } from "../../../../../server/db";
import { lists } from "../../../../../server/schema";
import { createBoardList } from "../../../../../server/list-order";

type Context = { params: Promise<{ boardId: string }> };

export function GET(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { boardId } = await params;
    const board = await ownedBoard(userId, boardId);
    return Response.json(await getDb().select().from(lists).where(eq(lists.boardId, board.id))
      .orderBy(asc(lists.position), asc(lists.id)));
  });
}

export function POST(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { boardId } = await params;
    const board = await ownedBoard(userId, boardId);
    const body = await readJson(request);
    const name = requiredText(body, "name", "List name", 120);
    const position = optionalPosition(body);
    const created = await createBoardList(board.id, name, position);
    return Response.json(created, { status: 201 });
  });
}
