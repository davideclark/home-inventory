'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';

const links = [
  { href: '/catalogues', label: 'Catalogues' },
  { href: '/containers', label: 'Browse' },
  { href: '/search',     label: 'Search' },
  { href: '/settings',   label: 'Settings' },
];

export default function Nav() {
  const path = usePathname();
  const router = useRouter();

  if (path === '/login') return null;

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <nav className="bg-primary text-white px-6 py-3 flex items-center gap-2">
      <Link href="/catalogues" className="flex items-center gap-2 font-semibold text-base mr-4 hover:opacity-90 transition-opacity">
        <Image src="/logo-mark.svg" alt="" width={22} height={22} className="brightness-0 invert" />
        Home Inventory
      </Link>
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
      <button
        onClick={handleSignOut}
        className="ml-auto text-sm font-medium px-3 py-1.5 rounded transition-colors hover:bg-white/15"
      >
        Sign out
      </button>
    </nav>
  );
}
