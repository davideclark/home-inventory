PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_item` (
	`id` text PRIMARY KEY NOT NULL,
	`item_number` integer,
	`catalogue_id` text,
	`parent_id` text,
	`name` text NOT NULL,
	`status` text DEFAULT 'active',
	`notes` text,
	`manufacturer` text,
	`model` text,
	`type` text,
	`condition` text,
	`colour` text,
	`barcode` text,
	`can_contain` integer DEFAULT false NOT NULL,
	`spec` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_modified` text DEFAULT (datetime('now')) NOT NULL,
	`device_id` text NOT NULL,
	`synced` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`catalogue_id`) REFERENCES `catalogue`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_parent_required" CHECK("__new_item"."can_contain" = 1 OR "__new_item"."parent_id" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_item`("id", "item_number", "catalogue_id", "parent_id", "name", "status", "notes", "manufacturer", "model", "type", "condition", "colour", "barcode", "can_contain", "spec", "created_at", "last_modified", "device_id", "synced") SELECT "id", "item_number", "catalogue_id", "parent_id", "name", "status", "notes", "manufacturer", "model", "type", "condition", "colour", "barcode", "can_contain", "spec", "created_at", "last_modified", "device_id", "synced" FROM `item`;--> statement-breakpoint
DROP TABLE `item`;--> statement-breakpoint
ALTER TABLE `__new_item` RENAME TO `item`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `item_item_number_unique` ON `item` (`item_number`);--> statement-breakpoint
CREATE INDEX `idx_item_number` ON `item` (`item_number`);--> statement-breakpoint
CREATE INDEX `idx_item_parent` ON `item` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_item_catalogue` ON `item` (`catalogue_id`);--> statement-breakpoint
CREATE INDEX `idx_item_synced` ON `item` (`synced`);