import { type NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('home-inventory-refresh')?.value;

  if (refreshToken) {
    const apiUrl = process.env.API_URL ?? 'http://localhost:3000';
    await fetch(`${apiUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {/* ignore errors — still clear cookies */});
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('home-inventory-jwt',     '', { maxAge: 0, path: '/' });
  res.cookies.set('home-inventory-refresh', '', { maxAge: 0, path: '/' });
  return res;
}
