export type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'currency';
  showInList?: boolean;
  // Counts toward insurance valuation totals — at most one per catalogue
  isValue?: boolean;
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

export type ItemAttachment = {
  id: string;
  itemId: string;
  kind: 'photo' | 'document';
  originalFilename: string;
  mimeType: string;
  size: number;
  isPrimary: boolean;
  createdAt: string;
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
  hasImage: boolean;
  createdAt: string;
  lastModified: string;
  deviceId: string;
  synced: boolean;
};
