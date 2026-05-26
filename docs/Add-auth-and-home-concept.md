# Plan: Multi-User Auth + Home-Scoped Data

## Context

The app is currently single-user with no authentication on the web UI, and a shared static
`API_TOKEN` for the mobile sync. The goal is to add proper multi-user JWT auth, introduce a
"Home" concept as the root ownership boundary, and scope all data (catalogues, items, sync)
per home. Users can own or be members of multiple homes. Mobile works with one active home
at a time. Admin can manage all users and access all homes.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        users table                           │
│  id · username · password_hash · role · force_pwd_change     │
└───────────────────┬──────────────────────────────────────────┘
                    │ user_id
                    ▼
┌──────────────────────────────────────────────────────────────┐
│   home_member  (junction)                                    │
│   home_item_id → item.id (where parent_id IS NULL)           │
│   user_id      → users.id                                    │
│   role: 'owner' | 'member'                                   │
└───────────────────┬──────────────────────────────────────────┘
                    │ home_item_id
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  item (existing table — gains home_id column only)                          │
│                                                                             │
│  "Clarence Road"  parent_id=NULL  home_id=own-uuid  ← home = parentId NULL │
│       │                                                                     │
│       ├── "Loft"           home_id=clarence-uuid                            │
│       ├── "Living Room"    home_id=clarence-uuid                            │
│       └── ...              home_id=clarence-uuid                            │
│                                                                             │
│  catalogue.home_id ──────────────────────────────► clarence-uuid           │
│  sync_tombstone.home_id ────────────────────────► clarence-uuid            │
└─────────────────────────────────────────────────────────────────────────────┘
```

A "home" is any item with `parent_id IS NULL` — no extra flag needed. The existing CHECK
constraint (`can_contain=true OR parent_id IS NOT NULL`) guarantees root items are containers.
`home_id` on item exists for two reasons: (1) `UNIQUE(item_number, home_id)` per-home number
scoping, and (2) efficient `WHERE home_id = X` queries. It is set at creation and never
changes — items cannot move between homes.

**Auth flow:**
```
Login (username+password)
  → POST /api/auth/login
  → bcrypt verify → issue JWT (15min) + refresh token (30d)
  → Web: JWT in httpOnly cookie + refresh token in httpOnly cookie
  → Mobile: JWT + refresh token stored in settings table

Every request:
  → Middleware reads JWT → extracts userId + role
  → Data queries: WHERE home_id = ? (active home, user must be member)
  → Admin: bypasses home_member check, can query any home

Token refresh (transparent):
  → POST /api/auth/refresh with refresh cookie/token
  → Returns new JWT
```

---

## Schema changes

### New tables (PostgreSQL + SQLite mirrors)

```sql
-- users
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,         -- scrypt via Node crypto
  role TEXT NOT NULL DEFAULT 'member', -- 'admin' | 'member'
  force_password_change BOOLEAN NOT NULL DEFAULT true,
  created_at TEXT NOT NULL
);

-- refresh_tokens
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,            -- sha256 of the plaintext token
  expires_at TEXT NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TEXT NOT NULL
);

-- home_member
CREATE TABLE home_member (
  home_item_id UUID NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member'
  joined_at TEXT NOT NULL,
  PRIMARY KEY (home_item_id, user_id)
);
```

### Modified tables

```sql
-- item: home_id added for per-home item_number uniqueness + query scoping.
-- Set at creation time and never changes (items cannot move between homes).
-- No DB-level FK constraint (self-referential, app-enforced — same pattern as parent_id).
ALTER TABLE item ADD COLUMN home_id UUID;

-- catalogue: which home owns this catalogue definition
ALTER TABLE catalogue ADD COLUMN home_id UUID;  -- REFERENCES item(id) where parent_id IS NULL

-- sync_tombstone: set at delete time (item may not exist at query time)
ALTER TABLE sync_tombstone ADD COLUMN home_id UUID;
```

**item_number uniqueness**: drop `UNIQUE(item_number)`, add `UNIQUE(item_number, home_id)` — each home has its own number space.

### Scoping pattern (used everywhere)
```sql
WHERE home_id = :activeHomeId          -- catalogues, items, tombstones
-- home item itself:
WHERE id = :activeHomeId OR home_id = :activeHomeId
```

---

## Implementation order

```
1. Backend (foundation everything depends on)
   a. New schema + migrations
   b. Auth endpoints + JWT middleware
   c. Scope all data endpoints by homeId
   d. Admin + home-member endpoints
   e. Startup seeding

2. Web (depends on backend)
   a. Middleware + login page
   b. Home picker
   c. Proxy forwards JWT cookie
   d. Users + members management in Settings

