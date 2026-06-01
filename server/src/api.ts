import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import { eq, gte, or, ilike, sql, isNotNull, count } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { db } from './db';
import { catalogue, item, syncTombstone, syncLog, users, refreshTokens } from './schema';
import { version as API_VERSION } from '../package.json';
import {
  hashPassword, verifyPassword, signJwt, verifyJwt,
  generateRefreshToken, hashRefreshToken,
} from './auth';

const SERVER_NAME = process.env.SERVER_NAME ?? 'Home Inventory';
const IMAGE_PATH  = process.env.IMAGE_PATH  ?? './images';

// Exponential backoff rate limiter for login
// 5 failures → blocked for 2 min; another 5 → 4 min; another 5 → 8 min, etc. (capped at 1 hour)
// Successful login resets the counter entirely.
interface LoginState { failures: number; strikes: number; blockedUntil: number; lastSeen: number; }
const loginState = new Map<string, LoginState>();
const LOGIN_THRESHOLD  = 5;
const LOGIN_BASE_MS    = 2 * 60 * 1000;
const LOGIN_MAX_MS     = 60 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [ip, s] of loginState) { if (s.lastSeen < cutoff) loginState.delete(ip); }
}, 60 * 60 * 1000);

function checkLoginBlocked(ip: string): { allowed: boolean; retryAfterSecs: number } {
  const s = loginState.get(ip);
  if (s && s.blockedUntil > Date.now()) {
    return { allowed: false, retryAfterSecs: Math.ceil((s.blockedUntil - Date.now()) / 1000) };
  }
  return { allowed: true, retryAfterSecs: 0 };
}

function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const s = loginState.get(ip) ?? { failures: 0, strikes: 0, blockedUntil: 0, lastSeen: now };
  s.failures++;
  s.lastSeen = now;
  if (s.failures >= LOGIN_THRESHOLD) {
    const blockMs = Math.min(LOGIN_BASE_MS * Math.pow(2, s.strikes), LOGIN_MAX_MS);
    s.blockedUntil = now + blockMs;
    s.strikes++;
    s.failures = 0;
    console.warn('[SECURITY] login_blocked ip=%s strike=%d block_mins=%d', ip, s.strikes, Math.round(blockMs / 60000));
  }
  loginState.set(ip, s);
}

function recordLoginSuccess(ip: string): void { loginState.delete(ip); }

// Simple fixed-window rate limiter for refresh endpoint
function createRateLimiter(max: number, windowMs: number) {
  const attempts = new Map<string, { count: number; windowStart: number }>();
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, entry] of attempts) { if (entry.windowStart < cutoff) attempts.delete(ip); }
  }, windowMs);
  return function recordAttempt(ip: string): { allowed: boolean; retryAfterSecs: number } {
    const now = Date.now();
    const entry = attempts.get(ip);
    if (!entry || now - entry.windowStart >= windowMs) {
      attempts.set(ip, { count: 1, windowStart: now });
      return { allowed: true, retryAfterSecs: 0 };
    }
    if (entry.count >= max) {
      return { allowed: false, retryAfterSecs: Math.ceil((windowMs - (now - entry.windowStart)) / 1000) };
    }
    entry.count++;
    return { allowed: true, retryAfterSecs: 0 };
  };
}

const recordRefreshAttempt = createRateLimiter(20, 15 * 60 * 1000);

function isPrivateIp(addr: string): boolean {
  const ip = addr.replace(/^::ffff:/, '');
  return ip === '::1' || ip === '127.0.0.1'
    || /^10\./.test(ip)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
    || /^192\.168\./.test(ip);
}

function getClientIp(c: Context): string {
  const connAddr = getConnInfo(c).remote.address ?? '';
  if (isPrivateIp(connAddr)) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }
  return connAddr || 'unknown';
}

type Variables = { userId: string; userRole: string };
const app = new Hono<{ Variables: Variables }>();

