'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Modal from './Modal';
import IconRenderer from './IconRenderer';
import { api } from '../lib/api';
import { formatFieldValue } from '../lib/format';
import type { Item, Catalogue, FieldDef, ItemAttachment } from '../lib/types';

type Props = {
  item: Item;
  onClose: () => void;
  onEdit: () => void;
};

function buildPath(parentId: string | null | undefined, containerMap: Map<string, Item>): string {
  if (!parentId) return '';
  const parts: string[] = [];
  let id: string | null | undefined = parentId;
  while (id) {
    const c = containerMap.get(id);
    if (!c) break;
    parts.unshift(c.name);
    id = c.parentId;
  }
  return parts.join(' › ');
}

export default function ItemDetailModal({ item, onClose, onEdit }: Props) {
  const { data: catalogue } = useQuery<Catalogue>({
    queryKey: ['catalogue', item.catalogueId],
    queryFn: () => api.catalogues.get<Catalogue>(item.catalogueId!),
    enabled: !!item.catalogueId,
  });

  const { data: allContainers = [] } = useQuery<Item[]>({
    queryKey: ['containers'],
    queryFn: () => api.items.list<Item[]>({ canContain: 'true' }),
    enabled: !!item.parentId,
  });

  const { data: attachments = [] } = useQuery<ItemAttachment[]>({
    queryKey: ['attachments', item.id],
    queryFn: () => api.attachments.list<ItemAttachment[]>(item.id),
  });

  const [lightbox, setLightbox] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const containerMap = new Map(allContainers.map(c => [c.id, c]));
  const photos = attachments.filter(a => a.kind === 'photo');
  const documents = attachments.filter(a => a.kind === 'document');
  // Extra photos beyond the primary (which is already shown as the hero image)
  const extraPhotos = photos.slice(1);
  const specFields: FieldDef[] = catalogue?.fields ?? [];
  const specValues = item.spec ?? {};
  const locationPath = buildPath(item.parentId, containerMap);
  const filledSpecFields = specFields.filter(f => specValues[f.key] != null && specValues[f.key] !== '');
  const title = item.itemNumber != null
    ? `#${String(item.itemNumber).padStart(3, '0')} — ${item.name}`
    : item.name;

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Close</button>
          <button onClick={onEdit} className="btn-primary">Edit</button>
        </>
      }
    >
      {item.hasImage && (
        <div className="-mx-6 -mt-4 mb-5">
          <img
            src={api.images.url(item.id)}
            alt=""
            className="w-full max-h-64 object-cover cursor-zoom-in"
            onClick={() => setLightbox(true)}
          />
        </div>
      )}
      {(lightbox || lightboxUrl) && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center"
          onClick={() => { setLightbox(false); setLightboxUrl(null); }}
        >
          <img
            src={lightboxUrl ?? api.images.url(item.id)}
            alt=""
            className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      <div className="space-y-5">
        {(catalogue || filledSpecFields.length > 0) && (
          <div className="divide-y divide-gray-100">
            {catalogue && (
              <div className="flex justify-between items-center py-2 text-sm">
                <span className="text-gray-500">Catalogue</span>
                <span className="font-medium flex items-center gap-1.5">
                  <IconRenderer value={catalogue.icon ?? null} size={14} />
                  {catalogue.name}
                </span>
              </div>
            )}
            {filledSpecFields.map(field => (
              <div key={field.key} className="flex justify-between items-start py-2 text-sm gap-4">
                <span className="text-gray-500 shrink-0">{field.label}</span>
                <span className="font-medium text-right">{formatFieldValue(field, specValues[field.key])}</span>
              </div>
            ))}
          </div>
        )}

        {item.notes && (
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes</div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{item.notes}</p>
          </div>
        )}

        {(extraPhotos.length > 0 || documents.length > 0) && (
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Attachments</div>
            {extraPhotos.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {extraPhotos.map(a => (
                  <img
                    key={a.id}
                    src={api.attachments.url(a.id)}
                    alt={a.originalFilename}
                    className="w-16 h-16 rounded-lg object-cover border border-gray-200 cursor-zoom-in"
                    onClick={() => setLightboxUrl(api.attachments.url(a.id))}
                  />
                ))}
              </div>
            )}
            {documents.map(a => (
              <a
                key={a.id}
                href={api.attachments.url(a.id)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 py-1.5 text-sm text-blue-500 hover:underline"
              >
                📄 {a.originalFilename}
              </a>
            ))}
          </div>
        )}

        {locationPath && (
          <div className="flex justify-between items-start py-2 text-sm border-t border-gray-100 gap-4">
            <span className="text-gray-500 shrink-0">Location</span>
            <span className="font-medium text-right">{locationPath}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
