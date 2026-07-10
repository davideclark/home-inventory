const BASE = '/api/proxy';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = options?.body instanceof FormData
    ? {}
    : { 'Content-Type': 'application/json' };
  const res = await fetch(`${BASE}/${path}`, {
    headers,
    ...options,
  });
  if (!res.ok) {
    let message: string;
    try {
      const body = await res.json();
      message = body.error ?? String(res.status);
    } catch {
      message = await res.text().catch(() => '') || String(res.status);
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  catalogues: {
    list:   <T = unknown>() => req<T>('catalogues'),
    get:    <T = unknown>(id: string) => req<T>(`catalogues/${id}`),
    create: <T = unknown>(data: unknown) => req<T>('catalogues', { method: 'POST', body: JSON.stringify(data) }),
    update: <T = unknown>(id: string, data: unknown) => req<T>(`catalogues/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string, keepItems?: boolean) => req(`catalogues/${id}${keepItems ? '?keepItems=true' : ''}`, { method: 'DELETE' }),
  },
  items: {
    list: <T = unknown>(params?: Record<string, string>) => {
      const qs = params && Object.keys(params).length
        ? '?' + new URLSearchParams(params).toString()
        : '';
      return req<T>(`items${qs}`);
    },
    get:        <T = unknown>(id: string) => req<T>(`items/${id}`),
    parentIds:  ()                        => req<string[]>('items/parent-ids'),
    create: <T = unknown>(data: unknown) => req<T>('items', { method: 'POST', body: JSON.stringify(data) }),
    update: <T = unknown>(id: string, data: unknown) => req<T>(`items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string, options?: { cascade?: boolean; moveUp?: boolean }) => {
      const params = new URLSearchParams();
      if (options?.cascade) params.set('cascade', 'true');
      if (options?.moveUp)  params.set('moveUp',  'true');
      const qs = params.toString() ? `?${params}` : '';
      return req(`items/${id}${qs}`, { method: 'DELETE' });
    },
  },
  search: <T = unknown>(q: string) => req<T>(`search?q=${encodeURIComponent(q)}`),
  images: {
    upload: (id: string, file: File): Promise<{ ok: boolean }> => {
      const form = new FormData();
      form.append('file', file);
      return req(`items/${id}/image`, { method: 'POST', body: form });
    },
    delete: (id: string): Promise<{ ok: boolean }> =>
      req(`items/${id}/image`, { method: 'DELETE' }),
    url: (id: string) => `${BASE}/items/${id}/image`,
  },
  attachments: {
    list: <T = unknown>(itemId: string) => req<T>(`items/${itemId}/attachments`),
    upload: <T = unknown>(itemId: string, file: File, kind?: 'photo' | 'document'): Promise<T> => {
      const form = new FormData();
      form.append('file', file);
      if (kind) form.append('kind', kind);
      return req<T>(`items/${itemId}/attachments`, { method: 'POST', body: form });
    },
    delete: (id: string): Promise<{ ok: boolean }> =>
      req(`attachments/${id}`, { method: 'DELETE' }),
    url: (id: string) => `${BASE}/attachments/${id}/file`,
  },
};
