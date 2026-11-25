CREATE TABLE "board_reviewers" (
	"board_id" uuid PRIMARY KEY NOT NULL,
	"reviewer_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_reviewers" ADD CONSTRAINT "board_reviewers_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_reviewers" ADD CONSTRAINT "board_reviewers_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_reviewers_reviewer_idx" ON "board_reviewers" USING btree ("reviewer_id");