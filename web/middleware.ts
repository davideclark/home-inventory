import { NextRequest, NextResponse } from 'next/server';

const COOKIE = 'home-inventory-auth';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/login' || pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }
  const token = req.cookies.get(COOKIE)?.value;
  const secret = process.env.SESSION_SECRET ?? '';
  if (secret && token === secret) return NextResponse.next();
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo-mark.svg).*)'],
};
