CREATE INDEX "boards_owner_position_idx" ON "boards" USING btree ("owner_id","position");--> statement-breakpoint
CREATE INDEX "card_labels_label_idx" ON "card_labels" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "cards_list_position_idx" ON "cards" USING btree ("list_id","position");--> statement-breakpoint
CREATE INDEX "checklist_items_card_position_idx" ON "checklist_items" USING btree ("card_id","position");--> statement-breakpoint
CREATE INDEX "comments_card_created_idx" ON "comments" USING btree ("card_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_author_idx" ON "comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "labels_board_idx" ON "labels" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "lists_board_position_idx" ON "lists" USING btree ("board_id","position");