// Auth middleware — Bearer JWT required (dev mode: JWT_SECRET unset allows all)
app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  const publicPaths = ['/api/health', '/api/discover', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout'];
  if (publicPaths.includes(path)) return next();

  // JWT Bearer
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = await verifyJwt(authHeader.slice(7));
      c.set('userId', payload.sub);
      c.set('userRole', payload.role);
      return next();
    } catch {
      console.warn('[SECURITY] bad_jwt ip=%s path=%s', getClientIp(c), path);
      return c.json({ error: 'Unauthorized' }, 401);
    }
  }

  // No valid Bearer token — reject if JWT_SECRET is configured (production)
  if (process.env.JWT_SECRET) {
    console.warn('[SECURITY] no_token ip=%s path=%s', getClientIp(c), path);
    return c.json({ error: 'Unauthorized' }, 401);
  }
  // Dev mode: no JWT_SECRET set, allow through
  return next();
});

app.get('/api/health',   (c) => c.json({ status: 'ok' }));
app.get('/api/discover', (c) => c.json({ name: SERVER_NAME, version: API_VERSION, requiresToken: !!process.env.JWT_SECRET, imagePath: process.env.IMAGES_PATH ?? IMAGE_PATH }));

// ── Auth ─────────────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (c) => {
  const ip = getClientIp(c);
  const { allowed, retryAfterSecs } = checkLoginBlocked(ip);
  if (!allowed) {
    console.warn('[SECURITY] rate_limit_hit endpoint=login ip=%s retry_after=%ds', ip, retryAfterSecs);
    return c.json({ error: 'Too many login attempts. Try again later.' }, 429, { 'Retry-After': String(retryAfterSecs) });
  }

  const { username, password } = await c.req.json();
  if (!username || !password) return c.json({ error: 'Username and password required' }, 400);
  if (password.length > 256) return c.json({ error: 'Invalid credentials' }, 401);

  const trimmedUsername = username.trim();
  const [user] = await db.select().from(users).where(eq(users.username, trimmedUsername)).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    console.warn('[SECURITY] failed_login ip=%s username=%s', ip, trimmedUsername);
    recordLoginFailure(ip);
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  recordLoginSuccess(ip);
  const token        = await signJwt({ sub: user.id, role: user.role, forcePasswordChange: user.forcePasswordChange });
  const refreshToken = generateRefreshToken();
  const expiresAt    = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.insert(refreshTokens).values({
    id: randomUUID(), userId: user.id,
    tokenHash: hashRefreshToken(refreshToken), expiresAt, revoked: false,
  });

  return c.json({
    token, refreshToken,
    user: { id: user.id, username: user.username, role: user.role, forcePasswordChange: user.forcePasswordChange },
  });
});

app.post('/api/auth/refresh', async (c) => {
  const ip = getClientIp(c);
  const { allowed, retryAfterSecs } = recordRefreshAttempt(ip);
  if (!allowed) {
    console.warn('[SECURITY] rate_limit_hit endpoint=refresh ip=%s', ip);
    return c.json({ error: 'Too many requests. Try again later.' }, 429, { 'Retry-After': String(retryAfterSecs) });
  }

  const { refreshToken } = await c.req.json();
  if (!refreshToken) return c.json({ error: 'Refresh token required' }, 400);

  const tokenHash = hashRefreshToken(refreshToken);
  const [stored] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);
  if (!stored || stored.revoked || stored.expiresAt < new Date().toISOString()) {
    return c.json({ error: 'Invalid or expired refresh token' }, 401);
  }

  const [user] = await db.select().from(users).where(eq(users.id, stored.userId)).limit(1);
  if (!user) return c.json({ error: 'User not found' }, 401);

  const newRefreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.transaction(async (tx) => {
    await tx.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.id, stored.id));
    await tx.insert(refreshTokens).values({
      id: randomUUID(), userId: user.id,
      tokenHash: hashRefreshToken(newRefreshToken), expiresAt, revoked: false,
    });
  });

  const token = await signJwt({ sub: user.id, role: user.role, forcePasswordChange: user.forcePasswordChange });
  return c.json({ token, refreshToken: newRefreshToken });
});

