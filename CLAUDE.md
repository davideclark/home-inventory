# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A personal home inventory app for cataloguing hardware collections. Built with Expo (React Native) targeting iOS and Android. Fully offline-first with SQLite on device; syncs to a self-hosted Hono/PostgreSQL backend on a Synology NAS via Tailscale VPN.

Requirements and data model are documented in Notion (for reference only):
- Overview: https://www.notion.so/Home-Inventory-App-357f3ff0a69081e4b728cf7c70bd347b
- Data Model: https://www.notion.so/357f3ff0a6908191b4faf1b656e68aeb
- Requirements: https://www.notion.so/357f3ff0a690812b92ecf2465f496130

**Inventory data is managed exclusively in the PostgreSQL database via the inventory MCP server.** Notion is no longer used for inventory management — it was the source for the one-off initial import only. Use `mcp__inventory__*` tools for all inventory queries and edits.

## Tech Stack

### Mobile app
- **Framework**: Expo SDK 54 + React Native 0.81.5 + React 19.1.0
- **Navigation**: Expo Router (file-based, `app/` directory)
- **Database**: SQLite via `expo-sqlite` + Drizzle ORM
- **Migrations**: `drizzle-kit` — run `npx drizzle-kit generate` after schema changes
- **Sync**: `sync.ts` — push/pull against the REST API, last-write-wins on `last_modified`
- **Fonts**: `@expo-google-fonts/manrope` + `expo-font` — Manrope loaded in `app/_layout.tsx`
- **Builds**: EAS Build (`eas.json`) — `preview` profile for internal distribution (no App Store)
- **Notion integration**: MCP server (`@notionhq/notion-mcp-server`) in `.claudecode.json`

### Backend (server/)
- **Framework**: Node.js + Hono
- **Database**: PostgreSQL 16 via Drizzle ORM (`drizzle-orm/postgres-js`)
- **Auth**: `Authorization: Bearer <jwt>` only. Public endpoints: `/api/health`, `/api/discover`, `/api/auth/login`, `/api/auth/refresh`. JWT issued by `POST /api/auth/login`; 15min expiry; refresh via `POST /api/auth/refresh`. When `JWT_SECRET` is set, any request without a valid Bearer JWT is rejected; when `JWT_SECRET` is unset, all requests pass through (dev mode). Admin user seeded on first startup from `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars.
- **MCP server**: `@modelcontextprotocol/sdk` — stdio transport, registered in `.claudecode.json` and in Claude Desktop (`%APPDATA%\Claude\claude_desktop_config.json`)
- **Infrastructure**: Docker Compose — `docker-compose.yml` (NAS production, Synology picks it up automatically), `docker-compose.dev.yml` (local dev, builds from source)
- **Production deployment**: Synology DS1621+ NAS — Tailscale IP `100.110.8.60`, API on port 3000, postgres on port 5433
- **Docker image**: `davideclark/home-inventory-api:latest` — multi-platform (amd64, arm64, arm/v7)

### Web frontend (web/)
- **Framework**: Next.js 15 + Tailwind CSS
- **Data fetching**: TanStack Query
- **API access**: proxy route (`app/api/proxy/[...path]/route.ts`) forwards all requests to backend, adding token server-side
- **Pages**: Catalogues, Items per catalogue, Browse (hierarchy), Search, Settings
- **Fonts**: Manrope via `next/font/google` (self-hosted, CSS variable `--font-sans`), applied via `font-sans` Tailwind class
- **Design system**: primary colour `#007AFF` as `bg-primary` / `hover:bg-primary-hover` / `active:bg-primary-active` in `tailwind.config.ts`; House-Box logo at `public/logo-mark.svg`
- **Config**: `API_URL`, `JWT_SECRET` env vars — set via Docker Compose in prod, `.env.local` in dev
- **Auth**: `web/middleware.ts` protects all routes except `/login` and `/api/auth/*`. On login, two cookies are set: `home-inventory-jwt` (httpOnly, 15min) and `home-inventory-refresh` (httpOnly, 30d). The middleware verifies the JWT via `jose`; if expired, silently refreshes using the refresh cookie before redirecting to `/login`. `forcePasswordChange=true` in the JWT payload redirects page requests to `/change-password`. If `JWT_SECRET` is not set, middleware allows all (dev mode). Routes: `web/app/api/auth/login/route.ts` (proxies to backend, sets cookies), `web/app/api/auth/logout/route.ts` (revokes refresh token, clears cookies), `web/app/change-password/page.tsx` (change-password form). Proxy at `web/app/api/proxy/[...path]/route.ts` reads `home-inventory-jwt` cookie and forwards as `Authorization: Bearer <jwt>`; falls back to `X-API-Token` if no JWT (dev).
- **Production**: port 3001 — `http://192.168.1.201:3001` (local) or `http://100.110.8.60:3001` (Tailscale)
- **Docker image**: `davideclark/home-inventory-web:latest` — multi-platform (amd64, arm64)

