'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import ItemModal from '../../../components/ItemModal';
import ConfirmDialog from '../../../components/ConfirmDialog';
import IconRenderer from '../../../components/IconRenderer';
import { api } from '../../../lib/api';
import type { Catalogue, Item } from '../../../lib/types';

export default function CatalogueItemsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: catalogue } = useQuery({
    queryKey: ['catalogue', id],
    queryFn: () => api.catalogues.get<Catalogue>(id),
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['items', id],
    queryFn: () => api.items.list<Item[]>({ catalogueId: id }),
  });

  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));

  const [editItem, setEditItem]   = useState<Item | null>(null);
  const [addOpen, setAddOpen]     = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function deleteItem(itemId: string) {
    await api.items.delete(itemId);
    qc.invalidateQueries({ queryKey: ['items', id] });
    setConfirmId(null);
  }

  function afterSave() {
    qc.invalidateQueries({ queryKey: ['items', id] });
    setAddOpen(false);
    setEditItem(null);
  }

  function itemNum(it: Item) {
    return it.itemNumber != null ? `#${String(it.itemNumber).padStart(3, '0')}` : '';
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Link href="/catalogues" className="text-blue-500 hover:underline text-sm">← Catalogues</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-semibold">
          {catalogue?.icon && <IconRenderer value={catalogue.icon} size={20} className="mr-1" />}{catalogue?.name ?? '…'}
        </h1>
        <div className="ml-auto">
          <button onClick={() => setAddOpen(true)} className="btn-primary">+ Add Item</button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-gray-400 text-sm">No items in this catalogue yet.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400 font-medium">
                <th className="px-4 py-3 w-16">#</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Manufacturer</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3 w-24">Status</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map(it => (
                <tr key={it.id} className="hover:bg-gray-50 group">
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs tabular-nums">{itemNum(it)}</td>
                  <td className="px-4 py-3 font-medium">{it.name}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <ItemModal defaultCatalogueId={id} onSave={afterSave} onClose={() => setAddOpen(false)} />
      )}
      {editItem && (
        <ItemModal item={editItem} onSave={afterSave} onClose={() => setEditItem(null)} />
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
