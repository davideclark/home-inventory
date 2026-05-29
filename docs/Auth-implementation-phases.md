# Auth Implementation — Phased Plan

Full spec: `docs/Add-auth-and-home-concept.md`

## Status

- [x] Phase 1 — Backend auth foundation
- [ ] Phase 2 — Web login upgrade
- [ ] Phase 3 — Mobile login
- [ ] Phase 4 — Home concept

---

## Phase 1 — Backend auth foundation

**Goal**: Add JWT auth to the server without breaking anything. Mobile and web continue working unchanged via dual auth (API_TOKEN still accepted alongside JWT).

### Schema changes
- New table: `users` (id, username, password_hash, role, force_password_change, created_at)
- New table: `refresh_tokens` (id, user_id, token_hash, expires_at, revoked, created_at)
- New migration: `server/drizzle/0006_auth.sql`

### New file: `server/src/auth.ts`
- `hashPassword` / `verifyPassword` — Node.js `crypto.scrypt`
- `signJwt` / `verifyJwt` — `jose` library (new dep: `npm install jose` in `server/`)
- `generateRefreshToken` — `crypto.randomBytes(32).toString('hex')`
- `hashRefreshToken` — `crypto.createHash('sha256')`

### New endpoints (`server/src/api.ts`)
| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/login` | Verify password → JWT (15min) + refresh token (30d) |
| `POST /api/auth/refresh` | Swap refresh token → new JWT |
| `POST /api/auth/logout` | Revoke refresh token |
| `GET  /api/auth/me` | Current user info |
| `POST /api/auth/change-password` | Change own password, clears force_password_change |

### Middleware change
- Keep existing `API_TOKEN` check
- Add JWT Bearer check alongside it: accept either `X-API-Token` OR `Authorization: Bearer <jwt>`
- Both paths set `userId` / `role` in context (API_TOKEN path sets role=admin, userId=system)

### Startup seeding
- On startup, if `users` table is empty: create admin user from `ADMIN_USERNAME` + `ADMIN_PASSWORD` env vars (default `admin` / `changeme`, `force_password_change=true`)

### New env vars (`docker-compose.prod.yml` — api service)
```yaml
JWT_SECRET: ${JWT_SECRET}
ADMIN_USERNAME: ${ADMIN_USERNAME:-admin}
ADMIN_PASSWORD: ${ADMIN_PASSWORD}
```

### NAS `.env` additions (manual)
```
JWT_SECRET=<openssl rand -hex 32>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<temporary — will be forced to change on first login>
```

### Deliverables
- Build + push new API image
- Update NAS `.env`, redeploy
- Verify: `POST /api/auth/login` returns JWT; existing mobile sync still works

---

## Phase 2 — Web login upgrade

**Goal**: Replace the `WEB_PASSWORD` single-password login with proper username + password (JWT-based). No change to how inventory data is queried yet.

### Files to change
| File | Change |
|------|--------|
| `web/middleware.ts` | Validate `home-inventory-jwt` cookie using `jose`; redirect to `/login` if missing/invalid |
| `web/app/login/page.tsx` | Add username field; POST username+password to `/api/auth/login` proxy |
| `web/app/api/auth/login/route.ts` | Proxy to backend `POST /api/auth/login`; set `home-inventory-jwt` + `home-inventory-refresh` cookies |
| `web/app/api/auth/logout/route.ts` | Proxy to backend `POST /api/auth/logout`; clear both cookies |
| `web/app/api/proxy/[...path]/route.ts` | Forward `Authorization: Bearer <jwt>` from cookie (instead of static `API_TOKEN`) |
| `web/app/change-password/page.tsx` | **New** — shown when `force_password_change=true` in JWT payload |
| `docker-compose.prod.yml` | Add `JWT_SECRET` to web service; remove `WEB_PASSWORD` + `SESSION_SECRET` |

### Cookie names
- `home-inventory-jwt` — httpOnly, secure, sameSite=strict, 15min max-age
- `home-inventory-refresh` — httpOnly, secure, sameSite=strict, 30d max-age

### New dep
`jose` in `web/` — `npm install jose`

### NAS `.env` changes (manual)
- Add `JWT_SECRET` (same value as used by api service)
- Remove `WEB_PASSWORD` and `SESSION_SECRET`

### Deliverables
- Build + push new web image
- Update NAS `.env`, redeploy
- Verify: visit web → /login → enter admin credentials → /catalogues; Sign Out works; old WEB_PASSWORD login gone

---

## Phase 3 — Mobile login

**Goal**: Mobile app uses JWT Bearer auth instead of the static API token. Retire `API_TOKEN` entirely.

### New screens
| File | Purpose |
|------|---------|
| `app/login.tsx` | Username + password form → POST `/api/auth/login` → store tokens in settings |
| `app/select-home.tsx` | Placeholder for Phase 4 — for now auto-selects the only home |

### Files to change
| File | Change |
|------|--------|
| `app/_layout.tsx` | On startup: check settings for JWT; if missing/expired → navigate to /login |
| `app/(tabs)/settings.tsx` | Remove API token entry; show logged-in username; add Sign Out button |
| `sync.ts` | Replace `X-API-Token` with `Authorization: Bearer <jwt>`; add JWT refresh logic before each sync (if expired, call `/api/auth/refresh`, update settings, retry) |
| `schema.ts` | Add settings keys: `jwt_token`, `jwt_expires_at`, `refresh_token` |

### New settings table keys
- `jwt_token` — current JWT
- `jwt_expires_at` — ISO timestamp
- `refresh_token` — refresh token plaintext

### Backend cleanup (after mobile ships)
- Remove dual auth — accept JWT only, drop `API_TOKEN` middleware
- Remove `API_TOKEN` from `docker-compose.prod.yml` and NAS `.env`

### Deliverables
- EAS build (preview profile) for internal TestFlight testing
- Verify: fresh install → login screen → enter credentials → home screen → sync works
- After verified: build + push new API image with API_TOKEN removed; redeploy NAS

---

## Phase 4 — Home concept

**Goal**: Introduce the Home boundary — scope all data per home, enable multi-user access. This is the most complex phase and can be deferred until a second user or second home is needed.

### Schema changes
- New table: `home_member` (home_item_id, user_id, role, joined_at)
- Add `home_id` column to `item`, `catalogue`, `sync_tombstone`
- Drop `UNIQUE(item_number)`, add `UNIQUE(item_number, home_id)`
- Data migration: root items set `home_id=id`; propagate down via recursive CTE; set catalogue `home_id` from items
- New migration: `server/drizzle/0007_homes.sql`

### Backend changes
- New endpoints: `GET/POST /api/homes`, `GET/POST/DELETE /api/homes/:id/members`
- Admin endpoints: `GET/POST/PATCH/DELETE /api/admin/users`, `GET /api/admin/homes`
- All data endpoints gain `homeId` param; middleware validates user is a member
- Sync push/pull scoped by `homeId`

### Web changes
- New page: `web/app/homes/page.tsx` — home picker after login
- Middleware redirects to `/homes` if no `active-home` cookie after login
- Nav shows active home name
- Settings page gains Users + Home Members sections (admin/owner only)
- Proxy forwards `homeId` from `home-inventory-home` cookie

### Mobile changes
- `app/select-home.tsx` — real home picker (replaces Phase 3 placeholder)
- Settings: add Switch Home button
- Sync includes `homeId` in all requests
- SQLite schema: mirror `home_member` table; add `home_id` + `active_home_id` to settings

### New settings table key
- `active_home_id` — UUID of currently selected home item

### Deliverables
- Full end-to-end test: admin creates second user → second user logs in → admin adds them to Clarence Road → second user sees inventory
- Verify data isolation: two homes, members of one cannot see the other
