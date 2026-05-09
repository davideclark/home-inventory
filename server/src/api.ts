import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { eq, gte, or, ilike } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { randomUUID } from 'crypto';
import { db } from './db';
import { catalogue, item, syncTombstone } from './schema';

const API_TOKEN   = process.env.API_TOKEN   ?? '';
const SERVER_NAME = process.env.SERVER_NAME ?? 'Home Inventory';

const app = new Hono();

// Token auth — skip for /api/health and /api/discover
app.use('/api/*', async (c, next) => {
  if (API_TOKEN && c.req.path !== '/api/health' && c.req.path !== '/api/discover') {
    if (c.req.header('X-API-Token') !== API_TOKEN) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  }
  return next();
});

app.get('/api/health',   (c) => c.json({ status: 'ok' }));
app.get('/api/discover', (c) => c.json({ name: SERVER_NAME, version: '1.0.0', requiresToken: !!API_TOKEN }));

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
  const body = await c.req.json();
  const rows = await db.update(catalogue).set({ ...body, lastModified: new Date().toISOString() })
    .where(eq(catalogue.id, c.req.param('id'))).returning();
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

app.get('/api/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.json([]);
  const pattern = `%${q}%`;
  const rows = await db.select().from(item).where(
    or(
      ilike(item.name, pattern),
      ilike(item.notes, pattern),
      ilike(item.manufacturer, pattern),
      ilike(item.model, pattern),
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
  const rows = await db.update(item).set({ ...body, lastModified: new Date().toISOString() })
    .where(eq(item.id, c.req.param('id'))).returning();
  if (!rows[0]) return c.json({ error: 'Not found' }, 404);
  return c.json(rows[0]);
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

async function main() {
  await migrate(db, { migrationsFolder: './drizzle' });
  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, port }, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
