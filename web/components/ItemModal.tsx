'use client';
import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Modal from './Modal';
import IconRenderer from './IconRenderer';
import { api } from '../lib/api';
import type { Catalogue, FieldDef, Item } from '../lib/types';

type Form = {
  name: string;
  itemNumber: string;
  catalogueId: string;
  parentId: string;
  canContain: boolean;
  notes: string;
};

const blank: Form = {
  name: '', itemNumber: '', catalogueId: '', parentId: '',
  canContain: false, notes: '',
};

function buildPath(id: string, map: Map<string, Item>, depth = 0): string {
  if (depth > 10) return '…';
  const it = map.get(id);
  if (!it) return 'Unknown';
  if (!it.parentId) return it.name;
  return `${buildPath(it.parentId, map, depth + 1)} › ${it.name}`;
}

type Props = {
  item?: Item;
  defaultCatalogueId?: string;
  defaultParentId?: string;
  defaultCanContain?: boolean;
  onSave: () => void;
  onClose: () => void;
};

export default function ItemModal({ item, defaultCatalogueId, defaultParentId, defaultCanContain, onSave, onClose }: Props) {
  const isEdit = !!item;
  const [form, setForm] = useState<Form>(blank);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [specValues, setSpecValues] = useState<Record<string, string>>({});
  const catalogueRef = useRef<HTMLDivElement>(null);

  const { data: catalogues = [] } = useQuery({
    queryKey: ['catalogues'],
    queryFn: () => api.catalogues.list<Catalogue[]>(),
  });

  const { data: containers = [] } = useQuery({
    queryKey: ['containers'],
    queryFn: () => api.items.list<Item[]>({ canContain: 'true' }),
  });

  const containerMap = new Map(containers.map(c => [c.id, c]));
  const sortedContainers = [...containers].sort((a, b) =>
    buildPath(a.id, containerMap).localeCompare(buildPath(b.id, containerMap))
  );

  useEffect(() => {
    if (!catalogueOpen) return;
    function handle(e: MouseEvent) {
      if (!catalogueRef.current?.contains(e.target as Node)) setCatalogueOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [catalogueOpen]);

  useEffect(() => {
    if (item) {
      setForm({
        name:        item.name,
        itemNumber:  item.itemNumber != null ? String(item.itemNumber) : '',
        catalogueId: item.catalogueId ?? '',
        parentId:    item.parentId ?? '',
        canContain:  item.canContain,
        notes:       item.notes ?? '',
      });
      const initial: Record<string, string> = {};
      if (item.spec) {
        for (const [k, v] of Object.entries(item.spec)) {
          initial[k] = v != null ? String(v) : '';
        }
      }
      setSpecValues(initial);
    } else {
      setForm({ ...blank, catalogueId: defaultCatalogueId ?? '', parentId: defaultParentId ?? '', canContain: defaultCanContain ?? false });
      setSpecValues({});
    }
    setCatalogueOpen(false);
  }, [item, defaultCatalogueId, defaultParentId]);

  function set(k: keyof Form, v: string | boolean) {
    setForm(f => ({ ...f, [k]: v }));
    setError('');
  }

  async function save() {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (!form.canContain && !form.parentId) {
      setError('Select a container, or tick "Can contain other items" for a root item.');
      return;
    }
    let itemNumber: number | null = null;
    if (form.itemNumber.trim()) {
      itemNumber = parseInt(form.itemNumber.trim(), 10);
      if (isNaN(itemNumber) || itemNumber <= 0) { setError('Item number must be a positive integer.'); return; }
    }

    setSaving(true);
    setError('');
    try {
      const selectedCatalogue = catalogues.find(c => c.id === form.catalogueId);
      const specToSave: Record<string, string | number> = { ...(item?.spec as Record<string, string | number> ?? {}) };
      for (const field of selectedCatalogue?.fields ?? []) {
        const val = specValues[field.key] ?? '';
        if (val === '') {
          delete specToSave[field.key];
        } else {
          specToSave[field.key] = field.type === 'number' ? Number(val) : val;
        }
      }

      const data = {
        name:        form.name.trim(),
        itemNumber,
        catalogueId: form.catalogueId || null,
        parentId:    form.parentId    || null,
        canContain:  form.canContain,
        notes:       form.notes.trim() || null,
        spec:        Object.keys(specToSave).length > 0 ? specToSave : null,
        deviceId:    'web',
        synced:      false,
        lastModified: new Date().toISOString(),
      };
      if (isEdit && item) {
        await api.items.update(item.id, data);
      } else {
        await api.items.create(data);
      }
      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isEdit ? 'Edit Item' : 'Add Item'}
      onClose={onClose}
      wide
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {error && <p className="text-red-500 text-sm mb-4 p-2 bg-red-50 rounded-lg">{error}</p>}

      <div className="space-y-4">
        {/* Item # + Name */}
        <div className="flex gap-3">
          <div className="w-28 shrink-0">
            <label className="block text-xs font-medium text-gray-500 mb-1">Item #</label>
            <input value={form.itemNumber} onChange={e => set('itemNumber', e.target.value)}
              className="input" placeholder="166" inputMode="numeric" autoFocus={!isEdit} />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              className="input" placeholder="e.g. Kensington USB Hub" autoFocus={isEdit} />
          </div>
        </div>

        {/* Catalogue + Container */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Catalogue</label>
            <div ref={catalogueRef} className="relative">
              <button
                type="button"
                onClick={() => setCatalogueOpen(p => !p)}
                className="select flex items-center gap-2 text-left w-full"
              >
                {form.catalogueId ? (
                  <>
                    <IconRenderer value={catalogues.find(c => c.id === form.catalogueId)?.icon ?? null} size={16} />
                    <span className="flex-1 truncate">
                      {catalogues.find(c => c.id === form.catalogueId)?.name}
                    </span>
                  </>
                ) : (
                  <span className="flex-1 text-gray-400">— none —</span>
                )}
                <span className="text-gray-400 text-xs">▾</span>
              </button>
              {catalogueOpen && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => { set('catalogueId', ''); setCatalogueOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-gray-400"
                  >
                    — none —
                  </button>
                  {[...catalogues].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { set('catalogueId', c.id); setCatalogueOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left ${
                        form.catalogueId === c.id ? 'bg-blue-50 text-blue-600' : ''
                      }`}
                    >
                      <IconRenderer value={c.icon ?? null} size={16} />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Container</label>
            <select value={form.parentId} onChange={e => set('parentId', e.target.value)} className="select">
              <option value="">— none (root item) —</option>
              {sortedContainers
                .filter(c => !isEdit || c.id !== item?.id)
                .map(c => (
                  <option key={c.id} value={c.id}>{buildPath(c.id, containerMap)}</option>
                ))
              }
            </select>
          </div>
        </div>

        {/* Can contain */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={form.canContain}
            onChange={e => set('canContain', e.target.checked)}
            className="w-4 h-4 rounded accent-blue-500" />
          <span className="text-sm text-gray-700">Can contain other items</span>
        </label>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            className="input resize-none" rows={3} />
        </div>

        {/* Custom spec fields from the selected catalogue */}
        {(() => {
          const fields: FieldDef[] = catalogues.find(c => c.id === form.catalogueId)?.fields ?? [];
          if (fields.length === 0) return null;
          return (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Custom Fields</label>
              <div className="space-y-3">
                {fields.map(field => (
                  <div key={field.key}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{field.label}</label>
                    {field.type === 'textarea' ? (
                      <textarea
                        value={specValues[field.key] ?? ''}
                        onChange={e => setSpecValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                        className="input resize-none" rows={2}
                      />
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={specValues[field.key] ?? ''}
                        onChange={e => setSpecValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                        className="input"
                        inputMode={field.type === 'number' ? 'numeric' : undefined}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </Modal>
  );
}
