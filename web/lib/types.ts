export type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'textarea';
  showInList?: boolean;
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
  notes: string | null;
  canContain: boolean;
  spec: Record<string, unknown> | null;
  createdAt: string;
  lastModified: string;
  deviceId: string;
  synced: boolean;
};
