import { handleApi, pathId, readJson, requiredText } from "../../../../../server/api";
import { copyBoardCard } from "../../../../../server/card-order";

type Context = { params: Promise<{ cardId: string }> };

export function POST(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const sourceId = pathId((await params).cardId).toLowerCase();
    const body = await readJson(request);
    const destinationId = pathId(requiredText(body, "listId", "List", 36)).toLowerCase();
    const requestId = pathId(requiredText(body, "requestId", "Request ID", 36)).toLowerCase();
    const title = requiredText(body, "title", "Brief title", 200);
    const { replayed, ...result } = await copyBoardCard(userId, sourceId, destinationId, title, requestId);
    return Response.json(result, { status: replayed ? 200 : 201 });
  });
}
