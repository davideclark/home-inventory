import type { Metadata } from 'next';
import './globals.css';
import Nav from '../components/Nav';
import Providers from './providers';

export const metadata: Metadata = { title: 'Home Inventory' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-100">
        <Providers>
          <Nav />
          <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
