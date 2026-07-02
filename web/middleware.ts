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
  if (pathname === '/login' || pathname === '/change-password' || pathname.startsWith('/api/auth/')) {
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
        const { token, refreshToken: newRefreshToken } = await refreshRes.json();
        const secure = process.env.SECURE_COOKIES === 'true';

        // Check forcePasswordChange on the refreshed token
        try {
          const { payload: newPayload } = await jwtVerify(token, jwtSecret(), {
            issuer: 'home-inventory-api',
            audience: 'home-inventory',
          });
          if (newPayload['forcePasswordChange'] && !pathname.startsWith('/api/') && pathname !== '/change-password') {
            const url = req.nextUrl.clone();
            url.pathname = '/change-password';
            const redirect = NextResponse.redirect(url);
            redirect.cookies.set(JWT_COOKIE, token, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: 60 * 15 });
            if (newRefreshToken) redirect.cookies.set(REFRESH_COOKIE, newRefreshToken, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 30 });
            return redirect;
          }
        } catch { /* verification failure — still allow through with new token */ }

        // Pass the refreshed JWT to the route handler via a request header,
        // since req.cookies in the handler still sees the old (expired) cookie.
        const requestHeaders = new Headers(req.headers);
        requestHeaders.set('x-refreshed-jwt', token);
        const res = NextResponse.next({ request: { headers: requestHeaders } });
        res.cookies.set(JWT_COOKIE, token, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: 60 * 15 });
        if (newRefreshToken) res.cookies.set(REFRESH_COOKIE, newRefreshToken, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 30 });
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
