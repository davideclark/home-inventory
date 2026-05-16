import { type NextRequest, NextResponse } from 'next/server';

const API_URL   = process.env.API_URL   ?? 'http://localhost:3000';
const API_TOKEN = process.env.API_TOKEN ?? '';

const authHeader: HeadersInit = API_TOKEN ? { 'X-API-Token': API_TOKEN } : {};

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const search = new URL(req.url).search;
  const target = `${API_URL}/api/${path.join('/')}${search}`;
  const contentType = req.headers.get('content-type') ?? '';
  const isMultipart = contentType.includes('multipart/form-data');

  let body: BodyInit | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = isMultipart ? await req.arrayBuffer() : await req.text();
  }

  const headers: Record<string, string> = { ...authHeader as Record<string, string> };
  if (isMultipart) {
    headers['Content-Type'] = contentType;
  } else {
    headers['Content-Type'] = 'application/json';
  }

  const upstream = await fetch(target, { method: req.method, headers, body });

  if (isMultipart || upstream.headers.get('content-type')?.includes('image/') || upstream.headers.get('content-type')?.includes('application/zip')) {
    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream' },
    });
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
