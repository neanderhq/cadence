import { asc, count, eq, sql } from "drizzle-orm";
import { ApiError, handleApi, readJson, requiredText, optionalPosition } from "../../../server/api";
import { getDb } from "../../../server/db";
import { boards } from "../../../server/schema";

export function GET(request: Request) {
  return handleApi(request, async (userId) => {
    const result = await getDb().select().from(boards).where(eq(boards.ownerId, userId))
      .orderBy(asc(boards.position), asc(boards.id));
    return Response.json(result);
  });
}

export function POST(request: Request) {
  return handleApi(request, async (userId) => {
    const body = await readJson(request);
    const name = requiredText(body, "name", "Board name", 120);
    const requestedPosition = optionalPosition(body);
    const [created] = await getDb().transaction(async (transaction) => {
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
      const [current] = await transaction.select({ value: count() }).from(boards).where(eq(boards.ownerId, userId));
      const boardCount = Number(current.value);
      if (boardCount >= 50) throw new ApiError(400, "You can have up to 50 boards.");
      const position = Math.min(requestedPosition ?? boardCount, boardCount);
      return transaction.insert(boards).values({ ownerId: userId, name, position }).returning();
    });
    return Response.json(created, { status: 201 });
  });
}