app.post('/api/auth/logout', async (c) => {
  const { refreshToken } = await c.req.json();
  if (refreshToken) {
    await db.update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.tokenHash, hashRefreshToken(refreshToken)));
  }
  return c.json({ ok: true });
});

app.get('/api/auth/me', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'Not authenticated with JWT' }, 401);

  const [user] = await db.select({
    id: users.id, username: users.username, role: users.role, forcePasswordChange: users.forcePasswordChange,
  }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ error: 'User not found' }, 404);
  return c.json(user);
});

app.post('/api/auth/change-password', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'Not authenticated with JWT' }, 401);

  const { currentPassword, newPassword } = await c.req.json();
  if (!currentPassword || !newPassword) return c.json({ error: 'currentPassword and newPassword required' }, 400);
  if (newPassword.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400);

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return c.json({ error: 'Current password is incorrect' }, 401);
  }

  await db.update(users).set({
    passwordHash: await hashPassword(newPassword),
    forcePasswordChange: false,
  }).where(eq(users.id, userId));

  await db.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.userId, userId));

  return c.json({ ok: true });
});

// ── Catalogues ──────────────────────────────────────────────────────────────

app.get('/api/catalogues', async (c) => {
  const rows = await db.select().from(catalogue).orderBy(catalogue.sortOrder, catalogue.name);
  return c.json(rows);
});

app.get('/api/catalogues/:id', async (c) => {
  const rows = await db.select().from(catalogue).where(eq(catalogue.id, c.req.param('id'))).limit(1);
  if (!rows[0]) return c.json({ error: 'Not found' }, 404);
  return c.json(rows[0]);
});

app.post('/api/catalogues', async (c) => {
  const body = await c.req.json();
  const rows = await db.insert(catalogue).values(body).returning();
  return c.json(rows[0], 201);
});

app.put('/api/catalogues/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  // Migrate item spec data when field keys are renamed (position-matched)
  const [existing] = await db.select({ fields: catalogue.fields }).from(catalogue).where(eq(catalogue.id, id)).limit(1);
  const oldFields = (existing?.fields as any[] | null) ?? [];
  const newFields = (body.fields as any[] | null) ?? [];
  for (let i = 0; i < Math.min(oldFields.length, newFields.length); i++) {
    const oldKey = oldFields[i]?.key as string | undefined;
    const newKey = newFields[i]?.key as string | undefined;
    if (oldKey && newKey && oldKey !== newKey) {
      const affected = await db.select({ id: item.id, spec: item.spec })
        .from(item)
        .where(eq(item.catalogueId, id));
      for (const row of affected) {
        const s = row.spec as Record<string, unknown> | null;
        if (s && oldKey in s) {
          const updated = { ...s, [newKey]: s[oldKey] };
          delete updated[oldKey];
          await db.update(item).set({ spec: updated }).where(eq(item.id, row.id));
        }
      }
    }
  }

  const rows = await db.update(catalogue).set({ ...body, lastModified: new Date().toISOString() })
    .where(eq(catalogue.id, id)).returning();
  if (!rows[0]) return c.json({ error: 'Not found' }, 404);
  return c.json(rows[0]);
});

app.delete('/api/catalogues/:id', async (c) => {
  const id = c.req.param('id');
  const keepItems = c.req.query('keepItems') === 'true';
  const now = new Date().toISOString();
  if (keepItems) {
    await db.update(item).set({ catalogueId: null, lastModified: now }).where(eq(item.catalogueId, id));
  } else {
    const its = await db.select({ id: item.id }).from(item).where(eq(item.catalogueId, id));
    for (const i of its) {
      await db.insert(syncTombstone).values({ id: randomUUID(), entityType: 'item', entityId: i.id, deletedAt: now, deviceId: 'server' }).onConflictDoNothing();
      await db.delete(item).where(eq(item.id, i.id));
    }
  }
  await db.insert(syncTombstone).values({ id: randomUUID(), entityType: 'catalogue', entityId: id, deletedAt: now, deviceId: 'server' }).onConflictDoNothing();
  await db.delete(catalogue).where(eq(catalogue.id, id));
  return c.json({ ok: true });
});

