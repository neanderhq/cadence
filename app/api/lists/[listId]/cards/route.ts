import { asc, eq } from "drizzle-orm";
import { handleApi, optionalDate, optionalPosition, optionalText, ownedList, readJson, requiredText } from "../../../../../server/api";
import { createBoardCard } from "../../../../../server/card-order";
import { getDb } from "../../../../../server/db";
import { cards } from "../../../../../server/schema";

type Context = { params: Promise<{ listId: string }> };

export function GET(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { listId } = await params;
    const list = await ownedList(userId, listId);
    return Response.json(await getDb().select().from(cards).where(eq(cards.listId, list.id))
      .orderBy(asc(cards.position), asc(cards.id)));
  });
}

export function POST(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { listId } = await params;
    const list = await ownedList(userId, listId);
    const body = await readJson(request);
    const title = requiredText(body, "title", "Card title", 200);
    const description = optionalText(body, "description", "Description", 10000) ?? "";
    const dueDate = optionalDate(body, "dueDate", "Due date") ?? null;
    const position = optionalPosition(body);
    const created = await createBoardCard(userId, list.id, { title, description, dueDate, position });
    return Response.json(created, { status: 201 });
  });
}
