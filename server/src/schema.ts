import { pgTable, uuid, text, integer, boolean, jsonb, index, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const catalogue = pgTable('catalogue', {
  id:           uuid('id').primaryKey().defaultRandom(),
  name:         text('name').notNull(),
  icon:         text('icon'),
  description:  text('description'),
  sortOrder:    integer('sort_order'),
  fields:       jsonb('fields'),
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
  notes:        text('notes'),
  canContain:   boolean('can_contain').notNull().default(false),
  spec:         jsonb('spec'),
  hasImage:     boolean('has_image').notNull().default(false),
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

// Unified store for ALL item files — photos and documents (receipts etc.).
// item.hasImage is derived from this table: true when the item has at least
// one 'photo' attachment. The "primary" photo (thumbnail) is the oldest by
// createdAt. Deliberately NOT part of the offline sync protocol — clients
// fetch attachment lists over the API on demand.
export const itemAttachment = pgTable('item_attachment', {
  id:               uuid('id').primaryKey().defaultRandom(),
  itemId:           uuid('item_id').notNull().references(() => item.id, { onDelete: 'cascade' }),
  kind:             text('kind').notNull(), // 'photo' | 'document'
  originalFilename: text('original_filename').notNull(),
  mimeType:         text('mime_type').notNull(),
  size:             integer('size').notNull(),
  createdAt:        text('created_at').notNull().default(sql`to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
},
(table) => ({
  itemIdx: index('idx_attachment_item').on(table.itemId),
}));

export const syncTombstone = pgTable('sync_tombstone', {
  id:         text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId:   text('entity_id').notNull(),
  deletedAt:  text('deleted_at').notNull(),
  deviceId:   text('device_id').notNull(),
});

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

export const users = pgTable('users', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  username:            text('username').notNull().unique(),
  passwordHash:        text('password_hash').notNull(),
  role:                text('role').notNull().default('member'),
  forcePasswordChange: boolean('force_password_change').notNull().default(true),
  createdAt:           text('created_at').notNull().default(sql`to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: text('expires_at').notNull(),
  revoked:   boolean('revoked').notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
});

export type Catalogue      = typeof catalogue.$inferSelect;
export type NewCatalogue   = typeof catalogue.$inferInsert;
export type Item           = typeof item.$inferSelect;
export type NewItem        = typeof item.$inferInsert;
export type User           = typeof users.$inferSelect;
export type NewUser        = typeof users.$inferInsert;
export type ItemAttachment = typeof itemAttachment.$inferSelect;
