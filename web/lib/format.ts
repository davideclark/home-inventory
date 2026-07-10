import type { FieldDef } from './types';

// Tolerant money parser: accepts numbers or strings with £/commas/spaces
// (legacy values entered via MCP may be strings).
export function parseMoney(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[£,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

export function formatCurrency(n: number | null): string {
  return n == null ? '' : gbp.format(n);
}

// Display helper for a spec value according to its field definition.
export function formatFieldValue(field: FieldDef, v: unknown): string {
  if (v == null || v === '') return '';
  if (field.type === 'currency') {
    const n = parseMoney(v);
    return n != null ? formatCurrency(n) : String(v);
  }
  return String(v);
}
