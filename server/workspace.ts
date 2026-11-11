import sampleData from "../.neander/sample-data.json";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { boards, cardLabels, cards, checklistItems, comments, labels, lists } from "./schema";

function daysFromToday(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}

const { lists: sampleLists, labels: sampleLabels, cards: sampleCards } = sampleData;

export async function ensurePrivateWorkspace(userId: string) {
  await getDb().transaction(async (transaction) => {
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);

    const [existingBoard] = await transaction.select({ id: boards.id }).from(boards)
      .where(sql`${boards.ownerId} = ${userId}`).limit(1);
    if (existingBoard) return;

    const [board] = await transaction.insert(boards).values({
      ownerId: userId,
      name: "Marketing Content Calendar",
      position: 0,
    }).returning({ id: boards.id });

    const createdLists = await transaction.insert(lists).values(sampleLists.map((name, position) => ({
      boardId: board.id,
      name,
      position,
    }))).returning({ id: lists.id, name: lists.name });
    const listIds = new Map(createdLists.map((list) => [list.name, list.id]));

    const createdLabels = await transaction.insert(labels).values(sampleLabels.map((label) => ({
      boardId: board.id,
      ...label,
    }))).returning({ id: labels.id, name: labels.name });
    const labelIds = new Map(createdLabels.map((label) => [label.name, label.id]));
    const cardPositions = new Map(sampleLists.map((name) => [name, 0]));

    for (const sample of sampleCards) {
      const listId = listIds.get(sample.list);
      const [card] = await transaction.insert(cards).values({
        listId: listId!,
        title: sample.title,
        description: "",
        position: cardPositions.get(sample.list)!,
        dueDate: sample.dueIn === null ? null : daysFromToday(sample.dueIn),
      }).returning({ id: cards.id });
      cardPositions.set(sample.list, cardPositions.get(sample.list)! + 1);

      const cardLabelRows = sample.labels.map((name) => ({ cardId: card.id, labelId: labelIds.get(name)! }));
      if (cardLabelRows.length) await transaction.insert(cardLabels).values(cardLabelRows);
      if (sample.checklist?.length) {
        await transaction.insert(checklistItems).values(sample.checklist.map((item, position) => ({
          cardId: card.id,
          text: item.text,
          done: item.done,
          position,
        })));
      }
      if (sample.comment) {
        await transaction.insert(comments).values({ cardId: card.id, authorId: userId, text: sample.comment });
      }
    }
  });
}
