import { handleApi, optionalPosition, pathId, readJson, requiredText } from "../../../../../server/api";
import { moveBoardCard } from "../../../../../server/card-order";

type Context = { params: Promise<{ cardId: string }> };

export function POST(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { cardId } = await params;
    const body = await readJson(request);
    const listId = pathId(requiredText(body, "listId", "List ID", 64));
    const position = optionalPosition(body);
    if (position === undefined) return Response.json({ error: "Position is required." }, { status: 400 });
    return Response.json(await moveBoardCard(userId, pathId(cardId), listId, position));
  });
}
