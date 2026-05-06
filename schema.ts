import { sqliteTable, integer, text, index, check } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (e.g. older Hermes builds)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------------------------------------------------------------------------
// catalogue
// Groups items by category. is_structural = true for Locations and Containers
// (excluded from inventory browse views and exports).
// ---------------------------------------------------------------------------
export const catalogue = sqliteTable('catalogue', {
  id:           text('id').primaryKey().$defaultFn(() => generateId()),
  name:         text('name').notNull(),
  icon:         text('icon'),
  description:  text('description'),
  isStructural: integer('is_structural', { mode: 'boolean' }).notNull().default(false),
  sortOrder:    integer('sort_order'),
  createdAt:    text('created_at').notNull().default(sql`(datetime('now'))`),
  lastModified: text('last_modified').notNull().default(sql`(datetime('now'))`),
  deviceId:     text('device_id').notNull(),
  synced:       integer('synced', { mode: 'boolean' }).notNull().default(false),
});

// ---------------------------------------------------------------------------
// item
// Everything in the hierarchy — houses, rooms, drawers, boxes, and all
// inventory items — lives in this single table.
//
// item_number:
//   - INTEGER, unique, not null, always user-assigned, never auto-generated.
//   - Universal reference across the entire hierarchy — structural containers
//     (rooms, drawers, boxes) carry item numbers just like inventory items.
//
// parent_id:
//   - Self-referencing FK. Null only for the root item (the house).
//   - CHECK constraint enforces: can_contain = 1 OR parent_id IS NOT NULL
//     (all non-container items must be inside a container).
//
// can_contain:
//   - Set per item, not per catalogue. A motherboard can contain RAM; a cable
//     in the same catalogue cannot contain anything.
//
// spec:
//   - JSON blob for catalogue-specific fields.
//   - Query with SQLite json_extract(), e.g.:
//       WHERE json_extract(spec, '$.VRAM') = '8GB'
// ---------------------------------------------------------------------------
export const item = sqliteTable('item', {
  id:           text('id').primaryKey().$defaultFn(() => generateId()),
  itemNumber:   integer('item_number').unique(),
  catalogueId:  text('catalogue_id').references(() => catalogue.id),
  parentId:     text('parent_id'),                    // self-ref — see relations below
  name:         text('name').notNull(),
  status:       text('status').default('active'),
  notes:        text('notes'),
  manufacturer: text('manufacturer'),
  model:        text('model'),
  type:         text('type'),
  condition:    text('condition'),
  colour:       text('colour'),
  barcode:      text('barcode'),
  canContain:   integer('can_contain', { mode: 'boolean' }).notNull().default(false),
  spec:         text('spec'),                         // JSON blob
  createdAt:    text('created_at').notNull().default(sql`(datetime('now'))`),
  lastModified: text('last_modified').notNull().default(sql`(datetime('now'))`),
  deviceId:     text('device_id').notNull(),
  synced:       integer('synced', { mode: 'boolean' }).notNull().default(false),
},
(table) => ({
  itemNumberIdx:  index('idx_item_number').on(table.itemNumber),
  parentIdx:      index('idx_item_parent').on(table.parentId),
  catalogueIdx:   index('idx_item_catalogue').on(table.catalogueId),
  syncedIdx:      index('idx_item_synced').on(table.synced),
  parentRequired: check('chk_parent_required', sql`${table.canContain} = 1 OR ${table.parentId} IS NOT NULL`),
}));

// ---------------------------------------------------------------------------
// sync_log
// Audit trail for sync operations. Polymorphic — covers both catalogue and
// item records via entity_type + entity_id. Referential integrity is
// app-enforced (no DB-level FK) so that deletes don't cascade log rows.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// settings
// Key/value store for app-level state: device_id, last_sync_at, etc.
// ---------------------------------------------------------------------------
export const settings = sqliteTable('settings', {
  key:   text('key').primaryKey(),
  value: text('value').notNull(),
});

export const syncLog = sqliteTable('sync_log', {
  id:         text('id').primaryKey().$defaultFn(() => generateId()),
  entityType: text('entity_type', { enum: ['catalogue', 'item'] }).notNull(),
  entityId:   text('entity_id').notNull(),
  operation:  text('operation', { enum: ['insert', 'update', 'delete'] }).notNull(),
  deviceId:   text('device_id').notNull(),
  syncedAt:   text('synced_at').notNull().default(sql`(datetime('now'))`),
  payload:    text('payload'),                        // JSON snapshot
});

// ---------------------------------------------------------------------------
// Relations
// Drizzle requires explicit relation declarations alongside the FK columns.
// item.parentId is a self-reference — handled as a manual relation.
// sync_log has no Drizzle relation — entity_id is polymorphic (app-level).
// ---------------------------------------------------------------------------
export const catalogueRelations = relations(catalogue, ({ many }) => ({
  items: many(item),
}));

export const itemRelations = relations(item, ({ one, many }) => ({
  catalogue: one(catalogue, {
    fields:     [item.catalogueId],
    references: [catalogue.id],
  }),
  parent: one(item, {
    fields:     [item.parentId],
    references: [item.id],
    relationName: 'parent_child',
  }),
  children: many(item, {
    relationName: 'parent_child',
  }),
}));

// ---------------------------------------------------------------------------
// Types
// Inferred TypeScript types for use throughout the app.
// ---------------------------------------------------------------------------
export type Catalogue    = typeof catalogue.$inferSelect;
export type NewCatalogue = typeof catalogue.$inferInsert;
export type Item         = typeof item.$inferSelect;
export type NewItem      = typeof item.$inferInsert;
export type SyncLog      = typeof syncLog.$inferSelect;
export type NewSyncLog   = typeof syncLog.$inferInsert;
export type Settings     = typeof settings.$inferSelect;
