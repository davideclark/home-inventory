// Shared FieldDef type + helpers for per-catalogue custom spec fields.
// Single source of truth for the mobile app — screens must import from here
// rather than declaring their own local FieldDef copies.

export type FieldType = 'text' | 'number' | 'textarea' | 'currency';

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  showInList?: boolean;
  // Counts toward insurance valuation totals — at most one per catalogue
  // (enforced radio-style in the catalogue editors; aggregation uses the
  // first flagged field defensively).
  isValue?: boolean;
};

export function parseFields(json: string | null | undefined): FieldDef[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Tolerant money parser: accepts numbers or strings with £/commas/spaces
// (legacy values entered via MCP may be strings).
export function parseMoney(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[£,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function formatCurrency(n: number | null): string {
  if (n == null) return '';
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
  } catch {
    // Hermes builds without full Intl data
    return `£${n.toFixed(2)}`;
  }
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
