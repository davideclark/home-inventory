import { eq, sql } from 'drizzle-orm';
import { db } from './db';
import { catalogue, item, settings, syncTombstone } from './schema';

function isoNow(): string {
  return new Date().toISOString();
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
let _apiUrl: string | null = null;
let _apiToken: string | null = null;

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

async function getApiUrl(): Promise<string> {
  if (_apiUrl) return _apiUrl;
  const stored = await getSetting('api_url');
  _apiUrl = stored ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
  return _apiUrl!;
}

async function getApiToken(): Promise<string | null> {
  if (_apiToken !== null) return _apiToken || null;
  _apiToken = (await getSetting('api_token')) ?? '';
  return _apiToken || null;
}

export function clearApiConfigCache(): void {
  _apiUrl = null;
  _apiToken = null;
}

export async function isServerConfigured(): Promise<boolean> {
  const stored = await getSetting('api_url');
  if (stored) return true;
  return !!process.env.EXPO_PUBLIC_API_URL;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getApiToken();
  return token ? { 'X-API-Token': token } : {};
}

export async function getLastSyncAt(): Promise<string | null> {
  return getSetting('last_sync_at');
}

export async function deleteItem(id: string): Promise<void> {
  const deviceId = await getDeviceId();
  await db.delete(item).where(eq(item.id, id));
  await db.insert(syncTombstone).values({
    entityType: 'item',
    entityId: id,
    deletedAt: new Date().toISOString(),
    deviceId,
    synced: false,
  });
}

export async function deleteContainer(id: string, options: { cascade?: boolean } = {}): Promise<void> {
  const { cascade = true } = options;
  const deviceId = await getDeviceId();
  const now = new Date().toISOString();

  if (cascade) {
    // BFS to collect all descendants, deepest first isn't required — tombstones handle ordering
    const queue = [id];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const children = await db.select({ id: item.id, canContain: item.canContain })
        .from(item).where(eq(item.parentId, parentId));
      for (const child of children) {
        if (child.canContain) queue.push(child.id);
        await db.delete(item).where(eq(item.id, child.id));
        await db.insert(syncTombstone).values({ entityType: 'item', entityId: child.id, deletedAt: now, deviceId, synced: false });
      }
    }
  } else {
    // Move direct children up to the container's parent
    const [container] = await db.select({ parentId: item.parentId }).from(item).where(eq(item.id, id)).limit(1);
    const targetParentId = container?.parentId ?? null;
    const directChildren = await db.select({ id: item.id, canContain: item.canContain })
      .from(item).where(eq(item.parentId, id));
    for (const child of directChildren) {
      if (child.canContain || targetParentId !== null) {
        await db.update(item)
          .set({ parentId: targetParentId, lastModified: now, synced: false })
          .where(eq(item.id, child.id));
      } else {
        // Non-container item with nowhere to go — delete it
        await db.delete(item).where(eq(item.id, child.id));
        await db.insert(syncTombstone).values({ entityType: 'item', entityId: child.id, deletedAt: now, deviceId, synced: false });
      }
    }
  }

  await db.delete(item).where(eq(item.id, id));
  await db.insert(syncTombstone).values({ entityType: 'item', entityId: id, deletedAt: now, deviceId, synced: false });
}

export async function deleteCatalogue(id: string, options: { deleteItems?: boolean } = {}): Promise<void> {
  const { deleteItems = true } = options;
  const deviceId = await getDeviceId();
  const now = new Date().toISOString();
  const catalogueItems = await db.select({ id: item.id }).from(item).where(eq(item.catalogueId, id));
  if (deleteItems) {
    for (const i of catalogueItems) {
      await db.delete(item).where(eq(item.id, i.id));
      await db.insert(syncTombstone).values({
        entityType: 'item',
        entityId: i.id,
        deletedAt: now,
        deviceId,
        synced: false,
      });
    }
  } else if (catalogueItems.length > 0) {
    await db.update(item)
      .set({ catalogueId: null, lastModified: now, synced: false })
      .where(eq(item.catalogueId, id));
  }
  await db.delete(catalogue).where(eq(catalogue.id, id));
  await db.insert(syncTombstone).values({
    entityType: 'catalogue',
    entityId: id,
    deletedAt: now,
    deviceId,
    synced: false,
  });
}

interface PushResult {
  pushed: number;
  pushedItemIds: Set<string>;
  pushedCatIds: Set<string>;
  pushedTombstoneIds: Set<string>;
}

