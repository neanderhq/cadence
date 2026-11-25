CREATE TABLE "brief_copies" (
	"board_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"destination_id" uuid NOT NULL,
	"title" text NOT NULL,
	"copy_id" uuid,
	CONSTRAINT "brief_copies_board_id_request_id_pk" PRIMARY KEY("board_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "brief_copies" ADD CONSTRAINT "brief_copies_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_copies" ADD CONSTRAINT "brief_copies_copy_id_cards_id_fk" FOREIGN KEY ("copy_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brief_copies_copy_idx" ON "brief_copies" USING btree ("copy_id");