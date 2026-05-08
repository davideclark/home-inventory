import { type NextRequest, NextResponse } from 'next/server';

const API_URL   = process.env.API_URL   ?? 'http://localhost:3000';
const API_TOKEN = process.env.API_TOKEN ?? '';

const authHeader: HeadersInit = API_TOKEN ? { 'X-API-Token': API_TOKEN } : {};

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const search = new URL(req.url).search;
  const target = `${API_URL}/api/${path.join('/')}${search}`;
  const body   = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined;

  const upstream = await fetch(target, {
    method:  req.method,
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body,
  });

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