// ── Items ────────────────────────────────────────────────────────────────────

app.get('/api/items', async (c) => {
  const { catalogueId, parentId, since, canContain } = c.req.query();
  let query = db.select().from(item).$dynamic();
  if (catalogueId)              query = query.where(eq(item.catalogueId, catalogueId));
  if (parentId)                 query = query.where(eq(item.parentId, parentId));
  if (since)                    query = query.where(gte(item.lastModified, since));
  if (canContain !== undefined) query = query.where(eq(item.canContain, canContain === 'true'));
  const rows = await query.orderBy(item.name);
  return c.json(rows);
});

app.get('/api/items/parent-ids', async (c) => {
  const rows = await db.selectDistinct({ parentId: item.parentId })
    .from(item)
    .where(isNotNull(item.parentId));
  return c.json(rows.map(r => r.parentId));
});

app.get('/api/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.json([]);
  const pattern = `%${q}%`;
  const numericVal = /^\d+$/.test(q) ? parseInt(q, 10) : null;
  const rows = await db.select().from(item).where(
    or(
      ilike(item.name, pattern),
      ilike(item.notes, pattern),
      sql`CAST(${item.itemNumber} AS TEXT) ILIKE ${pattern}`,
      sql`CAST(${item.spec} AS TEXT) ILIKE ${pattern}`,
      ...(numericVal !== null ? [eq(item.itemNumber, numericVal)] : []),
    )
  ).orderBy(item.name).limit(100);
  return c.json(rows);
});

app.get('/api/items/:id', async (c) => {
  const rows = await db.select().from(item).where(eq(item.id, c.req.param('id'))).limit(1);
  if (!rows[0]) return c.json({ error: 'Not found' }, 404);
  return c.json(rows[0]);
});

app.post('/api/items', async (c) => {
  const body = await c.req.json();
  const rows = await db.insert(item).values(body).returning();
  return c.json(rows[0], 201);
});

app.put('/api/items/:id', async (c) => {
  const body = await c.req.json();
  try {
    const rows = await db.update(item).set({ ...body, lastModified: new Date().toISOString() })
      .where(eq(item.id, c.req.param('id'))).returning();
    if (!rows[0]) return c.json({ error: 'Not found' }, 404);
    return c.json(rows[0]);
  } catch (err: any) {
    if (err.cause?.code === '23505' && err.cause?.constraint_name === 'item_item_number_unique') {
      return c.json({ error: `Item number ${body.itemNumber} is already in use` }, 409);
    }
    throw err;
  }
});

app.delete('/api/items/:id', async (c) => {
  const id = c.req.param('id');
  const cascade = c.req.query('cascade') === 'true';
  const moveUp  = c.req.query('moveUp')  === 'true';
  const now = new Date().toISOString();

  if (cascade) {
    const queue = [id];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const children = await db.select({ id: item.id, canContain: item.canContain })
        .from(item).where(eq(item.parentId, parentId));
      for (const child of children) {
        if (child.canContain) queue.push(child.id);
        await db.insert(syncTombstone).values({ id: randomUUID(), entityType: 'item', entityId: child.id, deletedAt: now, deviceId: 'server' }).onConflictDoNothing();
        await db.delete(item).where(eq(item.id, child.id));
      }
    }
  } else if (moveUp) {
    const [container] = await db.select({ parentId: item.parentId }).from(item).where(eq(item.id, id)).limit(1);
    const targetParentId = container?.parentId ?? null;
    const directChildren = await db.select({ id: item.id, canContain: item.canContain })
      .from(item).where(eq(item.parentId, id));
    for (const child of directChildren) {
      if (child.canContain || targetParentId !== null) {
        await db.update(item).set({ parentId: targetParentId, lastModified: now }).where(eq(item.id, child.id));
      } else {
        await db.insert(syncTombstone).values({ id: randomUUID(), entityType: 'item', entityId: child.id, deletedAt: now, deviceId: 'server' }).onConflictDoNothing();
        await db.delete(item).where(eq(item.id, child.id));
      }
    }
  }

  await db.insert(syncTombstone).values({ id: randomUUID(), entityType: 'item', entityId: id, deletedAt: now, deviceId: 'server' }).onConflictDoNothing();
  await db.delete(item).where(eq(item.id, id));
  return c.json({ ok: true });
});

