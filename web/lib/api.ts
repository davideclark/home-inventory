const BASE = '/api/proxy';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => String(res.status));
    throw new Error(text || String(res.status));
  }
  return res.json() as Promise<T>;
}

export const api = {
  catalogues: {
    list:   <T = unknown>() => req<T>('catalogues'),
    get:    <T = unknown>(id: string) => req<T>(`catalogues/${id}`),
    create: <T = unknown>(data: unknown) => req<T>('catalogues', { method: 'POST', body: JSON.stringify(data) }),
    update: <T = unknown>(id: string, data: unknown) => req<T>(`catalogues/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => req(`catalogues/${id}`, { method: 'DELETE' }),
  },
  items: {
    list: <T = unknown>(params?: Record<string, string>) => {
      const qs = params && Object.keys(params).length
        ? '?' + new URLSearchParams(params).toString()
        : '';
      return req<T>(`items${qs}`);
    },
    get:    <T = unknown>(id: string) => req<T>(`items/${id}`),
    create: <T = unknown>(data: unknown) => req<T>('items', { method: 'POST', body: JSON.stringify(data) }),
    update: <T = unknown>(id: string, data: unknown) => req<T>(`items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => req(`items/${id}`, { method: 'DELETE' }),
  },
  search: <T = unknown>(q: string) => req<T>(`search?q=${encodeURIComponent(q)}`),
};
