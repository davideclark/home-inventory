'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import ConfirmDialog from '../../components/ConfirmDialog';
import ItemModal from '../../components/ItemModal';
import ItemDetailModal from '../../components/ItemDetailModal';
import { api } from '../../lib/api';
import type { Item, Catalogue } from '../../lib/types';

export default function ContainersPage() {
  const qc = useQueryClient();
  const { data: allContainers = [], isLoading } = useQuery({
    queryKey: ['containers'],
    queryFn: () => api.items.list<Item[]>({ canContain: 'true' }),
  });

  const { data: allLeafItems = [] } = useQuery({
    queryKey: ['items-by-parent'],
    queryFn: () => api.items.list<Item[]>(),
  });

  const { data: catalogues = [] } = useQuery({
    queryKey: ['catalogues'],
    queryFn: () => api.catalogues.list<Catalogue[]>(),
  });

  const roots = [...allContainers]
    .filter(c => !c.parentId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const subContainerCount = (id: string) => allContainers.filter(c => c.parentId === id).length;

  const catalogueMap = new Map(catalogues.map(c => [c.id, c.name]));
  const cataloguesByContainer = new Map<string, string[]>();
  allLeafItems.forEach(it => {
    if (!it.parentId || !it.catalogueId) return;
    const catName = catalogueMap.get(it.catalogueId);
    if (!catName) return;
    const existing = cataloguesByContainer.get(it.parentId);
    if (!existing) { cataloguesByContainer.set(it.parentId, [catName]); return; }
    if (!existing.includes(catName)) existing.push(catName);
  });

  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string; name: string; childCount: number; hasNonContainerChildren: boolean;
  } | null>(null);

  async function handleDeleteClick(container: Item) {
    const children = await api.items.list<Item[]>({ parentId: container.id });
    setDeleteTarget({
      id: container.id,
      name: container.name,
      childCount: children.length,
      hasNonContainerChildren: children.some(c => !c.canContain),
    });
  }

  function afterSave() {
    qc.invalidateQueries({ queryKey: ['containers'] });
    setAddOpen(false);
    setEditItem(null);
  }

  async function confirmDelete(mode: 'cascade' | 'moveUp') {
    if (!deleteTarget) return;
    await api.items.delete(deleteTarget.id, {
      cascade: mode === 'cascade',
      moveUp:  mode === 'moveUp',
    });
    qc.invalidateQueries({ queryKey: ['containers'] });
    setDeleteTarget(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Containers</h1>
        <button onClick={() => setAddOpen(true)} className="btn-primary">+ Add Container</button>
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : roots.length === 0 ? (
        <p className="text-gray-400 text-sm">No containers found.</p>
      ) : (
        <div className="card divide-y divide-gray-100">
          {roots.map(c => (
            <div key={c.id} className="flex items-center px-4 py-3 gap-3 hover:bg-gray-50 group">
              <span className="text-xl">📦</span>
              <div className="flex-1 min-w-0">
                <button onClick={() => setDetailItem(c)} className="font-medium text-sm hover:text-blue-500 text-left">
                  {c.name}
                </button>
                {subContainerCount(c.id) > 0 && (
                  <div className="text-xs text-gray-400">{subContainerCount(c.id)} sub-containers</div>
                )}
                {(() => {
                  const cats = cataloguesByContainer.get(c.id);
                  return cats?.length
                    ? <div className="text-xs text-gray-400 mt-0.5">{cats.join(', ')}</div>
                    : c.notes ? <div className="text-xs text-gray-400 mt-0.5">{c.notes}</div> : null;
                })()}
              </div>
              <div className="flex gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Link href={`/containers/${c.id}`} className="btn-sm whitespace-nowrap">Browse Contents</Link>
                <button onClick={() => setEditItem(c)} className="btn-sm">Edit</button>
                <button onClick={() => handleDeleteClick(c)} className="btn-sm-danger">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <ItemModal defaultCanContain onSave={afterSave} onClose={() => setAddOpen(false)} />
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

      {deleteTarget && (() => {
        // Root containers have no parent — can only move up sub-containers (canContain=true)
        const canMoveUp = !deleteTarget.hasNonContainerChildren;
        return (
          <ConfirmDialog
            message={
              deleteTarget.childCount === 0
                ? `Delete "${deleteTarget.name}"? This cannot be undone.`
                : canMoveUp
                  ? `"${deleteTarget.name}" contains ${deleteTarget.childCount} item${deleteTarget.childCount === 1 ? '' : 's'}. Move sub-containers to root, or delete everything?`
                  : `"${deleteTarget.name}" contains ${deleteTarget.childCount} item${deleteTarget.childCount === 1 ? '' : 's'}. Some items have no parent to move to, so all contents must be deleted.`
            }
            confirmLabel="Delete All"
            secondaryAction={deleteTarget.childCount > 0 && canMoveUp
              ? { label: 'Move Contents Up', onClick: () => confirmDelete('moveUp') }
              : undefined}
            onConfirm={() => confirmDelete('cascade')}
            onCancel={() => setDeleteTarget(null)}
          />
        );
      })()}
    </div>
  );
}
