import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_COOKIE     = 'home-inventory-jwt';
const REFRESH_COOKIE = 'home-inventory-refresh';

function jwtSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? '');
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // No JWT_SECRET configured — dev mode, allow all
  if (!process.env.JWT_SECRET) return NextResponse.next();

  // Public paths
  if (pathname === '/login' || pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  const jwt = req.cookies.get(JWT_COOKIE)?.value;

  if (jwt) {
    try {
      const { payload } = await jwtVerify(jwt, jwtSecret(), {
        issuer: 'home-inventory-api',
        audience: 'home-inventory',
      });
      // Force password change — redirect to /change-password for page requests only
      if (payload['forcePasswordChange'] && !pathname.startsWith('/api/') && pathname !== '/change-password') {
        const url = req.nextUrl.clone();
        url.pathname = '/change-password';
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    } catch {
      // JWT invalid or expired — fall through to silent refresh
    }
  }

  // Silent refresh using the refresh token cookie
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    try {
      const apiUrl = process.env.API_URL ?? 'http://localhost:3000';
      const refreshRes = await fetch(`${apiUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (refreshRes.ok) {
        const { token } = await refreshRes.json();
        const res = NextResponse.next();
        res.cookies.set(JWT_COOKIE, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          maxAge: 60 * 15,
        });
        return res;
      }
    } catch {
      // Refresh failed — redirect to login
    }
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo-mark.svg).*)'],
};
