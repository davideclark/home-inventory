import { NextRequest, NextResponse } from 'next/server';

const COOKIE = 'home-inventory-auth';

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const expected = process.env.WEB_PASSWORD ?? '';
  const secret = process.env.SESSION_SECRET ?? '';
  if (!expected || password !== expected) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, secret, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
