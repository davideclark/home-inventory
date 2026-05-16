-- 1. Ensure spec is an object for items that need it
UPDATE `item` SET `spec` = '{}' WHERE `spec` IS NULL AND (
  `manufacturer` IS NOT NULL OR `model` IS NOT NULL OR `type` IS NOT NULL OR
  `condition` IS NOT NULL OR `colour` IS NOT NULL OR `barcode` IS NOT NULL OR `status` IS NOT NULL
);--> statement-breakpoint

-- 2. Copy column values into spec
UPDATE `item` SET `spec` = json_set(`spec`, '$.manufacturer', `manufacturer`) WHERE `manufacturer` IS NOT NULL;--> statement-breakpoint
UPDATE `item` SET `spec` = json_set(`spec`, '$.model',        `model`)        WHERE `model`        IS NOT NULL;--> statement-breakpoint
UPDATE `item` SET `spec` = json_set(`spec`, '$.type',         `type`)         WHERE `type`         IS NOT NULL;--> statement-breakpoint
UPDATE `item` SET `spec` = json_set(`spec`, '$.condition',    `condition`)    WHERE `condition`    IS NOT NULL;--> statement-breakpoint
UPDATE `item` SET `spec` = json_set(`spec`, '$.colour',       `colour`)       WHERE `colour`       IS NOT NULL;--> statement-breakpoint
UPDATE `item` SET `spec` = json_set(`spec`, '$.barcode',      `barcode`)      WHERE `barcode`      IS NOT NULL;--> statement-breakpoint
UPDATE `item` SET `spec` = json_set(`spec`, '$.status',       `status`)       WHERE `status` IS NOT NULL AND `status` != 'active';--> statement-breakpoint

-- 3. Ensure catalogue fields is an array
UPDATE `catalogue` SET `fields` = '[]' WHERE `fields` IS NULL OR NOT json_valid(`fields`);--> statement-breakpoint

-- 4. Add FieldDef entries to catalogues that have items using each column
UPDATE `catalogue` SET `fields` = json_insert(`fields`, '$[#]', json_object('key','manufacturer','label','Manufacturer','type','text','showInList',0))
  WHERE `id` IN (SELECT DISTINCT `catalogue_id` FROM `item` WHERE `catalogue_id` IS NOT NULL AND `manufacturer` IS NOT NULL);--> statement-breakpoint
UPDATE `catalogue` SET `fields` = json_insert(`fields`, '$[#]', json_object('key','model','label','Model','type','text','showInList',0))
  WHERE `id` IN (SELECT DISTINCT `catalogue_id` FROM `item` WHERE `catalogue_id` IS NOT NULL AND `model` IS NOT NULL);--> statement-breakpoint
UPDATE `catalogue` SET `fields` = json_insert(`fields`, '$[#]', json_object('key','type','label','Type','type','text','showInList',0))
  WHERE `id` IN (SELECT DISTINCT `catalogue_id` FROM `item` WHERE `catalogue_id` IS NOT NULL AND `type` IS NOT NULL);--> statement-breakpoint
UPDATE `catalogue` SET `fields` = json_insert(`fields`, '$[#]', json_object('key','condition','label','Condition','type','text','showInList',0))
  WHERE `id` IN (SELECT DISTINCT `catalogue_id` FROM `item` WHERE `catalogue_id` IS NOT NULL AND `condition` IS NOT NULL);--> statement-breakpoint
UPDATE `catalogue` SET `fields` = json_insert(`fields`, '$[#]', json_object('key','colour','label','Colour','type','text','showInList',0))
  WHERE `id` IN (SELECT DISTINCT `catalogue_id` FROM `item` WHERE `catalogue_id` IS NOT NULL AND `colour` IS NOT NULL);--> statement-breakpoint
UPDATE `catalogue` SET `fields` = json_insert(`fields`, '$[#]', json_object('key','barcode','label','Barcode','type','text','showInList',0))
  WHERE `id` IN (SELECT DISTINCT `catalogue_id` FROM `item` WHERE `catalogue_id` IS NOT NULL AND `barcode` IS NOT NULL);--> statement-breakpoint
UPDATE `catalogue` SET `fields` = json_insert(`fields`, '$[#]', json_object('key','status','label','Status','type','text','showInList',0))
  WHERE `id` IN (SELECT DISTINCT `catalogue_id` FROM `item` WHERE `catalogue_id` IS NOT NULL AND `status` IS NOT NULL AND `status` != 'active');--> statement-breakpoint

-- 5. Drop the dedicated columns
ALTER TABLE `item` DROP COLUMN `status`;--> statement-breakpoint
ALTER TABLE `item` DROP COLUMN `manufacturer`;--> statement-breakpoint
ALTER TABLE `item` DROP COLUMN `model`;--> statement-breakpoint
ALTER TABLE `item` DROP COLUMN `type`;--> statement-breakpoint
ALTER TABLE `item` DROP COLUMN `condition`;--> statement-breakpoint
ALTER TABLE `item` DROP COLUMN `colour`;--> statement-breakpoint
ALTER TABLE `item` DROP COLUMN `barcode`;
