import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { boards, cardLabels, cards, checklistItems, comments, labels, lists } from "./schema";

function daysFromToday(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date;
}

const sampleLists = ["Ideas", "Drafting", "Review", "Ready", "Published"];
const sampleLabels = [
  { name: "Blog", color: "#286a59" },
  { name: "Social", color: "#5a62a8" },
  { name: "Email", color: "#9a5a23" },
  { name: "Video", color: "#aa4562" },
  { name: "Urgent", color: "#b33a32" },
];

const sampleCards = [
  {
    list: "Ideas", title: "Map customer stories for the next launch", dueIn: -3, labels: ["Blog", "Urgent"],
    checklist: [{ text: "Choose customer interviews", done: true }, { text: "Confirm launch themes", done: false }],
    comment: "Let’s lead with the results customers can measure.",
  },
  {
    list: "Ideas", title: "Plan a helpful holiday email series", dueIn: 6, labels: ["Email"],
    checklist: [{ text: "Outline three sends", done: true }, { text: "Gather seasonal offers", done: true }, { text: "Review the schedule", done: false }],
  },
  {
    list: "Drafting", title: "Turn launch notes into a founder post", dueIn: 2, labels: ["Social", "Blog"],
    checklist: [{ text: "Draft the opening", done: true }, { text: "Add product detail", done: false }],
  },
  {
    list: "Drafting", title: "Write a customer spotlight for Northstar", dueIn: null, labels: ["Blog"],
  },
  {
    list: "Review", title: "QA the November newsletter", dueIn: -1, labels: ["Email", "Urgent"],
    checklist: [{ text: "Check links", done: true }, { text: "Proofread subject line", done: true }, { text: "Test mobile layout", done: false }],
  },
  {
    list: "Ready", title: "Film a behind-the-scenes short", dueIn: 10, labels: ["Video", "Social"],
    checklist: [{ text: "Write shot list", done: true }, { text: "Book a filming slot", done: false }],
  },
  {
    list: "Published", title: "Share the October performance recap", dueIn: null, labels: ["Blog"],
  },
  {
    list: "Published", title: "Post the community highlights carousel", dueIn: 13, labels: ["Social"],
  },
];

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