## Common Commands

### Mobile app
```bash
npx expo start --clear      # start dev server (--clear resets Metro cache)
npx expo start --clear -d   # iOS device
npx drizzle-kit generate    # generate migration after editing schema.ts
npx tsc --noEmit            # type-check
eas build --platform ios --profile preview   # build standalone iOS app
```

### Backend
```bash
docker compose up -d                    # start PostgreSQL + API
docker compose up -d postgres           # start PostgreSQL only
cd server && npx tsx src/api.ts         # run API locally (dev)
cd server && npx drizzle-kit generate   # generate migration after schema change
cd server && npx drizzle-kit migrate    # apply migrations
```

### Web frontend
```bash
cd web && npm run dev       # start dev server on port 3001 (needs web/.env.local)
cd web && npx tsc --noEmit  # type-check
```

**web/.env.local** (dev only, gitignored):
```
API_URL=http://DS1621plus.local:3000
```

**To rebuild and push the web Docker image:**
```bash
docker buildx build --platform linux/amd64 -t davideclark/home-inventory-web:latest --push ./web
```
> Note: arm platforms excluded — QEMU emulation too slow. The NAS is amd64.

**DATABASE_URL (local dev)**: `postgresql://inventory:inventory_local@localhost:5432/home_inventory`

**DATABASE_URL (NAS / MCP)**: `postgresql://inventory:inventory_local@DS1621plus.local:5433/home_inventory`

**API URL for sync**: stored in the app's `settings` table (`api_url` key). Set via the Settings tab in the app. `EXPO_PUBLIC_API_URL` in `.env` is a dev-only fallback.

**NAS `.env` file** (`/volume1/docker/home-inventory/.env`):
```
DOCKERHUB_USERNAME=davideclark
POSTGRES_PASSWORD=inventory_local
SERVER_NAME=David's Inventory
IMAGES_PATH=/volume1/docker/home-inventory/images
API_PORT=13000
WEB_PORT=13001
JWT_SECRET=<openssl rand -hex 32>
ADMIN_USERNAME=<username>
ADMIN_PASSWORD=<initial password — forced to change on first login>
```
`IMAGES_PATH` is the host path mounted into the API container at `/images`. The API reads `IMAGE_PATH=/images` (set in `docker-compose.yml`). The directory is created automatically on startup if it doesn't exist.

**To rebuild and push the Docker image** (run from repo root):
```bash
docker buildx build --platform linux/amd64 -t davideclark/home-inventory-api:latest --push ./server
```
> Note: arm platforms excluded — QEMU emulation is too slow. The NAS is amd64.

**To deploy/update on NAS** (SSH on port 8888, user: david):
```bash
ssh -p 8888 david@DS1621plus.local "cd /volume1/docker/home-inventory && sudo /usr/local/bin/docker compose pull && sudo /usr/local/bin/docker compose up -d"
```

