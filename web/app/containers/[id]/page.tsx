'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import ItemModal from '../../../components/ItemModal';
import ItemDetailModal from '../../../components/ItemDetailModal';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { api } from '../../../lib/api';
import IconRenderer from '../../../components/IconRenderer';
import type { Item, Catalogue, FieldDef } from '../../../lib/types';

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

  const { data: allLeafItems = [] } = useQuery({
    queryKey: ['items-by-parent'],
    queryFn: () => api.items.list<Item[]>(),
  });

  const { data: catalogues = [] } = useQuery({
    queryKey: ['catalogues'],
    queryFn: () => api.catalogues.list<Catalogue[]>(),
  });

  const containerMap = new Map(allContainers.map(c => [c.id, c]));
  const breadcrumbs  = buildBreadcrumb(id, containerMap);

  const subContainers = [...children].filter(c => c.canContain).sort((a, b) => a.name.localeCompare(b.name));
  const leafItems     = [...children].filter(c => !c.canContain).sort((a, b) => a.name.localeCompare(b.name));

  const catalogueMap = new Map(catalogues.map(c => [c.id, c]));
  const cataloguesByContainer = new Map<string, string[]>();
  allLeafItems.forEach(it => {
    if (!it.parentId || !it.catalogueId) return;
    const catName = catalogueMap.get(it.catalogueId)?.name;
    if (!catName) return;
    const existing = cataloguesByContainer.get(it.parentId);
    if (!existing) { cataloguesByContainer.set(it.parentId, [catName]); return; }
    if (!existing.includes(catName)) existing.push(catName);
  });

  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [addOpen, setAddOpen]       = useState(false);
  const [editItem, setEditItem]     = useState<Item | null>(null);
  const [confirmId, setConfirmId]   = useState<string | null>(null);
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

  function specDetails(it: Item) {
    const fields: FieldDef[] = (it.catalogueId ? catalogueMap.get(it.catalogueId)?.fields ?? [] : []).filter(f => f.showInList);
    if (!fields.length || !it.spec) return '';
    return fields.map(f => it.spec![f.key]).filter(Boolean).join(' · ');
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
                    <div className="flex-1 min-w-0">
                      <button onClick={() => setDetailItem(c)} className="font-medium text-sm hover:text-blue-500 text-left">
                        {c.name}
                      </button>
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
                      <button onClick={() => handleContainerDeleteClick(c)} className="btn-sm-danger">Delete</button>
                    </div>
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
                      <th className="px-2 py-3 w-12"></th>
                      <th className="px-4 py-3 w-16">#</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Details</th>
                      <th className="px-4 py-3">Catalogue</th>
                      <th className="px-4 py-3 w-24"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {leafItems.map(it => {
                      const cat = it.catalogueId ? catalogueMap.get(it.catalogueId) : null;
                      return (
                      <tr key={it.id} className="hover:bg-gray-50 group">
                        <Thumb item={it} />
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{itemNum(it)}</td>
                        <td className="px-4 py-3 font-medium">
                          <button onClick={() => setDetailItem(it)} className="hover:text-blue-500 text-left">{it.name}</button>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{specDetails(it)}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {cat ? <Link href={`/catalogues/${cat.id}`} className="flex items-center gap-1 hover:text-blue-500"><IconRenderer value={cat.icon ?? null} size={14} />{cat.name}</Link> : ''}
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
