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
let _jwtToken: string | null = null;
let _jwtExpiresAt: number | null = null;

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

async function getJwtToken(): Promise<string | null> {
  if (_jwtToken !== null) return _jwtToken || null;
  _jwtToken = (await getSetting('jwt_token')) ?? '';
  return _jwtToken || null;
}

async function getJwtExpiresAt(): Promise<number | null> {
  if (_jwtExpiresAt !== null) return _jwtExpiresAt || null;
  const stored = await getSetting('jwt_expires_at');
  _jwtExpiresAt = stored ? parseInt(stored, 10) : 0;
  return _jwtExpiresAt || null;
}

export function clearApiConfigCache(): void {
  _apiUrl = null;
  _jwtToken = null;
  _jwtExpiresAt = null;
}

export async function storeAuthTokens(jwt: string, refreshToken: string, username: string): Promise<void> {
  const expiresAt = Date.now() + 14 * 60 * 1000;
  await Promise.all([
    setSetting('jwt_token', jwt),
    setSetting('jwt_expires_at', String(expiresAt)),
    setSetting('refresh_token', refreshToken),
    setSetting('logged_in_username', username),
  ]);
  _jwtToken = jwt;
  _jwtExpiresAt = expiresAt;
}

export async function clearAuthTokens(): Promise<void> {
  await Promise.all([
    db.delete(settings).where(eq(settings.key, 'jwt_token')),
    db.delete(settings).where(eq(settings.key, 'jwt_expires_at')),
    db.delete(settings).where(eq(settings.key, 'refresh_token')),
    db.delete(settings).where(eq(settings.key, 'logged_in_username')),
  ]);
  _jwtToken = null;
  _jwtExpiresAt = null;
}

export async function getLoggedInUsername(): Promise<string | null> {
  return getSetting('logged_in_username');
}

