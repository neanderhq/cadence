import { ApiError, handleApi, ownedBoard, pathId, readJson } from "../../../../../../server/api";
import { reorderBoardLists } from "../../../../../../server/list-order";

type Context = { params: Promise<{ boardId: string }> };

export function POST(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { boardId } = await params;
    const validatedBoardId = pathId(boardId);
    const body = await readJson(request);
    if (!Array.isArray(body.listIds) || body.listIds.some((id) => typeof id !== "string")) {
      throw new ApiError(400, "List order must be an array of list IDs.");
    }
    const listIds = body.listIds.map((id) => pathId(id as string));
    const board = await ownedBoard(userId, validatedBoardId);
    return Response.json({ listIds: await reorderBoardLists(board.id, listIds) });
  });
}