**To copy updated docker-compose.yml to NAS** (SCP doesn't work — use SSH pipe):
```bash
Get-Content docker-compose.yml -Raw | ssh -p 8888 david@DS1621plus.local "cat > /volume1/docker/home-inventory/docker-compose.yml"
```

**Always use `npx expo install <pkg>` for Expo ecosystem packages** — it resolves SDK-compatible versions. `.npmrc` sets `legacy-peer-deps=true` project-wide to handle React peer dependency conflicts. For React itself, pin to `19.1.0`.

## Project Structure

```
app/
  _layout.tsx              Root layout — GestureHandlerRootView + Stack + migrations + startup sync
  (tabs)/
    _layout.tsx            Tab bar (Catalogues, Browse, Search, Settings)
    (catalogues)/
      _layout.tsx          Nested Stack for Catalogues tab (keeps tab bar visible during drill-down)
      index.tsx            Catalogues list — sorted by name, swipe left Edit/Delete, tap to drill in
      items/
        [catalogueId].tsx  Item list for a catalogue — sorted by name, swipe Edit/Delete, tap → detail
                           Browse Contents button uses /catalogue-container/[itemId] to stay in this Stack
      catalogue-container/
        [itemId].tsx       Container drill-down reached from a catalogue item — thin wrapper around
                           components/ContainerScreen.tsx; stays in Catalogues Stack so back returns
                           to the catalogue items list
    (browse)/
      _layout.tsx          Nested Stack for Browse tab (keeps tab bar visible during drill-down)
      index.tsx            Root containers list — tap to drill into hierarchy
      container/
        [itemId].tsx       Container drill-down reached from Browse tab — thin wrapper around
                           components/ContainerScreen.tsx
    search.tsx             Full-text search across all catalogues
    settings.tsx           Server config — URL + token entry, Test & Save, Disconnect; MAINTENANCE section
                           with "Remove Orphaned Containers" button (detects containers whose parentId points
                           to a deleted item; deletes via deleteContainer with tombstones); app version at bottom
  catalogue/
    add.tsx                Add Catalogue modal
    [id].tsx               Edit Catalogue modal (also handles delete)
  new-item.tsx             Add Item modal (accepts catalogueId and/or parentId params)
  edit-item.tsx            Edit Item modal (catalogue picker to move between catalogues)
  item-detail.tsx          Read-only item detail screen
  setup.tsx                One-time server setup screen (not shown on startup — accessible if needed)

components/
  Text.tsx                 Wraps RN Text + TextInput to auto-apply the correct Manrope font
                           variant based on fontWeight in the style prop. All screen files
                           import Text/TextInput from here instead of react-native.
  SyncButton.tsx           ↻ button used in every tab header — self-contained local state,
                           calls sync() directly (header components are outside the React
                           context tree so context cannot be used here)
  CatalogueIcon.tsx        Renders a catalogue icon value — emoji char, `si:<slug>` (Simple Icon
                           via react-native-svg), or `svg:<base64>` (custom SVG via SvgXml).
  IconPicker.tsx           Full-screen slide-up modal for choosing a catalogue icon. Sections:
                           Retro & Vintage quick-picks, All Brands (~3 000 Simple Icons),
                           emoji categories (from @emoji-mart/data), and a custom SVG paste
                           field. Search filters brands + emoji simultaneously. Used in
                           app/catalogue/[id].tsx and app/catalogue/add.tsx.
  ContainerScreen.tsx      Full container drill-down screen — sub-containers + items in sections,
                           custom back button (500ms debounce), breadcrumb path, swipe Edit/Delete.
                           Accepts a `containerRoute` prop so recursive Browse Contents navigation
                           stays within the same tab's Stack. Used by both (browse)/container/[itemId]
                           and (catalogues)/catalogue-container/[itemId].

context/
  sync.tsx                 SyncContext + SyncProvider (available for use within screen trees,
                           not currently used — kept for future use)

sync.ts                    Sync logic: getDeviceId(), sync(), push(), pull()
                           Exports deleteItem(id), deleteCatalogue(id), deleteContainer(id) —
                           always use these instead of db.delete() to ensure tombstones are created.
                           Reads api_url, jwt_token, jwt_expires_at, refresh_token from settings table.
                           Sends Authorization: Bearer <jwt> on all requests.
                           Refreshes JWT automatically before sync if within 1 min of expiry.
                           Exports storeAuthTokens(), clearAuthTokens(), checkStartupAuth().
                           sync() returns early (no error) if no server configured; throws
                           "Sign in via Settings to sync" if server configured but no JWT.
                           refreshJwt() clears tokens on 401/403 (revoked); preserves them on
                           network error so offline access still works.
                           Push-then-pull, last-write-wins on last_modified.
                           Cleans up orphaned items before push.
db.ts                      Drizzle db instance (expo-sqlite)
schema.ts                  Drizzle schema — single source of truth for mobile DB
drizzle/                   Generated migrations (do not edit manually)
drizzle.config.ts          Drizzle Kit config (SQLite/expo)
eas.json                   EAS Build config — preview profile for internal iOS distribution
metro.config.js            Adds .sql to sourceExts so migrations bundle correctly
babel.config.js            babel-preset-expo + inline-import for .sql files
.npmrc                     Sets legacy-peer-deps=true for npm installs
.env                       EXPO_PUBLIC_API_URL dev fallback (not committed)

server/
  src/
    schema.ts              PostgreSQL schema (mirrors mobile schema, pgTable)
    db.ts                  Drizzle + postgres-js connection
    api.ts                 Hono REST API — CRUD + sync endpoints + token auth middleware
    mcp.ts                 MCP server (stdio) — inventory tools for Claude
    import-notion.ts       One-off script: imports all 24 Notion databases into PostgreSQL
  drizzle/                 PostgreSQL migrations
  drizzle.config.ts        Drizzle Kit config (PostgreSQL)
  package.json
  Dockerfile               Builds REST API container

docker-compose.yml         PostgreSQL + REST API + web containers (NAS production — Docker Hub images)
docker-compose.dev.yml     PostgreSQL + API containers (local dev — builds from source)
.claudecode.json           MCP servers: notion + inventory (gitignored — contains secrets)

web/
  app/
    api/proxy/[...path]/   Next.js route handler — proxies all API calls server-side (adds token)
    catalogues/            Catalogue list + items per catalogue
    containers/            Container hierarchy (drill-down)
    search/                Full-text search
    settings/              Connection status
  components/
    Nav.tsx                Top navigation bar — House-Box logo + Manrope, bg-primary
    Modal.tsx              Reusable modal wrapper
    ConfirmDialog.tsx      Delete confirmation dialog
    ItemModal.tsx          Add/edit item form — all fields + container picker (custom div-based
                           dropdown, not a native select — same pattern as the catalogue picker).
                           Each container option shows the full path as primary text and catalogue
                           names (or notes as fallback) as a subtitle. Uses an `allItems` query
                           (queryKey: ['items-by-parent']) to build the cataloguesByContainer map.
    ItemDetailModal.tsx    Read-only item detail dialog — image (with lightbox), all spec fields, notes, location path; Edit button opens ItemModal
  lib/
    api.ts                 Fetch wrappers for all API endpoints
    types.ts               TypeScript types mirroring server schema
  public/
    logo-mark.svg          House-Box SVG logo (blue #007AFF, 64×64 viewBox, no background)
  Dockerfile               Builds web container (standalone Next.js output)
  next.config.ts           output: standalone for Docker
```

## Navigation Structure

Each tab has its own nested Stack so the tab bar stays visible during drill-down.

```
(tabs)
  (catalogues) Stack
    Catalogues list  →  items/[catalogueId]  →  item-detail (modal)
                                                       ↓ Edit button
                                                 edit-item (modal)
                         Browse Contents ›  →  catalogue-container/[itemId]  →  catalogue-container/[itemId] (recursive)
                         + button → new-item (modal)

  (browse) Stack
    Browse root      →  container/[itemId]  →  container/[itemId] (recursive drill-down)
                                            →  item-detail (modal)
                         + button → new-item (modal, parentId pre-filled)

  Search             →  item-detail (modal)

  Settings           →  (inline — no sub-screens)
```

Modals (`item-detail`, `new-item`, `edit-item`, `catalogue/add`, `catalogue/[id]`) are in the root Stack and cover the full screen including the tab bar.

**Tab context for container navigation**: Browse Contents from a catalogue items list uses `/catalogue-container/[itemId]` (stays in Catalogues Stack, back returns to the items list). Browse Contents from the Browse tab uses `/container/[itemId]` (stays in Browse Stack). Both routes render `components/ContainerScreen.tsx` with a `containerRoute` prop that controls recursive sub-container navigation.

## Data Model (`schema.ts`)

Five tables:

- **`catalogue`** — groups items and defines custom spec fields for the group. Has `icon`, `description`, `sort_order`, `fields` (JSON array of `FieldDef` — custom per-catalogue spec field definitions, e.g. `[{ key: "speed_mhz", label: "Speed (MHz)", type: "number", showInList: true }]`). Types: `text | number | textarea`. `showInList` controls which spec fields appear as subtitles in item list rows (mobile) or dedicated columns (web catalogue items page). No structural flag — whether an item is a container is determined solely by `item.can_contain`.
- **`item`** — entire physical hierarchy in one self-referencing table. `item_number` is nullable (containers/locations don't need a sticker). `parent_id` is a UUID self-ref. `spec` is a JSON blob for all catalogue-specific fields — **this includes manufacturer, model, type, condition, colour, barcode, and status**, which are stored in spec rather than dedicated columns. Keys are defined by the parent catalogue's `fields` array; data is preserved when moving an item between catalogues. `can_contain` is per-item. `has_image` boolean — true when a photo exists at `<IMAGE_PATH>/<id>.jpg` on the server. Images are served via `GET /api/items/:id/image` (token-protected). CHECK constraint: `can_contain = 1 OR parent_id IS NOT NULL`.
- **`settings`** — key/value store for app-level state. Keys: `device_id`, `last_sync_at`, `api_url`, `api_token` (legacy), `jwt_token`, `jwt_expires_at`, `refresh_token`, `logged_in_username`.
- **`sync_tombstone`** — records deletes so they propagate across devices. `entity_type` is `'catalogue' | 'item'`, `entity_id` is the UUID of the deleted record. Mobile adds `synced` boolean (SQLite); server schema omits it. Always delete via `deleteItem()`/`deleteCatalogue()`/`deleteContainer()` in `sync.ts` — never call `db.delete()` directly, or the tombstone won't be created.
- **`sync_log`** — polymorphic audit trail. `entity_type` is `'catalogue' | 'item'`, `entity_id` is the UUID of the record. No DB-level FK — app-enforced.

All mutable tables carry `device_id`, `last_modified`, and `synced` for offline-first last-write-wins sync.

## Sync Design

**Protocol**: push-then-pull on demand (startup + manual ↻ button).

**Auth**: the app is fully offline-first — no login is required to browse local data. Login is optional and only needed for sync and photo downloads. JWT is obtained via Settings → Sign In (`app/login.tsx`) and stored in the `settings` table (`jwt_token`, `jwt_expires_at`, `refresh_token`, `logged_in_username`). `_layout.tsx` runs a background sync on startup (silently, no redirect on failure). `refreshJwt()` distinguishes network errors (preserves credentials, allows offline access) from auth failures (401/403 — clears credentials). Sync requests include `Authorization: Bearer <jwt>`; if no JWT and server is configured, sync throws a user-friendly message instead of a raw 401.

**Push**: selects all local records where `synced = false`, including `sync_tombstone` rows. Before pushing items, deletes any orphaned items whose `catalogue_id` no longer exists in the local catalogue table (prevents FK violations on the server). Sends unsynced catalogues, items, and tombstones in a single POST to `/api/sync/push`. On success, marks all pushed records `synced = true`.

**Pull**: GET `/api/sync/pull?since={lastSyncAt}`. Server returns catalogues, items, and tombstones modified/deleted since that timestamp. Tombstones are applied first — matching local items/catalogues are deleted before upserts run. Each received record is upserted locally — updated only if the server's `last_modified` >= the local `last_modified` (last-write-wins). Updates `last_sync_at` in the `settings` table.

**Deletes**: always use `deleteItem(id)`, `deleteCatalogue(id, opts)`, or `deleteContainer(id, opts)` from `sync.ts`. These atomically delete the record and create a `sync_tombstone` row with `synced = false`. The tombstone is pushed on the next sync and pulled by other devices, which then delete their local copy. The REST API and MCP server also create tombstones on DELETE so server-side deletes propagate to the phone on the next pull.

- `deleteCatalogue(id, { deleteItems })` — when `deleteItems=true` (default): tombstones and deletes all items in the catalogue first. When `deleteItems=false`: nulls out `catalogueId` on items instead (they become uncategorised). The UI counts items and asks before deleting. Server API supports `DELETE /api/catalogues/:id?keepItems=true` for the same choice.
- `deleteContainer(id, { cascade })` — when `cascade=true` (default): BFS through all descendants, tombstones and deletes every item in the tree, then the container. When `cascade=false`: moves all direct children's `parentId` up to the container's parent (non-container items with no parent to inherit are deleted). The UI counts direct children and offers Move Contents Up / Delete All. Server API supports `DELETE /api/items/:id?cascade=true` and `DELETE /api/items/:id?moveUp=true` for the same behaviour from the web.

**Server push endpoint** handles two constraint violations gracefully rather than returning 500:
- `item_number` unique clash → retries inserting the item with `item_number = null`
- `catalogue_id` FK violation → retries inserting the item with `catalogue_id = null`

**Server config in app**: the Settings tab lets you enter/change the server URL and token. Values are saved to the `settings` table. `sync.ts` reads them at runtime with a module-level cache; call `clearApiConfigCache()` after changing settings to force a re-read.

## Key Implementation Notes

### Mobile
- `.sql` migration files are bundled via `babel-plugin-inline-import`. Metro treats them as source files (`sourceExts`), not assets.
- Migrations run automatically on app startup via `useMigrations(db, migrations)` in `app/_layout.tsx`. Startup sync fires after migrations complete.
- UUID primary keys: `schema.ts` uses a `generateId()` helper (exported) — Hermes JS engine in Expo Go doesn't always expose `crypto.randomUUID`. `sync.ts` uses the same pattern for device ID generation. `app/new-item.tsx` calls `generateId()` directly on mount so the item ID is known before the record is saved — this allows photo upload during the add-item flow.
- `GestureHandlerRootView` must wrap the root Stack in `app/_layout.tsx` — swipe gestures silently fail without it.
- `device_id` in add/edit forms calls `await getDeviceId()` from `sync.ts` — returns a persistent UUID stored in the `settings` table.
- `useLiveQuery` is used for all list screens — re-renders automatically on DB changes. Requires `enableChangeListener: true` in `db.ts`.
- **`useLiveQuery` with dynamic parameters**: avoid passing a derived value (e.g. `i?.catalogueId ?? ''`) as a query parameter — if the initial value is empty, the query fires with the wrong SQL and may not re-fire when the value changes (it only re-fires on DB changes, not query parameter changes). Use a static query and filter in JS instead. See `item-detail.tsx` catalogue lookup as an example.
- After any schema change: run `npx drizzle-kit generate`, then restart with `npx expo start --clear`.
- Plain `r` in the Expo console reloads the JS bundle. Only restart the server (and rescan) after installing new native packages.
- `automaticallyAdjustKeyboardInsets` on ScrollView handles keyboard insets on iOS (RN 0.81+) — do not use KeyboardAvoidingView.
- Container path display: load all `canContain=true` items into a `Map`, walk `parentId` chain upward via `buildPath()`. Used in `(catalogues)/items/[catalogueId].tsx` (item list subtitles), `new-item.tsx`, and `edit-item.tsx` (container picker — sorted and labelled by full path, e.g. "Clarence Road › Games Room › Shelf 3").
- **Container picker subtitles** (`new-item.tsx`, `edit-item.tsx`): each picker row shows the container path as the primary text, then a subtitle line showing the catalogue names of items inside that container (e.g. "Graphics Cards, Consoles"), falling back to the container's own `notes` if no categorised items exist. Requires a second `useLiveQuery` joining `item` with `catalogue` (same pattern as `(browse)/index.tsx`). DO NOT simplify this to notes-only — the catalogue-names-first logic is intentional.
- **Header components** (headerLeft/headerRight in tab options) are rendered by React Navigation outside the screen's React tree — they cannot consume React context from providers inside the Stack. `SyncButton` uses local `useState` and calls `sync()` directly for this reason.
- **Discard-changes guard on modals**: use `usePreventRemove(isDirty, ({ data }) => { ... })` from `@react-navigation/native` — NOT `beforeRemove` + `e.preventDefault()`. The `beforeRemove` approach throws a warning and fails silently on native-stack because UIKit has already started the dismiss animation before JS fires. `usePreventRemove` integrates with UIKit's gesture recogniser correctly. See `app/catalogue/add.tsx` and `app/new-item.tsx` for the pattern.
  - **Critical**: never call `router.back()` synchronously after saving — `usePreventRemove` captures `isDirty` at the time of the call, which is still `true` before the state update re-renders. Instead, set an `isSaved` state to `true`, compute `isDirty` as `!isSaved && ...`, and navigate in a `useEffect(() => { if (isSaved) router.back(); }, [isSaved])`. By the time the effect fires, the re-render has run with `isDirty = false` and the guard steps down.
- **`components/ContainerScreen.tsx` uses a custom `headerLeft` back button — DO NOT replace it with the native UIKit back button.** Root cause: on iOS, tapping the native UIKit back button quickly causes the touch to bleed through to the underlying screen's native UIKit back button during the dismiss animation, popping two container levels at once. The fix is a custom React Native `Pressable` with a 500ms debounce via `lastBackAt` ref. JS-side `beforeRemove` + `e.preventDefault()` approaches are retained as a safety net but are insufficient on their own — the UIKit bleed-through happens at the native layer before JS fires. Removing `headerLeft` or the debounce will re-introduce the double-pop bug.
- `.npmrc` sets `legacy-peer-deps=true` — required for `npx expo install` and EAS Build `npm ci` to resolve React peer dependency conflicts.
- **Fonts**: 4 Manrope weights loaded in `app/_layout.tsx` via `useFonts` from `@expo-google-fonts/manrope`. The loading gate checks `!fontsLoaded || !success` so the app never renders before fonts are ready. `components/Text.tsx` wraps `Text`/`TextInput` and auto-maps `fontWeight` values (`400`/`500`/`600`/`700`) to the correct `Manrope_*` `fontFamily` — all screens import from there instead of react-native directly.
- **App icon**: `assets/icon.png` (1024×1024), `assets/adaptive-icon.png` (1024×1024 white bg for Android safe zone), `assets/splash-icon.png` (512×512) — all show the House-Box logo. Generated via Python Pillow. Android `adaptiveIcon.backgroundColor` in `app.json` is `#007aff`.
- **Expo web is not supported** — `expo-sqlite` requires `SharedArrayBuffer` on web which needs special server headers not provided by the Expo dev server. The web frontend is a separate Next.js app in `web/` that talks directly to the REST API.

### Backend
- PostgreSQL schema uses `jsonb` for the `spec` column (vs `text` in SQLite) — no shape validation, fully flexible per catalogue.
- Spec field conversion: mobile stores spec as a JSON string; push serialises it to an object for PostgreSQL jsonb; pull stringifies it back for SQLite.
- `catalogue.fields` is `jsonb` on PostgreSQL (auto-parsed as an array) and `text` (JSON string) on SQLite. The pull path in `sync.ts` must `JSON.stringify(sc.fields)` before inserting into SQLite — same as spec. Omitting this causes an `InvalidConvertibleException` crash when syncing catalogues that have fields. When a field key is renamed in the catalogue editor, `PUT /api/catalogues/:id` fetches all affected items and migrates the key in JavaScript (fetch → rename → update). Mobile `app/catalogue/[id].tsx` runs the same migration using SQLite json_set/json_remove. Both `/api/search` and MCP `search_items` include `CAST(spec AS TEXT) ILIKE` so custom field values are searchable.
- Timestamps stored as ISO text strings in both mobile and server for lexicographic last-write-wins comparison. SQLite's `datetime('now')` default produces a non-ISO format — sync.ts normalises both formats via `toMs()` before comparing.
- MCP server uses stdio transport — Claude Code spawns it as a local process via `.claudecode.json`. Also registered in Claude Desktop config. Restart the respective app after changing either config file. The MCP process is long-lived — if `mcp.ts` is changed mid-session, the running process still uses the old code; restart Claude Code to pick up changes.
- `bulk_import` MCP tool does topological sort on items before inserting (parents before children).
- `JWT_SECRET` env var secures all endpoints except `/api/health`, `/api/discover`, `/api/auth/login`, `/api/auth/refresh`. If not set, auth is skipped (dev mode).
- `/api/discover` returns `{ name, version, requiresToken }` — `requiresToken` is true when `JWT_SECRET` is set.
- API runs migrations automatically on startup via `drizzle-orm/postgres-js/migrator`.
- **Image endpoints**: `POST /api/items/:id/image` (upload), `GET /api/items/:id/image` (serve), `DELETE /api/items/:id/image` (remove). Files stored at `<IMAGE_PATH>/<id>.jpg`. `IMAGE_PATH` env var defaults to `./images`; in prod it is `/images` (mapped to Docker volume). All three are token-protected.
- **Parent IDs endpoint**: `GET /api/items/parent-ids` returns a `string[]` of all distinct `parentId` values. Must be registered before `GET /api/items/:id` in the route order. Used by `web/app/catalogues/[id]/page.tsx` for the Browse Contents button. **`web/app/containers/page.tsx` and `web/app/containers/[id]/page.tsx` do NOT use this endpoint** — they compute `parentIdSet` locally from the `allLeafItems` query (queryKey: `['items-by-parent']`) which they already fetch for the catalogue-names subtitle. Do not revert this to the API endpoint approach — computing locally is more reliable and removes a network dependency.
- **Browse Contents button** (web): appears on container rows in `containers/page.tsx`, `containers/[id]/page.tsx`, and `catalogues/[id]/page.tsx`. The button row div must have `shrink-0` (so it isn't squeezed by the name column) and the button itself must have `whitespace-nowrap` (so "Browse Contents" never wraps to a second line). Do not remove these classes.
- **Backup/restore**: `GET /api/backup` returns a ZIP containing `data.json` (all catalogues + items) + `images/<id>.jpg` for each item with a photo. `POST /api/restore` accepts a multipart ZIP upload and does a full wipe-and-replace (sync_log → sync_tombstone → items → catalogues → image files, then reimports). Uses `jszip`. Exposed via web Settings page (Export Backup / Import Backup buttons).

## MCP Servers

### `.mcp.json` (gitignored — contains API token)
1. **notion** — `@notionhq/notion-mcp-server` — read/write Notion databases
2. **inventory** — `npx tsx server/src/mcp.ts` — read/write local PostgreSQL inventory

### Claude Desktop (`%APPDATA%\Claude\claude_desktop_config.json`)
- **inventory** — same as above — allows the Claude Desktop app to query/modify inventory

Tools available on `inventory` MCP: `list_catalogues`, `list_containers`, `get_item`, `search_items`, `add_catalogue`, `update_catalogue`, `delete_catalogue`, `add_item`, `update_item`, `delete_item`, `bulk_import`.

## Inventory Data

- 24 Notion databases imported via `server/src/import-notion.ts` (one-off script, keep for re-runs)
- 187 inventory items + 38 location/container items in the hierarchy
- Location hierarchy: Clarence Road → 9 rooms (Loft, Living Room, Bed Room, Games Room, Cinema Room, Shed 1–4) → containers/drawers → items
- 2 legacy catalogues used for location/container items: Locations (🏠), Containers (📦) — no longer marked structural; items are containers by virtue of `can_contain = true`
- Notion API token is in `.claudecode.json` under the `notion` MCP server env
