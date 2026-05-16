-- 1. Copy column values into spec (PostgreSQL jsonb syntax)
UPDATE "item" SET "spec" = COALESCE("spec", '{}'::jsonb) || jsonb_build_object('manufacturer', "manufacturer") WHERE "manufacturer" IS NOT NULL;--> statement-breakpoint
UPDATE "item" SET "spec" = COALESCE("spec", '{}'::jsonb) || jsonb_build_object('model',        "model")        WHERE "model"        IS NOT NULL;--> statement-breakpoint
UPDATE "item" SET "spec" = COALESCE("spec", '{}'::jsonb) || jsonb_build_object('type',         "type")         WHERE "type"         IS NOT NULL;--> statement-breakpoint
UPDATE "item" SET "spec" = COALESCE("spec", '{}'::jsonb) || jsonb_build_object('condition',    "condition")    WHERE "condition"    IS NOT NULL;--> statement-breakpoint
UPDATE "item" SET "spec" = COALESCE("spec", '{}'::jsonb) || jsonb_build_object('colour',       "colour")       WHERE "colour"       IS NOT NULL;--> statement-breakpoint
UPDATE "item" SET "spec" = COALESCE("spec", '{}'::jsonb) || jsonb_build_object('barcode',      "barcode")      WHERE "barcode"      IS NOT NULL;--> statement-breakpoint
UPDATE "item" SET "spec" = COALESCE("spec", '{}'::jsonb) || jsonb_build_object('status',       "status")       WHERE "status" IS NOT NULL AND "status" != 'active';--> statement-breakpoint

-- 2. Ensure catalogue fields is an array
UPDATE "catalogue" SET "fields" = '[]'::jsonb WHERE "fields" IS NULL;--> statement-breakpoint

-- 3. Add FieldDef entries per catalogue
UPDATE "catalogue" SET "fields" = "fields" || jsonb_build_array(jsonb_build_object('key','manufacturer','label','Manufacturer','type','text','showInList',false))
  WHERE "id" IN (SELECT DISTINCT "catalogue_id" FROM "item" WHERE "catalogue_id" IS NOT NULL AND "manufacturer" IS NOT NULL);--> statement-breakpoint
UPDATE "catalogue" SET "fields" = "fields" || jsonb_build_array(jsonb_build_object('key','model','label','Model','type','text','showInList',false))
  WHERE "id" IN (SELECT DISTINCT "catalogue_id" FROM "item" WHERE "catalogue_id" IS NOT NULL AND "model" IS NOT NULL);--> statement-breakpoint
UPDATE "catalogue" SET "fields" = "fields" || jsonb_build_array(jsonb_build_object('key','type','label','Type','type','text','showInList',false))
  WHERE "id" IN (SELECT DISTINCT "catalogue_id" FROM "item" WHERE "catalogue_id" IS NOT NULL AND "type" IS NOT NULL);--> statement-breakpoint
UPDATE "catalogue" SET "fields" = "fields" || jsonb_build_array(jsonb_build_object('key','condition','label','Condition','type','text','showInList',false))
  WHERE "id" IN (SELECT DISTINCT "catalogue_id" FROM "item" WHERE "catalogue_id" IS NOT NULL AND "condition" IS NOT NULL);--> statement-breakpoint
UPDATE "catalogue" SET "fields" = "fields" || jsonb_build_array(jsonb_build_object('key','colour','label','Colour','type','text','showInList',false))
  WHERE "id" IN (SELECT DISTINCT "catalogue_id" FROM "item" WHERE "catalogue_id" IS NOT NULL AND "colour" IS NOT NULL);--> statement-breakpoint
UPDATE "catalogue" SET "fields" = "fields" || jsonb_build_array(jsonb_build_object('key','barcode','label','Barcode','type','text','showInList',false))
  WHERE "id" IN (SELECT DISTINCT "catalogue_id" FROM "item" WHERE "catalogue_id" IS NOT NULL AND "barcode" IS NOT NULL);--> statement-breakpoint
UPDATE "catalogue" SET "fields" = "fields" || jsonb_build_array(jsonb_build_object('key','status','label','Status','type','text','showInList',false))
  WHERE "id" IN (SELECT DISTINCT "catalogue_id" FROM "item" WHERE "catalogue_id" IS NOT NULL AND "status" IS NOT NULL AND "status" != 'active');--> statement-breakpoint

-- 4. Drop the dedicated columns
ALTER TABLE "item" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "item" DROP COLUMN "manufacturer";--> statement-breakpoint
ALTER TABLE "item" DROP COLUMN "model";--> statement-breakpoint
ALTER TABLE "item" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "item" DROP COLUMN "condition";--> statement-breakpoint
ALTER TABLE "item" DROP COLUMN "colour";--> statement-breakpoint
ALTER TABLE "item" DROP COLUMN "barcode";