// ── Images ───────────────────────────────────────────────────────────────────

app.post('/api/items/:id/image', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.parseBody();
  const file = body['file'];
  if (!file || typeof file === 'string') return c.json({ error: 'No file provided' }, 400);
  const buf = Buffer.from(await file.arrayBuffer());
  writeFileSync(join(IMAGE_PATH, `${id}.jpg`), buf);
  await db.update(item).set({ hasImage: true, lastModified: new Date().toISOString() }).where(eq(item.id, id));
  return c.json({ ok: true });
});

app.get('/api/items/:id/image', async (c) => {
  const filePath = join(IMAGE_PATH, `${c.req.param('id')}.jpg`);
  if (!existsSync(filePath)) return c.json({ error: 'Not found' }, 404);
  const buf = readFileSync(filePath);
  return new Response(buf, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600' } });
});

app.delete('/api/items/:id/image', async (c) => {
  const filePath = join(IMAGE_PATH, `${c.req.param('id')}.jpg`);
  if (existsSync(filePath)) unlinkSync(filePath);
  await db.update(item).set({ hasImage: false, lastModified: new Date().toISOString() }).where(eq(item.id, c.req.param('id')));
  return c.json({ ok: true });
});

// ── Backup / Restore ─────────────────────────────────────────────────────────

app.get('/api/backup', async (c) => {
  const [catalogues, items] = await Promise.all([
    db.select().from(catalogue),
    db.select().from(item),
  ]);

  const zip = new JSZip();
  zip.file('data.json', JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), catalogues, items }, null, 2));

  for (const it of items) {
    if (it.hasImage) {
      const filePath = join(IMAGE_PATH, `${it.id}.jpg`);
      if (existsSync(filePath)) {
        zip.folder('images')!.file(`${it.id}.jpg`, readFileSync(filePath));
      }
    }
  }

  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename=home-inventory-backup.zip',
    },
  });
});

app.post('/api/restore', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];
  if (!file || typeof file === 'string') return c.json({ error: 'No file provided' }, 400);

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const dataFile = zip.file('data.json');
  if (!dataFile) return c.json({ error: 'Invalid backup: missing data.json' }, 400);

  const data = JSON.parse(await dataFile.async('string'));

  // Wipe (FK-safe order)
  await db.delete(syncLog);
  await db.delete(syncTombstone);
  await db.delete(item);
  await db.delete(catalogue);

  // Delete all images
  try {
    for (const f of readdirSync(IMAGE_PATH).filter(f => f.endsWith('.jpg'))) {
      unlinkSync(join(IMAGE_PATH, f));
    }
  } catch { /* directory may not exist */ }

  // Import catalogues then items (maintains FK order)
  for (const cat of data.catalogues ?? []) {
    await db.insert(catalogue).values(cat).onConflictDoNothing();
  }
  for (const it of data.items ?? []) {
    await db.insert(item).values(it).onConflictDoNothing();
  }

  // Import images
  let imageCount = 0;
  for (const imgFile of zip.file(/^images\/.+\.jpg$/)) {
    const filename = imgFile.name.replace('images/', '');
    const imgBuf = Buffer.from(await imgFile.async('arraybuffer'));
    writeFileSync(join(IMAGE_PATH, filename), imgBuf);
    imageCount++;
  }

  return c.json({ ok: true, catalogues: (data.catalogues ?? []).length, items: (data.items ?? []).length, images: imageCount });
});

