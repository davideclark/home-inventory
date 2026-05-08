'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
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

  const [modal, setModal]     = useState<{ mode: 'add' | 'edit'; item?: Catalogue } | null>(null);
  const [form, setForm]       = useState<Form>(blank);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  function openAdd() {
    setForm(blank); setError(''); setModal({ mode: 'add' });
  }
  function openEdit(cat: Catalogue) {
    setForm({ name: cat.name, icon: cat.icon ?? '', description: cat.description ?? '', isStructural: cat.isStructural });
    setError(''); setModal({ mode: 'edit', item: cat });
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

  async function deleteCatalogue(id: string) {
    await api.catalogues.delete(id);
    qc.invalidateQueries({ queryKey: ['catalogues'] });
    setConfirmId(null);
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
              <span className="text-xl w-8 text-center">{cat.icon ?? '📁'}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{cat.name}</div>
                {cat.description && <div className="text-xs text-gray-400 truncate">{cat.description}</div>}
              </div>
              {cat.isStructural && (
                <span className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">structural</span>
              )}
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Link href={`/catalogues/${cat.id}`} className="btn-sm">View items</Link>
                <button onClick={() => openEdit(cat)} className="btn-sm">Edit</button>
                <button onClick={() => setConfirmId(cat.id)} className="btn-sm-danger">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal
          title={modal.mode === 'add' ? 'Add Catalogue' : 'Edit Catalogue'}
          onClose={() => setModal(null)}
          footer={
            <>
              <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
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
              <label className="block text-xs font-medium text-gray-500 mb-1">Icon (emoji)</label>
              <input value={form.icon} onChange={f('icon')} className="input" placeholder="🔌" />
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

      {confirmId && (
        <ConfirmDialog
          message="Delete this catalogue? Items will lose their catalogue association."
          onConfirm={() => deleteCatalogue(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  );
}
