'use client';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Modal from './Modal';
import { api } from '../lib/api';
import type { Catalogue, Item } from '../lib/types';

const STATUSES = ['active', 'untested', 'tested', 'faulty', 'stored', 'sold', 'donated', 'lost'] as const;

type Form = {
  name: string;
  itemNumber: string;
  status: string;
  catalogueId: string;
  parentId: string;
  canContain: boolean;
  manufacturer: string;
  model: string;
  type: string;
  condition: string;
  colour: string;
  barcode: string;
  notes: string;
};

const blank: Form = {
  name: '', itemNumber: '', status: 'active', catalogueId: '', parentId: '',
  canContain: false, manufacturer: '', model: '', type: '',
  condition: '', colour: '', barcode: '', notes: '',
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
  onSave: () => void;
  onClose: () => void;
};

export default function ItemModal({ item, defaultCatalogueId, defaultParentId, onSave, onClose }: Props) {
  const isEdit = !!item;
  const [form, setForm] = useState<Form>(blank);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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
    if (item) {
      setForm({
        name:         item.name,
        itemNumber:   item.itemNumber != null ? String(item.itemNumber) : '',
        status:       item.status ?? 'active',
        catalogueId:  item.catalogueId ?? '',
        parentId:     item.parentId ?? '',
        canContain:   item.canContain,
        manufacturer: item.manufacturer ?? '',
        model:        item.model ?? '',
        type:         item.type ?? '',
        condition:    item.condition ?? '',
        colour:       item.colour ?? '',
        barcode:      item.barcode ?? '',
        notes:        item.notes ?? '',
      });
    } else {
      setForm({ ...blank, catalogueId: defaultCatalogueId ?? '', parentId: defaultParentId ?? '' });
    }
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
      const data = {
        name:         form.name.trim(),
        itemNumber,
        status:       form.status,
        catalogueId:  form.catalogueId || null,
        parentId:     form.parentId    || null,
        canContain:   form.canContain,
        manufacturer: form.manufacturer.trim() || null,
        model:        form.model.trim()        || null,
        type:         form.type.trim()         || null,
        condition:    form.condition.trim()     || null,
        colour:       form.colour.trim()        || null,
        barcode:      form.barcode.trim()       || null,
        notes:        form.notes.trim()         || null,
        deviceId:     'web',
        synced:       false,
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

        {/* Status chips */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">Status</label>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map(s => (
              <button key={s} type="button" onClick={() => set('status', s)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  form.status === s
                    ? 'bg-blue-500 border-blue-500 text-white'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >{s}</button>
            ))}
          </div>
        </div>

        {/* Catalogue + Container */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Catalogue</label>
            <select value={form.catalogueId} onChange={e => set('catalogueId', e.target.value)} className="select">
              <option value="">— none —</option>
              {[...catalogues].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                <option key={c.id} value={c.id}>{c.icon && !c.icon.startsWith('si:') && !c.icon.startsWith('svg:') ? `${c.icon} ` : ''}{c.name}</option>
              ))}
            </select>
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

        {/* Manufacturer / Model / Type */}
        <div className="grid grid-cols-3 gap-3">
          {(['manufacturer', 'model', 'type'] as const).map(k => (
            <div key={k}>
              <label className="block text-xs font-medium text-gray-500 mb-1 capitalize">{k}</label>
              <input value={form[k]} onChange={e => set(k, e.target.value)} className="input" />
            </div>
          ))}
        </div>

        {/* Condition / Colour / Barcode */}
        <div className="grid grid-cols-3 gap-3">
          {(['condition', 'colour', 'barcode'] as const).map(k => (
            <div key={k}>
              <label className="block text-xs font-medium text-gray-500 mb-1 capitalize">{k}</label>
              <input value={form[k]} onChange={e => set(k, e.target.value)} className="input" />
            </div>
          ))}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            className="input resize-none" rows={3} />
        </div>
      </div>
    </Modal>
  );
}
