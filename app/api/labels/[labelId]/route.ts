import { eq } from "drizzle-orm";
import { handleApi, ownedLabel, optionalText, readJson } from "../../../../server/api";
import { getDb } from "../../../../server/db";
import { labels } from "../../../../server/schema";

type Context = { params: Promise<{ labelId: string }> };

export function GET(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { labelId } = await params;
    const owned = await ownedLabel(userId, labelId);
    const [result] = await getDb().select().from(labels).where(eq(labels.id, owned.id)).limit(1);
    return Response.json(result);
  });
}

export function PATCH(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { labelId } = await params;
    const owned = await ownedLabel(userId, labelId);
    const body = await readJson(request);
    const name = optionalText(body, "name", "Label name", 80);
    const color = optionalText(body, "color", "Label color", 32);
    if (name === undefined && color === undefined) {
      return Response.json({ error: "Provide a label name or color to update." }, { status: 400 });
    }
    if (color !== undefined && !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
      return Response.json({ error: "Label color must be a 3- or 6-digit hex color, such as #336699." }, { status: 400 });
    }
    const [result] = await getDb().update(labels).set({ name, color }).where(eq(labels.id, owned.id)).returning();
    return Response.json(result);
  });
}

export function DELETE(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { labelId } = await params;
    const owned = await ownedLabel(userId, labelId);
    await getDb().delete(labels).where(eq(labels.id, owned.id));
    return new Response(null, { status: 204 });
  });
}
