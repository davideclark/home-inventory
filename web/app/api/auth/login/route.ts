import { type NextRequest, NextResponse } from 'next/server';

const JWT_COOKIE     = 'home-inventory-jwt';
const REFRESH_COOKIE = 'home-inventory-refresh';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const apiUrl = process.env.API_URL ?? 'http://localhost:3000';

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? '';

  const upstream = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(clientIp ? { 'X-Forwarded-For': clientIp } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await upstream.json();

  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  const { token, refreshToken } = data;
  const secure = process.env.SECURE_COOKIES === 'true';
  const res = NextResponse.json({ ok: true });

  res.cookies.set(JWT_COOKIE, token, {
    httpOnly: true, secure, sameSite: 'lax', path: '/',
    maxAge: 60 * 15,
  });
  res.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true, secure, sameSite: 'lax', path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return res;
}
