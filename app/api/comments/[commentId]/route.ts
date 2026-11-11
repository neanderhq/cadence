import { eq } from "drizzle-orm";
import { handleApi, ownedComment } from "../../../../server/api";
import { getDb } from "../../../../server/db";
import { comments } from "../../../../server/schema";

type Context = { params: Promise<{ commentId: string }> };

export function GET(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { commentId } = await params;
    const owned = await ownedComment(userId, commentId);
    const [result] = await getDb().select().from(comments).where(eq(comments.id, owned.id)).limit(1);
    return Response.json(result);
  });
}

export function DELETE(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const { commentId } = await params;
    const owned = await ownedComment(userId, commentId);
    await getDb().delete(comments).where(eq(comments.id, owned.id));
    return new Response(null, { status: 204 });
  });
}
