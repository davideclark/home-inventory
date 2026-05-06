import { pgTable, uuid, text, integer, boolean, jsonb, index, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const catalogue = pgTable('catalogue', {
  id:           uuid('id').primaryKey().defaultRandom(),
  name:         text('name').notNull(),
  icon:         text('icon'),
  description:  text('description'),
  isStructural: boolean('is_structural').notNull().default(false),
  sortOrder:    integer('sort_order'),
  createdAt:    text('created_at').notNull().default(sql`to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  lastModified: text('last_modified').notNull().default(sql`to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  deviceId:     text('device_id').notNull().default('server'),
  synced:       boolean('synced').notNull().default(true),
});

export const item = pgTable('item', {
  id:           uuid('id').primaryKey().defaultRandom(),
  itemNumber:   integer('item_number').unique(),
  catalogueId:  uuid('catalogue_id').references(() => catalogue.id),
  parentId:     uuid('parent_id'),
  name:         text('name').notNull(),
  status:       text('status').default('active'),
  notes:        text('notes'),
  manufacturer: text('manufacturer'),
  model:        text('model'),
  type:         text('type'),
  condition:    text('condition'),
  colour:       text('colour'),
  barcode:      text('barcode'),
  canContain:   boolean('can_contain').notNull().default(false),
  spec:         jsonb('spec'),
  createdAt:    text('created_at').notNull().default(sql`to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  lastModified: text('last_modified').notNull().default(sql`to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  deviceId:     text('device_id').notNull().default('server'),
  synced:       boolean('synced').notNull().default(true),
},
(table) => ({
  itemNumberIdx:  index('idx_item_number').on(table.itemNumber),
  parentIdx:      index('idx_item_parent').on(table.parentId),
  catalogueIdx:   index('idx_item_catalogue').on(table.catalogueId),
  syncedIdx:      index('idx_item_synced').on(table.synced),
  parentRequired: check('chk_parent_required', sql`${table.canContain} = true OR ${table.parentId} IS NOT NULL`),
}));

export const syncLog = pgTable('sync_log', {
  id:         uuid('id').primaryKey().defaultRandom(),
  entityType: text('entity_type').notNull(),
  entityId:   uuid('entity_id').notNull(),
  operation:  text('operation').notNull(),
  deviceId:   text('device_id').notNull(),
  syncedAt:   text('synced_at').notNull().default(sql`to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
  payload:    text('payload'),
});

export const catalogueRelations = relations(catalogue, ({ many }) => ({
  items: many(item),
}));

export const itemRelations = relations(item, ({ one, many }) => ({
  catalogue: one(catalogue, { fields: [item.catalogueId], references: [catalogue.id] }),
  parent: one(item, { fields: [item.parentId], references: [item.id], relationName: 'parent_child' }),
  children: many(item, { relationName: 'parent_child' }),
}));

export type Catalogue    = typeof catalogue.$inferSelect;
export type NewCatalogue = typeof catalogue.$inferInsert;
export type Item         = typeof item.$inferSelect;
export type NewItem      = typeof item.$inferInsert;
