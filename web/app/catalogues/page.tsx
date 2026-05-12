'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import IconRenderer from '../../components/IconRenderer';
import IconPicker from '../../components/IconPicker';
import { api } from '../../lib/api';
import type { Catalogue } from '../../lib/types';

type Form = { name: string; icon: string; description: string; isStructural: boolean };
const blank: Form = { name: '', icon: '', description: '', isStructural: false };

export default function CataloguesPage() {
  const qc = useQueryClient();
  const { data: catalogues = [], isLoading } = useQuery({
    queryKey: ['catalogues'],
    queryFn: () => api.catalogues.list<Catalogue[]>(),
  });

  const sorted = [...catalogues].sort((a, b) => a.name.localeCompare(b.name));

  const [modal, setModal]           = useState<{ mode: 'add' | 'edit'; item?: Catalogue } | null>(null);
  const [form, setForm]             = useState<Form>(blank);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; itemCount: number } | null>(null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);

  function openAdd() {
    setForm(blank); setError(''); setModal({ mode: 'add' });
  }
  function openEdit(cat: Catalogue) {
    setForm({ name: cat.name, icon: cat.icon ?? '', description: cat.description ?? '', isStructural: cat.isStructural });
    setError(''); setModal({ mode: 'edit', item: cat });
  }
  function closeModal() {
    setModal(null); setShowIconPicker(false);
  }

  async function save() {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    try {
      const data = {
        name: form.name.trim(),
        icon: form.icon.trim() || null,
        description: form.description.trim() || null,
        isStructural: form.isStructural,
      };
      if (modal?.mode === 'edit' && modal.item) {
        await api.catalogues.update(modal.item.id, data);
      } else {
        await api.catalogues.create({ ...data, deviceId: 'web', synced: false });
      }
      qc.invalidateQueries({ queryKey: ['catalogues'] });
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  }

  async function handleDeleteClick(id: string) {
    const items = await api.items.list<{ id: string }[]>({ catalogueId: id });
    setDeleteTarget({ id, itemCount: items.length });
  }

  async function confirmDelete(keepItems: boolean) {
    if (!deleteTarget) return;
    await api.catalogues.delete(deleteTarget.id, keepItems);
    qc.invalidateQueries({ queryKey: ['catalogues'] });
    qc.invalidateQueries({ queryKey: ['items'] });
    setDeleteTarget(null);
  }

  const f = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: (e.target as HTMLInputElement).type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Catalogues</h1>
        <button onClick={openAdd} className="btn-primary">+ Add Catalogue</button>
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-gray-400 text-sm">No catalogues yet.</p>
      ) : (
        <div className="card divide-y divide-gray-100">
          {sorted.map(cat => (
            <div key={cat.id} className="flex items-center px-4 py-3 gap-3 hover:bg-gray-50 group">
              <IconRenderer value={cat.icon} size={20} className="w-8 flex items-center justify-center" />
              <Link href={`/catalogues/${cat.id}`} className="flex-1 min-w-0 hover:text-blue-500">
                <div className="font-medium text-sm">{cat.name}</div>
                {cat.description && <div className="text-xs text-gray-400 truncate">{cat.description}</div>}
              </Link>
              {cat.isStructural && (
                <span className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">structural</span>
              )}
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Link href={`/catalogues/${cat.id}`} className="btn-sm">View items</Link>
                <button onClick={() => openEdit(cat)} className="btn-sm">Edit</button>
                <button onClick={() => handleDeleteClick(cat.id)} className="btn-sm-danger">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal
          title={modal.mode === 'add' ? 'Add Catalogue' : 'Edit Catalogue'}
          onClose={closeModal}
          footer={
            <>
              <button onClick={closeModal} className="btn-secondary">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
            </>
          }
        >
          {error && <p className="text-red-500 text-sm mb-3 p-2 bg-red-50 rounded-lg">{error}</p>}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
              <input autoFocus value={form.name} onChange={f('name')}
                onKeyDown={e => e.key === 'Enter' && save()} className="input" placeholder="Cables" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Icon</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowIconPicker(true)}
                  className="w-12 h-12 flex items-center justify-center rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors bg-white"
                  title="Choose icon"
                >
                  <IconRenderer value={form.icon || null} size={22} />
                </button>
                {form.icon && (
                  <button type="button" onClick={() => setForm(p => ({ ...p, icon: '' }))} className="text-xs text-gray-400 hover:text-gray-600">
                    Clear
                  </button>
                )}
                {!form.icon && <span className="text-xs text-gray-400">Click to choose</span>}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
              <textarea value={form.description} onChange={f('description')} className="input resize-none" rows={2} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={form.isStructural} onChange={f('isStructural')} className="w-4 h-4 accent-blue-500" />
              <span className="text-sm text-gray-700">Structural (location / container type)</span>
            </label>
          </div>
        </Modal>
      )}

      {showIconPicker && (
        <IconPicker
          value={form.icon || null}
          onChange={v => setForm(p => ({ ...p, icon: v }))}
          onClose={() => setShowIconPicker(false)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={
            deleteTarget.itemCount === 0
              ? 'Delete this catalogue? This cannot be undone.'
              : `This catalogue contains ${deleteTarget.itemCount} item${deleteTarget.itemCount === 1 ? '' : 's'}. Delete them too, or keep them without a catalogue?`
          }
          confirmLabel="Delete All"
          secondaryAction={deleteTarget.itemCount > 0 ? { label: 'Keep Items', onClick: () => confirmDelete(true) } : undefined}
          onConfirm={() => confirmDelete(false)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
