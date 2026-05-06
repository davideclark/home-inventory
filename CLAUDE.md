# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A personal home inventory app for cataloguing hardware collections. Built with Expo (React Native) targeting iOS, Android, and web. Fully offline-first with SQLite on device; syncs to a self-hosted Hono/PostgreSQL backend on a Synology NAS.

Requirements and data model are documented in Notion:
- Overview: https://www.notion.so/Home-Inventory-App-357f3ff0a69081e4b728cf7c70bd347b
- Data Model: https://www.notion.so/357f3ff0a6908191b4faf1b656e68aeb
- Requirements: https://www.notion.so/357f3ff0a690812b92ecf2465f496130
- Inventory data: https://www.notion.so/Hardware-Inventory-34ff3ff0a690817899a9cb25c4531adb (23 databases, ~1170 items)

## Tech Stack

### Mobile app
- **Framework**: Expo SDK 54 + React Native 0.81.5 + React 19.1.0
- **Navigation**: Expo Router (file-based, `app/` directory)
- **Database**: SQLite via `expo-sqlite` + Drizzle ORM
- **Migrations**: `drizzle-kit` — run `npx drizzle-kit generate` after schema changes
- **Notion integration**: MCP server (`@notionhq/notion-mcp-server`) in `.claudecode.json`

### Backend (server/)
- **Framework**: Node.js + Hono
- **Database**: PostgreSQL 16 via Drizzle ORM (`drizzle-orm/postgres-js`)
- **MCP server**: `@modelcontextprotocol/sdk` — stdio transport, registered in `.claudecode.json`
- **Infrastructure**: Docker Compose (`docker-compose.yml` at repo root)

## Common Commands

### Mobile app
```bash
npx expo start --clear      # start dev server (--clear resets Metro cache)
npx expo start --clear -d   # iOS device
npx drizzle-kit generate    # generate migration after editing schema.ts
npx tsc --noEmit            # type-check
```

### Backend
```bash
docker compose up -d                    # start PostgreSQL + API
docker compose up -d postgres           # start PostgreSQL only
cd server && npx tsx src/api.ts         # run API locally (dev)
cd server && npx drizzle-kit generate   # generate migration after schema change
cd server && npx drizzle-kit migrate    # apply migrations
```

**DATABASE_URL**: `postgresql://inventory:inventory_local@localhost:5432/home_inventory`

**Always use `npx expo install <pkg>` for Expo ecosystem packages** — it resolves SDK-compatible versions. For React itself, pin to `19.1.0` with `--legacy-peer-deps`.

## Project Structure

```
app/
  _layout.tsx              Root layout — GestureHandlerRootView + Stack + migrations
  (tabs)/
    _layout.tsx            Tab bar (Catalogues, Containers, Search)
    index.tsx              Catalogues list — swipe left Edit/Delete, tap to drill in
    containers.tsx         Root containers list — tap to drill into hierarchy
    search.tsx             Full-text search across all catalogues
  catalogue/
    add.tsx                Add Catalogue modal
    [id].tsx               Edit Catalogue modal (also handles delete)
  items/
    [catalogueId].tsx      Item list for a catalogue — swipe Edit/Delete, tap → detail
  container/
    [itemId].tsx           Container contents — sub-containers + items in sections
  new-item.tsx             Add Item modal (accepts catalogueId and/or parentId params)
  edit-item.tsx            Edit Item modal (catalogue picker to move between catalogues)
  item-detail.tsx          Read-only item detail screen

db.ts                      Drizzle db instance (expo-sqlite)
schema.ts                  Drizzle schema — single source of truth for mobile DB
drizzle/                   Generated migrations (do not edit manually)
drizzle.config.ts          Drizzle Kit config (SQLite/expo)
metro.config.js            Adds .sql to sourceExts so migrations bundle correctly
babel.config.js            babel-preset-expo + inline-import for .sql files

server/
  src/
    schema.ts              PostgreSQL schema (mirrors mobile schema, pgTable)
    db.ts                  Drizzle + postgres-js connection
    api.ts                 Hono REST API — CRUD + sync endpoints
    mcp.ts                 MCP server (stdio) — inventory tools for Claude
  drizzle/                 PostgreSQL migrations
  drizzle.config.ts        Drizzle Kit config (PostgreSQL)
  package.json
  Dockerfile               Builds REST API container (linux/amd64)

docker-compose.yml         PostgreSQL + REST API containers
.claudecode.json           MCP servers: notion + inventory (gitignored — contains secrets)
```

