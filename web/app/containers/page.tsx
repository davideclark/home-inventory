'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '../../lib/api';
import type { Item } from '../../lib/types';

export default function ContainersPage() {
  const { data: allContainers = [], isLoading } = useQuery({
    queryKey: ['containers'],
    queryFn: () => api.items.list<Item[]>({ canContain: 'true' }),
  });

  const roots = [...allContainers]
    .filter(c => !c.parentId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const childCount = (id: string) => allContainers.filter(c => c.parentId === id).length;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Containers</h1>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : roots.length === 0 ? (
        <p className="text-gray-400 text-sm">No containers found.</p>
      ) : (
        <div className="card divide-y divide-gray-100">
          {roots.map(c => (
            <Link key={c.id} href={`/containers/${c.id}`}
              className="flex items-center px-4 py-3 gap-3 hover:bg-gray-50 group"
            >
              <span className="text-xl">📦</span>
              <div className="flex-1">
                <div className="font-medium text-sm">{c.name}</div>
                {childCount(c.id) > 0 && (
                  <div className="text-xs text-gray-400">{childCount(c.id)} sub-containers</div>
                )}
              </div>
              <span className="text-gray-300 group-hover:text-gray-400">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
