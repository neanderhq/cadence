import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const boards = pgTable("boards", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
}, (table) => [index("boards_owner_position_idx").on(table.ownerId, table.position)]);

export const lists = pgTable("lists", {
  id: uuid("id").defaultRandom().primaryKey(),
  boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
}, (table) => [index("lists_board_position_idx").on(table.boardId, table.position)]);

export const cards = pgTable("cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  listId: uuid("list_id").notNull().references(() => lists.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  position: integer("position").notNull().default(0),
  dueDate: timestamp("due_date", { withTimezone: true, mode: "date" }),
  archived: boolean("archived").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
}, (table) => [index("cards_list_position_idx").on(table.listId, table.position)]);

export const briefCopies = pgTable("brief_copies", {
  boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  requestId: uuid("request_id").notNull(),
  sourceId: uuid("source_id").notNull(),
  destinationId: uuid("destination_id").notNull(),
  title: text("title").notNull(),
  copyId: uuid("copy_id").references(() => cards.id, { onDelete: "set null" }),
}, (table) => [
  primaryKey({ columns: [table.boardId, table.requestId] }),
  index("brief_copies_copy_idx").on(table.copyId),
]);

export const labels = pgTable("labels", {
  id: uuid("id").defaultRandom().primaryKey(),
  boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull(),
}, (table) => [index("labels_board_idx").on(table.boardId)]);

export const cardLabels = pgTable("card_labels", {
  cardId: uuid("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  labelId: uuid("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.cardId, table.labelId] }),
  index("card_labels_label_idx").on(table.labelId),
]);

export const checklistItems = pgTable("checklist_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  done: boolean("done").notNull().default(false),
  position: integer("position").notNull().default(0),
}, (table) => [index("checklist_items_card_position_idx").on(table.cardId, table.position)]);

export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [
  index("comments_card_created_idx").on(table.cardId, table.createdAt),
  index("comments_author_idx").on(table.authorId),
]);

export * from "./auth-schema";
