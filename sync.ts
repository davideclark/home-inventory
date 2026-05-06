import { eq, sql } from 'drizzle-orm';
import { db } from './db';
import { catalogue, item, settings } from './schema';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function toMs(ts: string): number {
  return new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z').getTime();
}

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db.insert(settings).values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

let _deviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (_deviceId) return _deviceId;
  let id = await getSetting('device_id');
  if (!id) {
    id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    await setSetting('device_id', id);
  }
  _deviceId = id;
  return id;
}

export async function getLastSyncAt(): Promise<string | null> {
  return getSetting('last_sync_at');
}

async function push(): Promise<number> {
  const deviceId = await getDeviceId();
  const now = isoNow();

  // Remove orphaned items (catalogue was deleted locally but item survived)
  await db.run(
    sql`DELETE FROM item
        WHERE synced = 0
          AND catalogue_id IS NOT NULL
          AND catalogue_id NOT IN (SELECT id FROM catalogue)`
  );

  const [unsyncedCats, unsyncedItems] = await Promise.all([
    db.select().from(catalogue).where(eq(catalogue.synced, false)),
    db.select().from(item).where(eq(item.synced, false)),
  ]);

  if (!unsyncedCats.length && !unsyncedItems.length) return 0;

  const res = await fetch(`${API_URL}/api/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      catalogues: unsyncedCats.map(c => ({ ...c, deviceId, lastModified: now })),
      items: unsyncedItems.map(i => ({
        ...i,
        spec: i.spec ? JSON.parse(i.spec) : null,
        deviceId,
        lastModified: now,
      })),
    }),
  });

  if (!res.ok) throw new Error(`Push failed: ${res.status}`);

  await Promise.all([
    ...unsyncedCats.map(c =>
      db.update(catalogue).set({ synced: true, lastModified: now }).where(eq(catalogue.id, c.id))
    ),
    ...unsyncedItems.map(i =>
      db.update(item).set({ synced: true, lastModified: now }).where(eq(item.id, i.id))
    ),
  ]);

  return unsyncedCats.length + unsyncedItems.length;
}

async function pull(since: string): Promise<number> {
  const res = await fetch(`${API_URL}/api/sync/pull?since=${encodeURIComponent(since)}`);
  if (!res.ok) throw new Error(`Pull failed: ${res.status}`);

  const { catalogues: serverCats = [], items: serverItems = [] } = await res.json();

  for (const sc of serverCats) {
    const [existing] = await db.select().from(catalogue).where(eq(catalogue.id, sc.id)).limit(1);
    if (existing) {
      if (toMs(sc.lastModified) >= toMs(existing.lastModified)) {
        await db.update(catalogue).set({ ...sc, synced: true }).where(eq(catalogue.id, sc.id));
      }
    } else {
      await db.insert(catalogue).values({ ...sc, synced: true }).onConflictDoNothing();
    }
  }

  for (const si of serverItems) {
    const mapped = {
      ...si,
      spec: si.spec != null ? JSON.stringify(si.spec) : null,
      synced: true,
    };
    const [existing] = await db.select().from(item).where(eq(item.id, si.id)).limit(1);
    if (existing) {
      if (toMs(si.lastModified) >= toMs(existing.lastModified)) {
        await db.update(item).set(mapped).where(eq(item.id, si.id));
      }
    } else {
      await db.insert(item).values(mapped).onConflictDoNothing();
    }
  }

  return serverCats.length + serverItems.length;
}

export async function sync(): Promise<{ pushed: number; pulled: number }> {
  const since = (await getLastSyncAt()) ?? '1970-01-01T00:00:00Z';
  const pushed = await push();
  const pulled = await pull(since);
  await setSetting('last_sync_at', isoNow());
  return { pushed, pulled };
}