// ── Sync ─────────────────────────────────────────────────────────────────────

app.get('/api/sync/pull', async (c) => {
  const since = c.req.query('since') ?? '1970-01-01T00:00:00Z';
  const [catalogues, items, tombstones] = await Promise.all([
    db.select().from(catalogue).where(gte(catalogue.lastModified, since)),
    db.select().from(item).where(gte(item.lastModified, since)),
    db.select().from(syncTombstone).where(gte(syncTombstone.deletedAt, since)),
  ]);
  return c.json({ catalogues, items, tombstones });
});

app.post('/api/sync/push', async (c) => {
  const { catalogues: cats = [], items: its = [], tombstones: tombstonesIn = [] } = await c.req.json();

  // Process tombstones first; track IDs to skip upserts for deleted entities
  const tombstonedItemIds = new Set<string>();
  const tombstonedCatIds = new Set<string>();
  for (const t of tombstonesIn) {
    await db.insert(syncTombstone).values(t).onConflictDoNothing();
    if (t.entityType === 'item') {
      await db.delete(item).where(eq(item.id, t.entityId));
      tombstonedItemIds.add(t.entityId);
    } else if (t.entityType === 'catalogue') {
      await db.update(item).set({ catalogueId: null }).where(eq(item.catalogueId, t.entityId));
      await db.delete(catalogue).where(eq(catalogue.id, t.entityId));
      tombstonedCatIds.add(t.entityId);
    }
  }

  for (const { id: catId, ...catRest } of cats) {
    if (tombstonedCatIds.has(catId)) continue;
    await db.insert(catalogue).values({ id: catId, ...catRest })
      .onConflictDoUpdate({ target: catalogue.id, set: catRest });
  }

  const numbersCleared: number[] = [];
  const skipped: string[] = [];
  for (const { id: itemId, ...itemRest } of its) {
    if (tombstonedItemIds.has(itemId)) continue;
    try {
      await db.insert(item).values({ id: itemId, ...itemRest })
        .onConflictDoUpdate({ target: item.id, set: itemRest });
    } catch (err: any) {
      const code = err.cause?.code;
      const constraint = err.cause?.constraint_name;
      if (code === '23505' && constraint === 'item_item_number_unique') {
        if (itemRest.itemNumber != null) numbersCleared.push(itemRest.itemNumber);
        await db.insert(item).values({ id: itemId, ...itemRest, itemNumber: null })
          .onConflictDoUpdate({ target: item.id, set: { ...itemRest, itemNumber: null } });
      } else if (code === '23503' && constraint === 'item_catalogue_id_catalogue_id_fk') {
        await db.insert(item).values({ id: itemId, ...itemRest, catalogueId: null })
          .onConflictDoUpdate({ target: item.id, set: { ...itemRest, catalogueId: null } });
        skipped.push(itemId);
      } else {
        throw err;
      }
    }
  }

  return c.json({ ok: true, catalogues: cats.length, items: its.length, tombstones: tombstonesIn.length, numbersCleared, skipped });
});

async function seedAdminUser() {
  const [{ c }] = await db.select({ c: count() }).from(users);
  if (c > 0) return;

  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD ?? 'changeme';
  await db.insert(users).values({
    id: randomUUID(),
    username,
    passwordHash: await hashPassword(password),
    role: 'admin',
    forcePasswordChange: true,
  });
  console.log(`Created admin user: ${username} (force password change on first login)`);
}

async function main() {
  mkdirSync(IMAGE_PATH, { recursive: true });
  await migrate(db, { migrationsFolder: './drizzle' });
  await seedAdminUser();
  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, port }, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
