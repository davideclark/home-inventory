CREATE TABLE "catalogue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"description" text,
	"is_structural" boolean DEFAULT false NOT NULL,
	"sort_order" integer,
	"created_at" text DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') NOT NULL,
	"last_modified" text DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') NOT NULL,
	"device_id" text DEFAULT 'server' NOT NULL,
	"synced" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_number" integer,
	"catalogue_id" uuid,
	"parent_id" uuid,
	"name" text NOT NULL,
	"status" text DEFAULT 'active',
	"notes" text,
	"manufacturer" text,
	"model" text,
	"type" text,
	"condition" text,
	"colour" text,
	"barcode" text,
	"can_contain" boolean DEFAULT false NOT NULL,
	"spec" jsonb,
	"created_at" text DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') NOT NULL,
	"last_modified" text DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') NOT NULL,
	"device_id" text DEFAULT 'server' NOT NULL,
	"synced" boolean DEFAULT true NOT NULL,
	CONSTRAINT "item_item_number_unique" UNIQUE("item_number"),
	CONSTRAINT "chk_parent_required" CHECK ("item"."can_contain" = true OR "item"."parent_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"device_id" text NOT NULL,
	"synced_at" text DEFAULT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') NOT NULL,
	"payload" text
);
--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_catalogue_id_catalogue_id_fk" FOREIGN KEY ("catalogue_id") REFERENCES "public"."catalogue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_item_number" ON "item" USING btree ("item_number");--> statement-breakpoint
CREATE INDEX "idx_item_parent" ON "item" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_item_catalogue" ON "item" USING btree ("catalogue_id");--> statement-breakpoint
CREATE INDEX "idx_item_synced" ON "item" USING btree ("synced");