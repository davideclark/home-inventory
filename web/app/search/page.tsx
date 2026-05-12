'use client';
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ItemModal from '../../components/ItemModal';
import IconRenderer from '../../components/IconRenderer';
import ConfirmDialog from '../../components/ConfirmDialog';
import { api } from '../../lib/api';
import type { Catalogue, Item } from '../../lib/types';

export default function SearchPage() {
  const qc = useQueryClient();
  const [query, setQuery]       = useState('');
  const [debounced, setDebounced] = useState('');
  const [editItem, setEditItem]   = useState<Item | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: catalogues = [] } = useQuery({
    queryKey: ['catalogues'],
    queryFn: () => api.catalogues.list<Catalogue[]>(),
  });

  const catalogueMap = new Map(catalogues.map(c => [c.id, c]));

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn:  () => api.search<Item[]>(debounced),
    enabled:  debounced.length >= 2,
  });

  async function deleteItem(id: string) {
    await api.items.delete(id);
    qc.invalidateQueries({ queryKey: ['search', debounced] });
    setConfirmId(null);
  }

  function itemNum(it: Item) {
    return it.itemNumber != null ? `#${String(it.itemNumber).padStart(3, '0')}` : '';
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Search</h1>

      <div className="mb-6">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="input w-full"
          placeholder="Search by name, manufacturer, model, or notes…"
          autoFocus
        />
      </div>

      {isFetching && <p className="text-gray-400 text-sm">Searching…</p>}

      {!isFetching && debounced.length >= 2 && results.length === 0 && (
        <p className="text-gray-400 text-sm">No results for "{debounced}".</p>
      )}

      {results.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400 font-medium">
                <th className="px-4 py-3 w-16">#</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Catalogue</th>
                <th className="px-4 py-3">Manufacturer</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3 w-24">Status</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {results.map(it => {
                const cat = it.catalogueId ? catalogueMap.get(it.catalogueId) : null;
                return (
                  <tr key={it.id} className="hover:bg-gray-50 group">
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs tabular-nums">{itemNum(it)}</td>
                    <td className="px-4 py-3 font-medium">{it.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {cat ? <span className="flex items-center gap-1"><IconRenderer value={cat.icon} size={14} />{cat.name}</span> : ''}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{it.manufacturer ?? ''}</td>
                    <td className="px-4 py-3 text-gray-500">{it.model ?? ''}</td>
                    <td className="px-4 py-3">
                      {it.status && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{it.status}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button onClick={() => setEditItem(it)} className="btn-sm">Edit</button>
                        <button onClick={() => setConfirmId(it.id)} className="btn-sm-danger">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editItem && (
        <ItemModal
          item={editItem}
          onSave={() => { qc.invalidateQueries({ queryKey: ['search', debounced] }); setEditItem(null); }}
          onClose={() => setEditItem(null)}
        />
      )}
      {confirmId && (
        <ConfirmDialog
          message="Delete this item? This cannot be undone."
          onConfirm={() => deleteItem(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  );
}
