export type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'textarea';
};

export type Catalogue = {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  sortOrder: number | null;
  fields: FieldDef[] | null;
  createdAt: string;
  lastModified: string;
  deviceId: string;
  synced: boolean;
};

export type Item = {
  id: string;
  itemNumber: number | null;
  catalogueId: string | null;
  parentId: string | null;
  name: string;
  status: string | null;
  notes: string | null;
  manufacturer: string | null;
  model: string | null;
  type: string | null;
  condition: string | null;
  colour: string | null;
  barcode: string | null;
  canContain: boolean;
  spec: Record<string, unknown> | null;
  createdAt: string;
  lastModified: string;
  deviceId: string;
  synced: boolean;
};
