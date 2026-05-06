CREATE TABLE `catalogue` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`description` text,
	`is_structural` integer DEFAULT false NOT NULL,
	`sort_order` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_modified` text DEFAULT (datetime('now')) NOT NULL,
	`device_id` text NOT NULL,
	`synced` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `item` (
	`id` text PRIMARY KEY NOT NULL,
	`item_number` integer NOT NULL,
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
	CONSTRAINT "chk_parent_required" CHECK("item"."can_contain" = 1 OR "item"."parent_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_item_number_unique` ON `item` (`item_number`);--> statement-breakpoint
CREATE INDEX `idx_item_number` ON `item` (`item_number`);--> statement-breakpoint
CREATE INDEX `idx_item_parent` ON `item` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_item_catalogue` ON `item` (`catalogue_id`);--> statement-breakpoint
CREATE INDEX `idx_item_synced` ON `item` (`synced`);--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`operation` text NOT NULL,
	`device_id` text NOT NULL,
	`synced_at` text DEFAULT (datetime('now')) NOT NULL,
	`payload` text
);
