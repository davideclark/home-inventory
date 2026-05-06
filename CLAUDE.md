# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A personal home inventory app for cataloguing hardware collections. Built with Expo (React Native) targeting iOS, Android, and web. Fully offline-first with SQLite on device; syncs to a self-hosted Hono/PostgreSQL backend on a Synology NAS.

Requirements and data model are documented in Notion:
- Overview: https://www.notion.so/Home-Inventory-App-357f3ff0a69081e4b728cf7c70bd347b
- Data Model: https://www.notion.so/357f3ff0a6908191b4faf1b656e68aeb
- Requirements: https://www.notion.so/357f3ff0a690812b92ecf2465f496130

## Tech Stack

- **Framework**: Expo SDK 54 + React Native 0.81.5 + React 19.1.0
- **Navigation**: Expo Router (file-based, `app/` directory)
- **Database**: SQLite via `expo-sqlite` + Drizzle ORM
- **Migrations**: `drizzle-kit` — run `npx drizzle-kit generate` after schema changes
- **Vector search**: `multilingual-e5-small` ONNX model (384-dim), stored in `vectors.db`
- **Notion integration**: MCP server (`@notionhq/notion-mcp-server`) in `.claudecode.json`

## Common Commands

```bash
npx expo start --clear      # start dev server (--clear resets Metro cache)
npx expo start --clear -d   # iOS device
npx drizzle-kit generate    # generate migration after editing schema.ts
npx tsc --noEmit            # type-check
```

**Always use `npx expo install <pkg>` for Expo ecosystem packages** — it resolves SDK-compatible versions. For React itself, pin to `19.1.0` with `--legacy-peer-deps` (react-native-renderer must match exactly).

## Project Structure

```
app/
  _layout.tsx           # Root layout — GestureHandlerRootView + Stack + migrations
  (tabs)/
    _layout.tsx         # Tab bar (Catalogues, Search)
    index.tsx           # Catalogues list — swipe left to Edit/Delete, tap to drill in
    search.tsx          # Search screen (placeholder)
  catalogue/
    add.tsx             # Add Catalogue modal form
    [id].tsx            # Edit Catalogue modal form (also handles delete)
  items/
    [catalogueId].tsx   # Item list for a catalogue — Edit button in header
db.ts                   # Drizzle db instance (expo-sqlite)
schema.ts               # Drizzle schema — single source of truth for DB structure
drizzle/                # Generated migrations (do not edit manually)
drizzle.config.ts       # Drizzle Kit config
metro.config.js         # Adds .sql to sourceExts so migrations bundle correctly
babel.config.js         # babel-preset-expo + inline-import for .sql files
```

## Navigation Structure

```
(tabs)
  Catalogues (index)  →  items/[catalogueId]  →  (future: item detail)
                                ↓ Edit button
                         catalogue/[id]  (modal)
  Search
```

Modals (Add/Edit Catalogue) use `presentation: 'modal'` in `_layout.tsx`. Item list is a standard stack push.

## Data Model (`schema.ts`)

Three tables — see the Notion Data Model doc for full rationale:

- **`catalogue`** — item categories/templates. `is_structural = true` marks Locations and Containers (excluded from inventory browse/export). Has `icon` (emoji), `description`, `sort_order`.
- **`item`** — entire physical hierarchy in one self-referencing table. `item_number` is always user-assigned (never auto-generated). `parent_id` is a UUID self-ref. `spec` is a JSON blob for catalogue-specific fields (query with `json_extract`). `can_contain` is per-item. CHECK constraint enforces `can_contain = 1 OR parent_id IS NOT NULL`.
- **`sync_log`** — polymorphic audit trail. `entity_type` is `'catalogue' | 'item'`, `entity_id` is the UUID of the synced record (no DB FK — app-enforced). Keeps `device_id` and `payload` (JSON snapshot).

All mutable tables carry `device_id`, `last_modified`, and `synced` for offline-first last-write-wins sync.

## Key Implementation Notes

- `.sql` migration files are bundled via `babel-plugin-inline-import` (configured in `babel.config.js`). Metro treats them as source files (`sourceExts`), not assets.
- Migrations run automatically on app startup via `useMigrations(db, migrations)` in `app/_layout.tsx`.
- UUID primary keys: `schema.ts` uses a `generateId()` helper (not `crypto.randomUUID()` directly) — the Hermes JS engine in Expo Go doesn't always expose `crypto.randomUUID`.
- `GestureHandlerRootView` (from `react-native-gesture-handler`) must wrap the root Stack in `app/_layout.tsx` — swipe gestures silently fail without it.
- `device_id` is currently hardcoded to `'local'` in the add/edit forms — replace with a persistent UUID when implementing sync.
- `useLiveQuery` (from `drizzle-orm/expo-sqlite`) is used for all list screens — it re-renders automatically when the underlying table changes. Requires `enableChangeListener: true` in `db.ts`.
- After any schema change: run `npx drizzle-kit generate`, then restart with `npx expo start --clear`.
- Plain `r` in the Expo console reloads the JS bundle without rescanning the QR code — use this for all JS-only changes. Only restart the server (and rescan) after installing new native packages.
