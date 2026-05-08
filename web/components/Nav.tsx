'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/catalogues', label: 'Catalogues' },
  { href: '/containers', label: 'Containers' },
  { href: '/search',     label: 'Search' },
  { href: '/settings',   label: 'Settings' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="bg-blue-500 text-white px-6 py-3 flex items-center gap-2">
      <span className="font-semibold text-base mr-4">Home Inventory</span>
      {links.map(l => (
        <Link
          key={l.href}
          href={l.href}
          className={`text-sm font-medium px-3 py-1.5 rounded transition-colors ${
            path.startsWith(l.href) ? 'bg-white/25' : 'hover:bg-white/15'
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