## Navigation Structure

```
(tabs)
  Catalogues (index)  →  items/[catalogueId]  →  item-detail (modal)
                                                        ↓ Edit button
                                                  edit-item (modal)
                         + button → new-item (modal)

  Containers          →  container/[itemId]  →  container/[itemId] (drill down)
                                             →  item-detail (modal)
                         + button → new-item (modal, parentId pre-filled)

  Search              →  item-detail (modal)
```

Modals use `presentation: 'modal'` in `_layout.tsx`.

## Data Model (`schema.ts`)

Three tables — see the Notion Data Model doc for full rationale:

- **`catalogue`** — item categories/templates. `is_structural = true` marks Locations and Containers (excluded from inventory browse/export). Has `icon` (emoji), `description`, `sort_order`.
- **`item`** — entire physical hierarchy in one self-referencing table. `item_number` is nullable (containers/locations don't need a sticker). `parent_id` is a UUID self-ref. `spec` is a JSON blob for catalogue-specific fields. `can_contain` is per-item. CHECK constraint: `can_contain = 1 OR parent_id IS NOT NULL`.
- **`sync_log`** — polymorphic audit trail. `entity_type` is `'catalogue' | 'item'`, `entity_id` is the UUID of the record. No DB-level FK — app-enforced.

All mutable tables carry `device_id`, `last_modified`, and `synced` for offline-first last-write-wins sync.

## Key Implementation Notes

### Mobile
- `.sql` migration files are bundled via `babel-plugin-inline-import`. Metro treats them as source files (`sourceExts`), not assets.
- Migrations run automatically on app startup via `useMigrations(db, migrations)` in `app/_layout.tsx`.
- UUID primary keys: `schema.ts` uses a `generateId()` helper — Hermes JS engine in Expo Go doesn't always expose `crypto.randomUUID`.
- `GestureHandlerRootView` must wrap the root Stack in `app/_layout.tsx` — swipe gestures silently fail without it.
- `device_id` is hardcoded to `'local'` in the add/edit forms — replace with a persistent UUID when implementing sync.
- `useLiveQuery` is used for all list screens — re-renders automatically on DB changes. Requires `enableChangeListener: true` in `db.ts`.
- After any schema change: run `npx drizzle-kit generate`, then restart with `npx expo start --clear`.
- Plain `r` in the Expo console reloads the JS bundle. Only restart the server (and rescan) after installing new native packages.
- `automaticallyAdjustKeyboardInsets` on ScrollView handles keyboard insets on iOS (RN 0.81+) — do not use KeyboardAvoidingView.
- Container path display: load all `canContain=true` items into a `Map`, walk `parentId` chain upward. See `buildPath()` in `items/[catalogueId].tsx`.

### Backend
- PostgreSQL schema uses `jsonb` for the `spec` column (vs `text` in SQLite) — no shape validation, fully flexible per catalogue.
- Timestamps stored as ISO text strings in both mobile and server for easy last-write-wins comparison.
- MCP server uses stdio transport — Claude Code spawns it as a local process via `.claudecode.json`. Restart Claude Code after changing `.claudecode.json`.
- `bulk_import` MCP tool does topological sort on items before inserting (parents before children).

## MCP Servers (`.claudecode.json`)

Two MCP servers registered (file is gitignored — contains API token):
1. **notion** — `@notionhq/notion-mcp-server` — read/write Notion databases
2. **inventory** — `npx tsx server/src/mcp.ts` — read/write local PostgreSQL inventory

Tools available on `inventory` MCP: `list_catalogues`, `list_containers`, `get_item`, `search_items`, `add_catalogue`, `add_item`, `update_item`, `delete_item`, `bulk_import`.
