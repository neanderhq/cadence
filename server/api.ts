import { and, eq } from "drizzle-orm";
import { getAuth } from "./auth";
import { getDb } from "./db";
import { boards, cards, checklistItems, comments, labels, lists } from "./schema";

const maxJsonBytes = 64 * 1024;

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function handleApi(
  request: Request,
  handler: (userId: string) => Promise<Response>,
) {
  try {
    if (request.method !== "GET" && request.method !== "HEAD" && !isAllowedOrigin(request)) {
      throw new ApiError(403, "Request origin is not allowed.");
    }
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) throw new ApiError(401, "Sign in required.");
    return await handler(session.user.id);
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(request.method, new URL(request.url).pathname, error instanceof Error ? error.message : String(error));
    return Response.json({ error: "The server couldn’t complete this request. Please try again." }, { status: 500 });
  }
}

function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const configuredUrl = process.env.BETTER_AUTH_URL || (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
  let configuredOrigin: string;
  try {
    configuredOrigin = new URL(configuredUrl).origin;
  } catch {
    return false;
  }
  if (origin === configuredOrigin) return true;
  return process.env.NODE_ENV === "development"
    && (origin === "http://localhost:3000" || origin === "http://127.0.0.1:3000");
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.trim().toLowerCase() ?? "";
  if (!/^application\/json(?:\s*;|$)/.test(contentType)) {
    throw new ApiError(415, "Content-Type must be application/json.");
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxJsonBytes) {
    throw new ApiError(413, "Request body must be 64 KB or smaller.");
  }
  let value: unknown;
  try {
    let body = "";
    if (request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let byteLength = 0;
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        byteLength += chunk.byteLength;
        if (byteLength > maxJsonBytes) {
          await reader.cancel();
          throw new ApiError(413, "Request body must be 64 KB or smaller.");
        }
        chunks.push(chunk);
      }
      const bytes = new Uint8Array(byteLength);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      body = new TextDecoder().decode(bytes);
    }
    value = JSON.parse(body);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Request body must be valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "Request body must be a JSON object.");
  }
  rejectNulStrings(value);
  return value as Record<string, unknown>;
}

function rejectNulStrings(value: unknown): void {
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === "string" && current.includes("\0")) {
      throw new ApiError(400, "Text fields cannot contain NUL characters.");
    }
    if (Array.isArray(current)) {
      pending.push(...current);
    } else if (current && typeof current === "object") {
      for (const [key, nested] of Object.entries(current)) {
        pending.push(key, nested);
      }
    }
  }
}

export function pathId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    if (value.includes("\0")) throw new ApiError(400, "IDs cannot contain NUL characters.");
    throw new ApiError(400, "ID must be a valid UUID.");
  }
  return value;
}

export function requiredText(body: Record<string, unknown>, key: string, label: string, max: number): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, `${label} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ApiError(400, `${label} must be ${max} characters or fewer.`);
  return trimmed;
}

export function optionalText(body: Record<string, unknown>, key: string, label: string, max: number): string | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (typeof value !== "string") throw new ApiError(400, `${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ApiError(400, `${label} must be ${max} characters or fewer.`);
  if (trimmed.length === 0 && label !== "Description") throw new ApiError(400, `${label} is required.`);
  return trimmed;
}

export function optionalPosition(body: Record<string, unknown>): number | undefined {
  if (!("position" in body)) return undefined;
  const value = body.position;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 2147483647) {
    throw new ApiError(400, "Position must be a whole number between zero and 2,147,483,647.");
  }
  return value;
}

export function requiredBoolean(body: Record<string, unknown>, key: string, label: string): boolean {
  if (typeof body[key] !== "boolean") throw new ApiError(400, `${label} must be true or false.`);
  return body[key] as boolean;
}

export function optionalDate(body: Record<string, unknown>, key: string, label: string): Date | null | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, `${label} must be an ISO date between 1900 and 2200, or null.`);
  }
  const year = Number(value.slice(0, 4));
  const date = new Date(`${value}T00:00:00.000Z`);
  if (year < 1900 || year > 2200 || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, `${label} must be an ISO date between 1900 and 2200, or null.`);
  }
  return date;
}

export async function ownedBoard(userId: string, rawId: string) {
  const id = pathId(rawId);
  const [board] = await getDb().select({ id: boards.id }).from(boards)
    .where(and(eq(boards.id, id), eq(boards.ownerId, userId))).limit(1);
  if (!board) throw new ApiError(404, "Resource not found.");
  return board;
}

export async function ownedList(userId: string, rawId: string) {
  const id = pathId(rawId);
  const [result] = await getDb().select({ id: lists.id, boardId: lists.boardId }).from(lists)
    .innerJoin(boards, eq(lists.boardId, boards.id))
    .where(and(eq(lists.id, id), eq(boards.ownerId, userId))).limit(1);
  if (!result) throw new ApiError(404, "Resource not found.");
  return result;
}

export async function ownedCard(userId: string, rawId: string) {
  const id = pathId(rawId);
  const [result] = await getDb().select({ id: cards.id, listId: cards.listId, boardId: lists.boardId }).from(cards)
    .innerJoin(lists, eq(cards.listId, lists.id))
    .innerJoin(boards, eq(lists.boardId, boards.id))
    .where(and(eq(cards.id, id), eq(boards.ownerId, userId))).limit(1);
  if (!result) throw new ApiError(404, "Resource not found.");
  return result;
}

export async function ownedLabel(userId: string, rawId: string) {
  const id = pathId(rawId);
  const [result] = await getDb().select({ id: labels.id, boardId: labels.boardId }).from(labels)
    .innerJoin(boards, eq(labels.boardId, boards.id))
    .where(and(eq(labels.id, id), eq(boards.ownerId, userId))).limit(1);
  if (!result) throw new ApiError(404, "Resource not found.");
  return result;
}

export async function ownedChecklistItem(userId: string, rawId: string) {
  const id = pathId(rawId);
  const [result] = await getDb().select({ id: checklistItems.id, cardId: checklistItems.cardId }).from(checklistItems)
    .innerJoin(cards, eq(checklistItems.cardId, cards.id))
    .innerJoin(lists, eq(cards.listId, lists.id))
    .innerJoin(boards, eq(lists.boardId, boards.id))
    .where(and(eq(checklistItems.id, id), eq(boards.ownerId, userId))).limit(1);
  if (!result) throw new ApiError(404, "Resource not found.");
  return result;
}

export async function ownedComment(userId: string, rawId: string) {
  const id = pathId(rawId);
  const [result] = await getDb().select({ id: comments.id, cardId: comments.cardId }).from(comments)
    .innerJoin(cards, eq(comments.cardId, cards.id))
    .innerJoin(lists, eq(cards.listId, lists.id))
    .innerJoin(boards, eq(lists.boardId, boards.id))
    .where(and(eq(comments.id, id), eq(boards.ownerId, userId), eq(comments.authorId, userId))).limit(1);
  if (!result) throw new ApiError(404, "Resource not found.");
  return result;
}

export function notFound() {
  throw new ApiError(404, "Resource not found.");
}
