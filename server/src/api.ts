import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { eq, gte, or, ilike } from 'drizzle-orm';
import { db } from './db';
import { catalogue, item } from './schema';

const app = new Hono();

app.get('/api/health', (c) => c.json({ status: 'ok' }));

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
  await db.delete(catalogue).where(eq(catalogue.id, c.req.param('id')));
  return c.json({ ok: true });
});

// ── Items ────────────────────────────────────────────────────────────────────

app.get('/api/items', async (c) => {
  const { catalogueId, parentId, since } = c.req.query();
  let query = db.select().from(item).$dynamic();
  if (catalogueId) query = query.where(eq(item.catalogueId, catalogueId));
  if (parentId)    query = query.where(eq(item.parentId, parentId));
  if (since)       query = query.where(gte(item.lastModified, since));
  const rows = await query.orderBy(item.itemNumber);
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
  await db.delete(item).where(eq(item.id, c.req.param('id')));
  return c.json({ ok: true });
});

// ── Sync ─────────────────────────────────────────────────────────────────────

app.get('/api/sync/pull', async (c) => {
  const since = c.req.query('since') ?? '1970-01-01T00:00:00Z';
  const [catalogues, items] = await Promise.all([
    db.select().from(catalogue).where(gte(catalogue.lastModified, since)),
    db.select().from(item).where(gte(item.lastModified, since)),
  ]);
  return c.json({ catalogues, items });
});

app.post('/api/sync/push', async (c) => {
  const { catalogues: cats = [], items: its = [] } = await c.req.json();

  for (const { id: catId, ...catRest } of cats) {
    await db.insert(catalogue).values({ id: catId, ...catRest })
      .onConflictDoUpdate({ target: catalogue.id, set: catRest });
  }

  const numbersCleared: number[] = [];
  const skipped: string[] = [];
  for (const { id: itemId, ...itemRest } of its) {
    try {
      await db.insert(item).values({ id: itemId, ...itemRest })
        .onConflictDoUpdate({ target: item.id, set: itemRest });
    } catch (err: any) {
      const code = err.cause?.code;
      const constraint = err.cause?.constraint_name;
      if (code === '23505' && constraint === 'item_item_number_unique') {
        // item_number clash — push without it
        if (itemRest.itemNumber != null) numbersCleared.push(itemRest.itemNumber);
        await db.insert(item).values({ id: itemId, ...itemRest, itemNumber: null })
          .onConflictDoUpdate({ target: item.id, set: { ...itemRest, itemNumber: null } });
      } else if (code === '23503' && constraint === 'item_catalogue_id_catalogue_id_fk') {
        // catalogue doesn't exist on server — push without catalogueId
        await db.insert(item).values({ id: itemId, ...itemRest, catalogueId: null })
          .onConflictDoUpdate({ target: item.id, set: { ...itemRest, catalogueId: null } });
        skipped.push(itemId);
      } else {
        throw err;
      }
    }
  }

  return c.json({ ok: true, catalogues: cats.length, items: its.length, numbersCleared, skipped });
});

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => {
  console.log(`API listening on http://localhost:${port}`);
});
