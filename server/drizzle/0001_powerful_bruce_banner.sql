CREATE TABLE "sync_tombstone" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"deleted_at" text NOT NULL,
	"device_id" text NOT NULL
);
