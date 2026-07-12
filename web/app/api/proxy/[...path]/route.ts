import { type NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const search = new URL(req.url).search;
  const target = `${API_URL}/api/${path.join('/')}${search}`;
  const contentType = req.headers.get('content-type') ?? '';
  const isMultipart = contentType.includes('multipart/form-data');

  let body: BodyInit | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = isMultipart ? await req.arrayBuffer() : await req.text();
  }

  // Prefer the JWT the middleware just refreshed (passed as a request header)
  // over the old cookie, which may be expired within this same request cycle.
  const jwt = req.headers.get('x-refreshed-jwt') ?? req.cookies.get('home-inventory-jwt')?.value;
  const headers: Record<string, string> = jwt ? { 'Authorization': `Bearer ${jwt}` } : {};

  // Forward the real client IP so the API can rate-limit per user. Use x-real-ip
  // (set/overwritten by the Synology reverse proxy, so not client-spoofable) and
  // fall back to the *last* X-Forwarded-For hop (added by the trusted proxy) —
  // never the client-controllable leftmost entry. Forward as a single clean value.
  const clientIp = req.headers.get('x-real-ip')?.trim()
    || req.headers.get('x-forwarded-for')?.split(',').pop()?.trim()
    || '';
  if (clientIp) {
    headers['X-Forwarded-For'] = clientIp;
    headers['X-Real-IP'] = clientIp;
  }

  if (isMultipart) {
    headers['Content-Type'] = contentType;
  } else {
    headers['Content-Type'] = 'application/json';
  }

  const upstream = await fetch(target, { method: req.method, headers, body });

  // Pass anything that isn't JSON through as binary (images, PDFs, ZIPs, …) —
  // reading it as text corrupts it.
  const upstreamType = upstream.headers.get('content-type') ?? '';
  if (isMultipart || (upstreamType && !upstreamType.includes('application/json') && !upstreamType.includes('text/'))) {
    const buf = await upstream.arrayBuffer();
    const responseHeaders: Record<string, string> = { 'Content-Type': upstreamType || 'application/octet-stream' };
    const disposition = upstream.headers.get('content-disposition');
    if (disposition) responseHeaders['Content-Disposition'] = disposition;
    return new NextResponse(buf, { status: upstream.status, headers: responseHeaders });
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status:  upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: Ctx)    { return proxy(req, (await params).path); }
export async function POST(req: NextRequest, { params }: Ctx)   { return proxy(req, (await params).path); }
export async function PUT(req: NextRequest, { params }: Ctx)    { return proxy(req, (await params).path); }
export async function DELETE(req: NextRequest, { params }: Ctx) { return proxy(req, (await params).path); }
