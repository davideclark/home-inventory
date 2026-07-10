CREATE TABLE "item_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" text DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_attachment" ADD CONSTRAINT "item_attachment_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attachment_item" ON "item_attachment" USING btree ("item_id");