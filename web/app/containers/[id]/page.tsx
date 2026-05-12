'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import ItemModal from '../../../components/ItemModal';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { api } from '../../../lib/api';
import type { Item } from '../../../lib/types';

function buildBreadcrumb(id: string, map: Map<string, Item>): { id: string; name: string }[] {
  const crumbs: { id: string; name: string }[] = [];
  let cur: Item | undefined = map.get(id);
  while (cur) {
    crumbs.unshift({ id: cur.id, name: cur.name });
    cur = cur.parentId ? map.get(cur.parentId) : undefined;
  }
  return crumbs;
}

export default function ContainerPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: allContainers = [] } = useQuery({
    queryKey: ['containers'],
    queryFn: () => api.items.list<Item[]>({ canContain: 'true' }),
  });

  const { data: children = [], isLoading } = useQuery({
    queryKey: ['container-children', id],
    queryFn: () => api.items.list<Item[]>({ parentId: id }),
  });

  const containerMap = new Map(allContainers.map(c => [c.id, c]));
  const breadcrumbs  = buildBreadcrumb(id, containerMap);

  const subContainers = [...children].filter(c => c.canContain).sort((a, b) => a.name.localeCompare(b.name));
  const leafItems     = [...children].filter(c => !c.canContain).sort((a, b) => a.name.localeCompare(b.name));

  const [addOpen, setAddOpen]     = useState(false);
  const [editItem, setEditItem]   = useState<Item | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteContainerTarget, setDeleteContainerTarget] = useState<{
    id: string; name: string; childCount: number; hasNonContainerChildren: boolean; parentId: string | null;
  } | null>(null);

  function afterSave() {
    qc.invalidateQueries({ queryKey: ['container-children', id] });
    qc.invalidateQueries({ queryKey: ['containers'] });
    setAddOpen(false);
    setEditItem(null);
  }

  async function deleteLeafItem(itemId: string) {
    await api.items.delete(itemId);
    qc.invalidateQueries({ queryKey: ['container-children', id] });
    qc.invalidateQueries({ queryKey: ['containers'] });
    setConfirmId(null);
  }

  async function handleContainerDeleteClick(container: Item) {
    const children = await api.items.list<Item[]>({ parentId: container.id });
    setDeleteContainerTarget({
      id: container.id,
      name: container.name,
      childCount: children.length,
      hasNonContainerChildren: children.some(c => !c.canContain),
      parentId: container.parentId ?? null,
    });
  }

  async function confirmContainerDelete(mode: 'cascade' | 'moveUp') {
    if (!deleteContainerTarget) return;
    await api.items.delete(deleteContainerTarget.id, {
      cascade: mode === 'cascade',
      moveUp:  mode === 'moveUp',
    });
    qc.invalidateQueries({ queryKey: ['container-children', id] });
    qc.invalidateQueries({ queryKey: ['containers'] });
    setDeleteContainerTarget(null);
  }

  function itemNum(it: Item) {
    return it.itemNumber != null ? `#${String(it.itemNumber).padStart(3, '0')}` : '';
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm mb-4 flex-wrap">
        <Link href="/containers" className="text-blue-500 hover:underline">Containers</Link>
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.id} className="flex items-center gap-1">
            <span className="text-gray-300">›</span>
            {i < breadcrumbs.length - 1 ? (
              <Link href={`/containers/${crumb.id}`} className="text-blue-500 hover:underline">{crumb.name}</Link>
            ) : (
              <span className="font-semibold text-gray-900">{crumb.name}</span>
            )}
          </span>
        ))}
        <div className="ml-auto">
          <button onClick={() => setAddOpen(true)} className="btn-primary">+ Add Item</button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : (
        <div className="space-y-6">
          {/* Sub-containers */}
          {subContainers.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Containers</h2>
              <div className="card divide-y divide-gray-100">
                {subContainers.map(c => (
                  <div key={c.id} className="flex items-center px-4 py-3 gap-3 hover:bg-gray-50 group">
                    <span className="text-lg">📦</span>
                    <Link href={`/containers/${c.id}`} className="flex-1 hover:text-blue-500">
                      <div className="font-medium text-sm">{c.name}</div>
                      {c.notes && <div className="text-xs text-gray-500 mt-0.5">{c.notes}</div>}
                    </Link>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditItem(c)} className="btn-sm">Edit</button>
                      <button onClick={() => handleContainerDeleteClick(c)} className="btn-sm-danger">Delete</button>
                    </div>
                    <Link href={`/containers/${c.id}`} className="text-gray-300 group-hover:text-gray-400">›</Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Leaf items */}
          {leafItems.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Items</h2>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-400 font-medium">
                      <th className="px-4 py-3 w-16">#</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Manufacturer</th>
                      <th className="px-4 py-3">Model</th>
                      <th className="px-4 py-3 w-24"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {leafItems.map(it => (
                      <tr key={it.id} className="hover:bg-gray-50 group">
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{itemNum(it)}</td>
                        <td className="px-4 py-3 font-medium">{it.name}</td>
                        <td className="px-4 py-3 text-gray-500">{it.manufacturer ?? ''}</td>
                        <td className="px-4 py-3 text-gray-500">{it.model ?? ''}</td>
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
            </div>
          )}

          {subContainers.length === 0 && leafItems.length === 0 && (
            <p className="text-gray-400 text-sm">This container is empty.</p>
          )}
        </div>
      )}

      {addOpen && (
        <ItemModal defaultParentId={id} onSave={afterSave} onClose={() => setAddOpen(false)} />
      )}
      {editItem && (
        <ItemModal item={editItem} onSave={afterSave} onClose={() => setEditItem(null)} />
      )}
      {confirmId && (
        <ConfirmDialog
          message="Delete this item? This cannot be undone."
          onConfirm={() => deleteLeafItem(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}

      {deleteContainerTarget && (() => {
        const { childCount, hasNonContainerChildren, parentId } = deleteContainerTarget;
        const canMoveUp = parentId !== null || !hasNonContainerChildren;
        return (
          <ConfirmDialog
            message={
              childCount === 0
                ? `Delete "${deleteContainerTarget.name}"? This cannot be undone.`
                : canMoveUp
                  ? `"${deleteContainerTarget.name}" contains ${childCount} item${childCount === 1 ? '' : 's'}. Move them to the parent container, or delete everything?`
                  : `"${deleteContainerTarget.name}" contains ${childCount} item${childCount === 1 ? '' : 's'}. It has no parent, so all contents must be deleted too.`
            }
            confirmLabel="Delete All"
            secondaryAction={childCount > 0 && canMoveUp
              ? { label: 'Move Contents Up', onClick: () => confirmContainerDelete('moveUp') }
              : undefined}
            onConfirm={() => confirmContainerDelete('cascade')}
            onCancel={() => setDeleteContainerTarget(null)}
          />
        );
      })()}
    </div>
  );
}