async function refreshJwt(): Promise<boolean> {
  const refreshToken = await getSetting('refresh_token');
  if (!refreshToken) return false;
  const apiUrl = await getApiUrl();
  try {
    const res = await fetch(`${apiUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (res.status === 401 || res.status === 403) {
      // Server explicitly rejected the token — session is invalidated, force re-login
      await clearAuthTokens();
      return false;
    }
    if (!res.ok) return false; // Other server error — leave credentials intact
    const { token, refreshToken: newRefreshToken } = await res.json();
    const newExpiresAt = Date.now() + 14 * 60 * 1000;
    await setSetting('jwt_token', token);
    await setSetting('jwt_expires_at', String(newExpiresAt));
    if (newRefreshToken) await setSetting('refresh_token', newRefreshToken);
    _jwtToken = token;
    _jwtExpiresAt = newExpiresAt;
    return true;
  } catch {
    // Network error — leave credentials intact so offline access still works
    return false;
  }
}

export async function checkStartupAuth(): Promise<boolean> {
  const storedUrl = await getSetting('api_url');
  const hasServer = !!(storedUrl || process.env.EXPO_PUBLIC_API_URL);

  if (!hasServer) return true; // Standalone mode — no auth needed

  const jwt = await getJwtToken();
  const expiresAt = await getJwtExpiresAt();

  // JWT present and still valid — no network needed
  if (jwt && expiresAt && expiresAt - Date.now() > 60_000) return true;

  // JWT missing or expired — try to refresh
  // refreshJwt() clears credentials on 401/403 (revoked), preserves them on network error
  const refreshed = await refreshJwt();
  if (refreshed) return true;

  // Refresh failed — check if credentials were cleared (auth failure) or preserved (offline)
  const refreshToken = await getSetting('refresh_token');
  return !!refreshToken; // Has refresh token = offline with valid creds = allow access
}

async function ensureFreshJwt(): Promise<void> {
  const expiresAt = await getJwtExpiresAt();
  if (!expiresAt) {
    // No expiry stored — if a JWT exists, try a proactive refresh (it may be stale)
    if (await getJwtToken()) await refreshJwt();
    return;
  }
  if (expiresAt - Date.now() > 60_000) return;
  const ok = await refreshJwt();
  if (!ok) throw new Error('Session expired — please log in again');
}

export async function isServerConfigured(): Promise<boolean> {
  const stored = await getSetting('api_url');
  if (stored) return true;
  return !!process.env.EXPO_PUBLIC_API_URL;
}

async function authHeaders(): Promise<Record<string, string>> {
  const jwt = await getJwtToken();
  return jwt ? { 'Authorization': `Bearer ${jwt}` } : {};
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
    const mapped = {
      ...sc,
      fields: sc.fields != null ? JSON.stringify(sc.fields) : null,
      synced: true,
    };
    const [existing] = await db.select().from(catalogue).where(eq(catalogue.id, sc.id)).limit(1);
    if (existing) {
      if (toMs(sc.lastModified) >= toMs(existing.lastModified)) {
        await db.update(catalogue).set(mapped).where(eq(catalogue.id, sc.id));
        count++;
      }
    } else {
      await db.insert(catalogue).values(mapped).onConflictDoNothing();
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

export async function uploadItemImage(itemId: string, localUri: string): Promise<void> {
  await ensureFreshJwt();
  const apiUrl = await getApiUrl();
  const headers = await authHeaders();
  if (!headers['Authorization']) throw new Error('Sign in via Settings to upload photos');
  const form = new FormData();
  form.append('file', { uri: localUri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
  const res = await fetch(`${apiUrl}/api/items/${itemId}/image`, { method: 'POST', headers, body: form });
  if (!res.ok) throw new Error(`Image upload failed (${res.status})`);
  await db.update(item).set({ hasImage: true }).where(eq(item.id, itemId));
}

export async function deleteItemImage(itemId: string): Promise<void> {
  await ensureFreshJwt();
  const apiUrl = await getApiUrl();
  const headers = await authHeaders();
  await fetch(`${apiUrl}/api/items/${itemId}/image`, { method: 'DELETE', headers });
  await db.update(item).set({ hasImage: false }).where(eq(item.id, itemId));
}

export async function getImageUrl(itemId: string): Promise<{ url: string; headers: Record<string, string> }> {
  const apiUrl = await getApiUrl();
  // Silently try to refresh if JWT is expired/near-expiry — don't throw if offline
  const expiresAt = await getJwtExpiresAt();
  if (expiresAt && expiresAt - Date.now() <= 60_000) {
    await refreshJwt();
  }
  const headers = await authHeaders();
  return { url: `${apiUrl}/api/items/${itemId}/image`, headers };
}

// ── Attachments (photos + documents) — server-side only, fetched on demand ──

export type ItemAttachment = {
  id: string;
  itemId: string;
  kind: 'photo' | 'document';
  originalFilename: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

export async function listAttachments(itemId: string): Promise<ItemAttachment[]> {
  await ensureFreshJwt();
  const apiUrl = await getApiUrl();
  const headers = await authHeaders();
  if (!headers['Authorization']) throw new Error('Sign in via Settings to view attachments');
  const res = await fetch(`${apiUrl}/api/items/${itemId}/attachments`, { headers });
  if (!res.ok) throw new Error(`Could not load attachments (${res.status})`);
  return res.json();
}

export async function uploadAttachment(
  itemId: string,
  file: { uri: string; name: string; mimeType: string },
  kind?: 'photo' | 'document'
): Promise<void> {
  await ensureFreshJwt();
  const apiUrl = await getApiUrl();
  const headers = await authHeaders();
  if (!headers['Authorization']) throw new Error('Sign in via Settings to upload attachments');
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  if (kind) form.append('kind', kind);
  const res = await fetch(`${apiUrl}/api/items/${itemId}/attachments`, { method: 'POST', headers, body: form });
  if (!res.ok) throw new Error(`Attachment upload failed (${res.status})`);
}

export async function deleteAttachment(id: string): Promise<void> {
  await ensureFreshJwt();
  const apiUrl = await getApiUrl();
  const headers = await authHeaders();
  const res = await fetch(`${apiUrl}/api/attachments/${id}`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`Could not delete attachment (${res.status})`);
}

export async function getAttachmentUrl(id: string): Promise<{ url: string; headers: Record<string, string> }> {
  const apiUrl = await getApiUrl();
  const expiresAt = await getJwtExpiresAt();
  if (expiresAt && expiresAt - Date.now() <= 60_000) {
    await refreshJwt();
  }
  const headers = await authHeaders();
  return { url: `${apiUrl}/api/attachments/${id}/file`, headers };
}

export async function sync(): Promise<{ pushed: number; pulled: number }> {
  const jwt = await getJwtToken();
  if (!jwt) {
    // No credentials — skip silently in standalone mode, prompt to sign in if server is configured
    if (await isServerConfigured()) throw new Error('Sign in via Settings to sync');
    return { pushed: 0, pulled: 0 };
  }
  await ensureFreshJwt();
  const since = (await getLastSyncAt()) ?? '1970-01-01T00:00:00Z';
  const { pushed, pushedItemIds, pushedCatIds, pushedTombstoneIds } = await push();
  const pulled = await pull(since, pushedItemIds, pushedCatIds, pushedTombstoneIds);
  await setSetting('last_sync_at', isoNow());
  return { pushed, pulled };
}