async function push(): Promise<PushResult> {
  const deviceId = await getDeviceId();
  const now = isoNow();

  await db.run(
    sql`DELETE FROM item
        WHERE synced = 0
          AND catalogue_id IS NOT NULL
          AND catalogue_id NOT IN (SELECT id FROM catalogue)`
  );

  const [unsyncedCats, unsyncedItems, unsyncedTombstones] = await Promise.all([
    db.select().from(catalogue).where(eq(catalogue.synced, false)),
    db.select().from(item).where(eq(item.synced, false)),
    db.select().from(syncTombstone).where(eq(syncTombstone.synced, false)),
  ]);

  if (!unsyncedCats.length && !unsyncedItems.length && !unsyncedTombstones.length) {
    return { pushed: 0, pushedItemIds: new Set(), pushedCatIds: new Set(), pushedTombstoneIds: new Set() };
  }

  const apiUrl = await getApiUrl();
  const res = await fetch(`${apiUrl}/api/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...await authHeaders() },
    body: JSON.stringify({
      catalogues: unsyncedCats.map(c => ({ ...c, deviceId, lastModified: now })),
      items: unsyncedItems.map(i => ({
        ...i,
        spec: i.spec ? JSON.parse(i.spec) : null,
        deviceId,
        lastModified: now,
      })),
      tombstones: unsyncedTombstones,
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
    ...unsyncedTombstones.map(t =>
      db.update(syncTombstone).set({ synced: true }).where(eq(syncTombstone.id, t.id))
    ),
  ]);

  return {
    pushed: unsyncedCats.length + unsyncedItems.length + unsyncedTombstones.length,
    pushedItemIds: new Set(unsyncedItems.map(i => i.id)),
    pushedCatIds: new Set(unsyncedCats.map(c => c.id)),
    pushedTombstoneIds: new Set(unsyncedTombstones.map(t => t.id)),
  };
}

async function pull(
  since: string,
  skipItemIds: Set<string> = new Set(),
  skipCatIds: Set<string> = new Set(),
  skipTombstoneIds: Set<string> = new Set(),
): Promise<number> {
  const apiUrl = await getApiUrl();
  const res = await fetch(`${apiUrl}/api/sync/pull?since=${encodeURIComponent(since)}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Pull failed: ${res.status}`);

  const { catalogues: serverCats = [], items: serverItems = [], tombstones: serverTombstones = [] } = await res.json();
  let count = 0;

  // Apply tombstones first; collect IDs to skip when processing items/catalogues
  const tombstonedItemIds = new Set<string>();
  const tombstonedCatIds = new Set<string>();
  for (const t of serverTombstones) {
    if (skipTombstoneIds.has(t.id)) continue;
    if (t.entityType === 'item') {
      await db.delete(item).where(eq(item.id, t.entityId));
      tombstonedItemIds.add(t.entityId);
    } else if (t.entityType === 'catalogue') {
      await db.delete(catalogue).where(eq(catalogue.id, t.entityId));
      tombstonedCatIds.add(t.entityId);
    }
    await db.insert(syncTombstone).values({ ...t, synced: true }).onConflictDoNothing();
    count++;
  }

  for (const sc of serverCats) {
    if (skipCatIds.has(sc.id) || tombstonedCatIds.has(sc.id)) continue;
    const [existing] = await db.select().from(catalogue).where(eq(catalogue.id, sc.id)).limit(1);
    if (existing) {
      if (toMs(sc.lastModified) >= toMs(existing.lastModified)) {
        await db.update(catalogue).set({ ...sc, synced: true }).where(eq(catalogue.id, sc.id));
        count++;
      }
    } else {
      await db.insert(catalogue).values({ ...sc, synced: true }).onConflictDoNothing();
      count++;
    }
  }

  for (const si of serverItems) {
    if (skipItemIds.has(si.id) || tombstonedItemIds.has(si.id)) continue;
    const mapped = {
      ...si,
      spec: si.spec != null ? JSON.stringify(si.spec) : null,
      synced: true,
    };
    const [existing] = await db.select().from(item).where(eq(item.id, si.id)).limit(1);
    if (existing) {
      if (toMs(si.lastModified) >= toMs(existing.lastModified)) {
        await db.update(item).set(mapped).where(eq(item.id, si.id));
        count++;
      }
    } else {
      await db.insert(item).values(mapped).onConflictDoNothing();
      count++;
    }
  }

  return count;
}

export async function sync(): Promise<{ pushed: number; pulled: number }> {
  const since = (await getLastSyncAt()) ?? '1970-01-01T00:00:00Z';
  const { pushed, pushedItemIds, pushedCatIds, pushedTombstoneIds } = await push();
  const pulled = await pull(since, pushedItemIds, pushedCatIds, pushedTombstoneIds);
  await setSetting('last_sync_at', isoNow());
  return { pushed, pulled };
}