3. Mobile (depends on backend, can parallel with web)
   a. Login screen
   b. Home selection
   c. Sync changes (Bearer auth + homeId)
   d. Schema migration
```

---

## Backend — `server/`

### New file: `server/src/auth.ts`
- `hashPassword(plain)` / `verifyPassword(plain, hash)` — Node.js `crypto.scrypt` (no new dep)
- `signJwt(payload)` / `verifyJwt(token)` — `jose` library (new dep, edge-compatible)
- `generateRefreshToken()` — `crypto.randomBytes(32).toString('hex')`
- `hashRefreshToken(token)` — `crypto.createHash('sha256')`

### New auth endpoints (`server/src/api.ts`)
| Endpoint | What it does |
|----------|-------------|
| `POST /api/auth/login` | verify password → JWT (15min) + refresh token (30d) |
| `POST /api/auth/refresh` | swap refresh token → new JWT |
| `POST /api/auth/logout` | revoke refresh token |
| `GET  /api/auth/me` | current user + their homes |
| `POST /api/auth/change-password` | change own password, clears force_password_change |

### New admin endpoints
| Endpoint | Who |
|----------|-----|
| `GET  /api/admin/users` | admin only — list all users |
| `POST /api/admin/users` | admin only — create user |
| `PATCH /api/admin/users/:id` | admin: reset password, change role |
| `DELETE /api/admin/users/:id` | admin only |
| `GET  /api/admin/homes` | admin only — all homes in system |

### New home endpoints
| Endpoint | Who |
|----------|-----|
| `GET  /api/homes` | list homes current user can access |
| `POST /api/homes` | create new home (user becomes owner via home_member) |
| `PATCH /api/homes/:id` | rename (owner or admin) |
| `GET  /api/homes/:id/members` | list members |
| `POST /api/homes/:id/members` | add member (owner or admin) |
| `DELETE /api/homes/:id/members/:userId` | remove member (owner or admin) |

### Middleware change
Replace the static `API_TOKEN` middleware with JWT Bearer validation:
```ts
app.use('/api/*', async (c, next) => {
  if (isPublicPath(c.req.path)) return next();
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  const payload = await verifyJwt(token); // throws on invalid
  c.set('userId', payload.sub);
  c.set('role', payload.role);
  c.set('forcePasswordChange', payload.forcePasswordChange);
  return next();
});
```

### All existing data endpoints
Each gains a `homeId` query param (or body field for sync push). Server validates that
`userId` is a member of `homeId` (or role=admin). Then scopes queries:
```ts
// Example: GET /api/catalogues?homeId=...
.where(eq(catalogue.homeId, homeId))
```

Affected: `GET /api/catalogues`, `GET /api/items`, `GET /api/search`,
`GET /api/sync/pull`, `POST /api/sync/push`, `GET /api/backup`, `POST /api/restore`.

### Startup seeding (`server/src/api.ts` — `main()`)
```ts
const userCount = await db.select({ c: count() }).from(users);
if (userCount[0].c === 0) {
  const adminUser = await createUser({
    username: process.env.ADMIN_USERNAME ?? 'admin',
    password: process.env.ADMIN_PASSWORD ?? 'changeme',
    role: 'admin',
    forcePasswordChange: true,
  });
}
```

### New env vars (`docker-compose.prod.yml`)
```yaml
JWT_SECRET: ${JWT_SECRET}
ADMIN_USERNAME: ${ADMIN_USERNAME:-admin}
ADMIN_PASSWORD: ${ADMIN_PASSWORD}
# Remove: API_TOKEN
```

### New npm dep
`jose` (JWT signing/verification, edge-compatible) — `npm install jose` in `server/`.

---

## Database migration

New migration file `server/drizzle/0006_auth_and_homes.sql`:

1. Create `users`, `refresh_tokens`, `home_member` tables
2. Add `is_home`, `home_id` to `item`
3. Add `home_id` to `catalogue` and `sync_tombstone`
4. Drop old `UNIQUE(item_number)`, add `UNIQUE(item_number, home_id)`
5. Data migration:
   ```sql
   -- Root items (parent_id IS NULL) point home_id to themselves
   UPDATE item SET home_id=id WHERE parent_id IS NULL;
   -- Propagate home_id down via recursive CTE
   WITH RECURSIVE tree AS (
     SELECT id, id AS home_id FROM item WHERE is_home=true
     UNION ALL
     SELECT i.id, t.home_id FROM item i JOIN tree t ON i.parent_id = t.id
   )
   UPDATE item SET home_id = tree.home_id FROM tree WHERE item.id = tree.id AND NOT item.is_home;
   -- Set catalogue home_id from a catalogue item's home
   UPDATE catalogue SET home_id = (
     SELECT home_id FROM item WHERE catalogue_id = catalogue.id LIMIT 1
   );
   ```
   Admin user and home_member ownership row are created at startup (seeding), not in SQL.

---

## Web — `web/`

### New files
| File | Purpose |
|------|---------|
| `web/middleware.ts` | JWT cookie validation; redirect to /login; force-password-change gate |
| `web/app/login/page.tsx` | Username + password form → POST /api/auth/login |
| `web/app/change-password/page.tsx` | Shown when forcePasswordChange=true |
| `web/app/homes/page.tsx` | Home picker after login — shows user's homes, sets active_home cookie |
| `web/app/api/auth/login/route.ts` | Proxy login to backend, set JWT + refresh cookies |
| `web/app/api/auth/logout/route.ts` | Proxy logout, clear cookies |
| `web/app/api/auth/refresh/route.ts` | Refresh JWT cookie transparently |

### Modified files
- `web/middleware.ts`: checks `home-inventory-jwt` cookie; redirects `/login` → `/homes` → app
- `web/app/api/proxy/[...path]/route.ts`: forward `Authorization: Bearer <jwt>` from cookie + `homeId` from `active-home` cookie, instead of static `API_TOKEN`
- `web/components/Nav.tsx`: hide on /login and /homes and /change-password; add home name display + Sign Out button; home switcher link
- `web/app/settings/page.tsx`: add **Users** section (admin only: list users, add user, reset password); add **Home Members** section (owner/admin: add/remove members)

### Cookie names
- `home-inventory-jwt` — httpOnly, secure, sameSite=strict, 15min
- `home-inventory-refresh` — httpOnly, secure, sameSite=strict, 30d
- `home-inventory-home` — the active home item id (not httpOnly — JS needs it for display)

### JWT validation in middleware
Use `jose` (edge-compatible). The `JWT_SECRET` env var must be available to Next.js — add to Docker Compose web service.

---

## Mobile — Expo

### New screens
| File | Purpose |
|------|---------|
| `app/login.tsx` | Username + password → POST /api/auth/login → store JWT + refresh in settings |
| `app/select-home.tsx` | Show homes from GET /api/homes → set `active_home_id` in settings |

### Modified files
- `app/_layout.tsx`: on startup check `settings` for JWT; if missing/expired → navigate to /login; if no `active_home_id` → navigate to /select-home
- `app/(tabs)/settings.tsx`: remove token entry; show logged-in user + active home; add Sign Out + Switch Home buttons
- `sync.ts`:
  - Replace `X-API-Token` header with `Authorization: Bearer <jwt>`
  - Add `homeId` to all sync requests
  - Add JWT refresh logic: before any sync call, check JWT expiry; if expired, call `POST /api/auth/refresh` with stored refresh token; update settings; retry
- `schema.ts` (SQLite): add `is_home`, `home_id` columns to `item`; add `users`, `refresh_tokens`, `home_member` tables (mirrored for offline sync)

### Settings table keys (new)
- `jwt_token` — current JWT
- `jwt_expires_at` — ISO timestamp
- `refresh_token` — refresh token plaintext
- `active_home_id` — UUID of selected home item

### Sync protocol change
```
GET  /api/sync/pull?since=...&homeId=<active_home_id>
POST /api/sync/push  body: { homeId, catalogues, items, tombstones }
Authorization: Bearer <jwt>
```

---

## NAS `.env` additions (manual step before deploying)
```
JWT_SECRET=<openssl rand -hex 32>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<temporary password — will be forced to change on first login>
# Remove or leave API_TOKEN (ignored after migration)
```

---

## Verification

1. Build + push API and web Docker images
2. Update NAS `.env`, redeploy
3. **Web — first login**: visit `:3001` → /login → enter admin/password → redirected to /change-password → change password → /homes → select "Clarence Road" → lands on /catalogues
4. **Web — wrong password**: shows "Invalid credentials"
5. **Web — force password change**: any route (except /change-password) redirects if flag is set
6. **Web — admin Users section**: appears in Settings for admin, hidden for member
7. **Web — create second user**: admin adds User B → User B logs in → forced to change password → /homes shows no homes yet → admin adds them to "Clarence Road" → they see the home
8. **Web — home data isolation**: User B logged in sees Clarence Road data; does NOT see another home they're not a member of
9. **Mobile — login flow**: app opens → login screen → enters credentials → home selection → Browse shows Clarence Road hierarchy
10. **Mobile — sync**: tap ↻ → sync succeeds with Bearer auth + homeId; data appears correctly
11. **API — old token rejected**: `curl -H "X-API-Token: old-token"` → 401
12. **Admin home view**: `GET /api/admin/homes` returns all homes in system
