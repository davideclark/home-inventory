import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';
import Nav from '../components/Nav';
import Providers from './providers';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = { title: 'Home Inventory' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="min-h-screen bg-gray-100 font-sans">
        <Providers>
          <Nav />
          <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
