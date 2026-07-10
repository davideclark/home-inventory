'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import IconRenderer from '../../components/IconRenderer';
import { api } from '../../lib/api';
import { parseMoney, formatCurrency } from '../../lib/format';
import type { Item, Catalogue } from '../../lib/types';

const COVERAGE_KEY = 'valuation-coverage-gbp';
const NO_LOCATION = '— No location —';

function buildPath(parentId: string | null | undefined, map: Map<string, Item>): string {
  if (!parentId) return '';
  const parts: string[] = [];
  let id: string | null | undefined = parentId;
  let depth = 0;
  while (id && depth < 20) {
    const c = map.get(id);
    if (!c) break;
    parts.unshift(c.name);
    id = c.parentId;
    depth++;
  }
  return parts.join(' › ');
}

// The "room" is the ancestor one level below the root of the hierarchy
// (e.g. Clarence Road → Games Room → Shelf 3 → item ⇒ Games Room).
// Items parented directly at a root use the root itself.
function roomOf(it: Item, map: Map<string, Item>): string {
  if (!it.parentId) return NO_LOCATION;
  const chain: Item[] = [];
  let cur = map.get(it.parentId);
  let depth = 0;
  while (cur && depth < 20) {
    chain.push(cur);
    cur = cur.parentId ? map.get(cur.parentId) : undefined;
    depth++;
  }
  if (chain.length === 0) return NO_LOCATION;
  const room = chain.length >= 2 ? chain[chain.length - 2] : chain[chain.length - 1];
  return room.name;
}

function csvEscape(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export default function ValuationPage() {
  const { data: catalogues = [] } = useQuery({
    queryKey: ['catalogues'],
    queryFn: () => api.catalogues.list<Catalogue[]>(),
  });

  const { data: allItems = [], isLoading } = useQuery({
    queryKey: ['items-by-parent'],
    queryFn: () => api.items.list<Item[]>(),
  });

  const [coverage, setCoverage] = useState('');
  useEffect(() => {
    const v = localStorage.getItem(COVERAGE_KEY);
    if (v) setCoverage(v);
  }, []);
  function onCoverageChange(v: string) {
    setCoverage(v);
    localStorage.setItem(COVERAGE_KEY, v);
  }

  const itemMap = useMemo(() => new Map(allItems.map(i => [i.id, i])), [allItems]);
  const catalogueMap = useMemo(() => new Map(catalogues.map(c => [c.id, c])), [catalogues]);

  // catalogueId → spec key of the field flagged isValue (at most one per catalogue)
  const valueKeyByCatalogue = useMemo(() => {
    const m = new Map<string, string>();
    catalogues.forEach(c => {
      const f = c.fields?.find(fl => fl.isValue);
      if (f) m.set(c.id, f.key);
    });
    return m;
  }, [catalogues]);

  function itemValue(it: Item): number | null {
    if (!it.catalogueId) return null;
    const key = valueKeyByCatalogue.get(it.catalogueId);
    if (!key) return null;
    return parseMoney(it.spec?.[key]);
  }

  // Per-catalogue totals
  const catalogueRows = catalogues
    .map(c => {
      const items = allItems.filter(i => i.catalogueId === c.id);
      let total = 0, valued = 0;
      items.forEach(i => {
        const v = itemValue(i);
        if (v != null) { total += v; valued++; }
      });
      return { cat: c, count: items.length, valued, total, hasValueField: valueKeyByCatalogue.has(c.id) };
    })
    .filter(r => r.count > 0)
    .sort((a, b) => b.total - a.total || a.cat.name.localeCompare(b.cat.name));

  // Per-room totals (valued items only)
  const roomRows = useMemo(() => {
    const m = new Map<string, { total: number; valued: number }>();
    allItems.forEach(it => {
      if (!it.catalogueId) return;
      const key = valueKeyByCatalogue.get(it.catalogueId);
      if (!key) return;
      const v = parseMoney(it.spec?.[key]);
      if (v == null) return;
      const room = roomOf(it, itemMap);
      const entry = m.get(room) ?? { total: 0, valued: 0 };
      entry.total += v;
      entry.valued++;
      m.set(room, entry);
    });
    return [...m.entries()]
      .map(([room, e]) => ({ room, ...e }))
      .sort((a, b) => b.total - a.total || a.room.localeCompare(b.room));
  }, [allItems, itemMap, valueKeyByCatalogue]);

  const grandTotal = catalogueRows.reduce((s, r) => s + r.total, 0);
  const valuedCount = catalogueRows.reduce((s, r) => s + r.valued, 0);
  const cataloguedCount = catalogueRows.reduce((s, r) => s + r.count, 0);

  const coverageNum = parseMoney(coverage);
  const delta = coverageNum != null ? coverageNum - grandTotal : null;

  function exportCsv() {
    const header = ['Item #', 'Name', 'Catalogue', 'Location', 'Value', 'Notes', 'Has Image'];
    const rows = [...allItems]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(it => {
        const v = itemValue(it);
        return [
          it.itemNumber != null ? String(it.itemNumber) : '',
          it.name,
          it.catalogueId ? catalogueMap.get(it.catalogueId)?.name ?? '' : '',
          buildPath(it.parentId, itemMap),
          v != null ? String(v) : '',
          it.notes ?? '',
          it.hasImage ? 'Yes' : 'No',
        ].map(csvEscape).join(',');
      });
    const csv = '﻿' + [header.join(','), ...rows].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'home-inventory-valuation.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Valuation</h1>
        <button onClick={exportCsv} className="btn-primary">Export CSV</button>
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : (
        <div className="space-y-6">
          {/* Summary tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total value</div>
              <div className="text-2xl font-semibold mt-1">{formatCurrency(grandTotal)}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Items valued</div>
              <div className="text-2xl font-semibold mt-1">{valuedCount}</div>
              <div className="text-xs text-gray-400 mt-0.5">of {cataloguedCount} catalogued items</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Insurance coverage</div>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">£</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={coverage}
                  onChange={e => onCoverageChange(e.target.value)}
                  className="input pl-7"
                  placeholder="e.g. 50,000"
                />
              </div>
              {delta != null && (
                <div className={`text-sm font-medium mt-2 ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {delta >= 0
                    ? `Headroom: ${formatCurrency(delta)}`
                    : `Under-insured by ${formatCurrency(-delta)}`}
                </div>
              )}
            </div>
          </div>

          {/* By catalogue */}
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">By Catalogue</h2>
            {catalogueRows.length === 0 ? (
              <p className="text-gray-400 text-sm">
                No catalogued items yet. Add a currency field with &quot;Counts toward valuation&quot; to a catalogue to start tracking values.
              </p>
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-400 font-medium">
                      <th className="px-4 py-3">Catalogue</th>
                      <th className="px-4 py-3">Items valued</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {catalogueRows.map(r => (
                      <tr key={r.cat.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">
                          <span className="flex items-center gap-1.5">
                            <IconRenderer value={r.cat.icon ?? null} size={14} />
                            {r.cat.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {r.hasValueField
                            ? `${r.valued} of ${r.count}`
                            : <span className="text-gray-300">no value field</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {r.hasValueField ? formatCurrency(r.total) : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* By room */}
          {roomRows.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">By Room</h2>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-400 font-medium">
                      <th className="px-4 py-3">Room</th>
                      <th className="px-4 py-3">Items valued</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {roomRows.map(r => (
                      <tr key={r.room} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{r.room}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{r.valued}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrency(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
