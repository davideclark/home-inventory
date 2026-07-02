'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ItemModal from '../../../components/ItemModal';
import ItemDetailModal from '../../../components/ItemDetailModal';
import ConfirmDialog from '../../../components/ConfirmDialog';
import IconRenderer from '../../../components/IconRenderer';
import { api } from '../../../lib/api';
import type { Catalogue, FieldDef, Item } from '../../../lib/types';

function Thumb({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  if (!item.hasImage) return <td className="px-2 py-2 w-12" />;
  return (
    <td className="px-2 py-2 w-12">
      <img
        src={api.images.url(item.id)}
        alt=""
        className="w-10 h-10 rounded object-cover cursor-zoom-in"
        onClick={() => setOpen(true)}
      />
      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setOpen(false)}>
          <img src={api.images.url(item.id)} alt="" className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </td>
  );
}

export default function CatalogueItemsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const router = useRouter();

  const { data: catalogue } = useQuery({
    queryKey: ['catalogue', id],
    queryFn: () => api.catalogues.get<Catalogue>(id),
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['items', id],
    queryFn: () => api.items.list<Item[]>({ catalogueId: id }),
  });

  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));

  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [editItem, setEditItem]     = useState<Item | null>(null);
  const [addOpen, setAddOpen]       = useState(false);
  const [confirmId, setConfirmId]   = useState<string | null>(null);

  async function deleteItem(itemId: string) {
    await api.items.delete(itemId);
    qc.invalidateQueries({ queryKey: ['items'] });
    setConfirmId(null);
  }

  function afterSave() {
    qc.invalidateQueries({ queryKey: ['items'] });
    setAddOpen(false);
    setEditItem(null);
  }

  const showInListFields: FieldDef[] = (catalogue?.fields ?? []).filter(f => f.showInList);

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
                <th className="px-2 py-3 w-12"></th>
                <th className="px-4 py-3 w-16">#</th>
                <th className="px-4 py-3">Name</th>
                {showInListFields.map(f => (
                  <th key={f.key} className="px-4 py-3">{f.label}</th>
                ))}
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map(it => (
                <tr key={it.id} className="hover:bg-gray-50 group">
                  <Thumb item={it} />
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs tabular-nums">{itemNum(it)}</td>
                  <td className="px-4 py-3 font-medium">
                    <button onClick={() => setDetailItem(it)} className="hover:text-blue-500 text-left">{it.name}</button>
                  </td>
                  {showInListFields.map(f => (
                    <td key={f.key} className="px-4 py-3 text-gray-500 text-xs">{it.spec?.[f.key] != null ? String(it.spec[f.key]) : ''}</td>
                  ))}
                  <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-xs">{it.notes ?? ''}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      {it.canContain && (
                        <button onClick={() => router.push(`/containers/${it.id}`)} className="btn-sm whitespace-nowrap">Browse Contents</button>
                      )}
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
      {detailItem && !editItem && (
        <ItemDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onEdit={() => { setEditItem(detailItem); setDetailItem(null); }}
        />
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
