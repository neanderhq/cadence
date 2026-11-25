import { handleApi, ownedBoard, readJson, requiredText } from "../../../../../server/api";
import { boardReviewer, grantBoardReviewer, revokeBoardReviewer } from "../../../../../server/reviewer-access";

type Context = { params: Promise<{ boardId: string }> };

export function GET(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const board = await ownedBoard(userId, (await params).boardId);
    return Response.json(await boardReviewer(board.id));
  });
}

export function POST(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const reviewerId = requiredText(await readJson(request), "reviewerId", "Reviewer ID", 128);
    const { reviewer, created } = await grantBoardReviewer(userId, (await params).boardId, reviewerId);
    return Response.json(reviewer, { status: created ? 201 : 200 });
  });
}

export function DELETE(request: Request, { params }: Context) {
  return handleApi(request, async (userId) => {
    const reviewerId = requiredText(await readJson(request), "reviewerId", "Reviewer ID", 128);
    await revokeBoardReviewer(userId, (await params).boardId, reviewerId);
    return new Response(null, { status: 204 });
  });
}
