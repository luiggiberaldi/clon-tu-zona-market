import { NextRequest, NextResponse } from 'next/server';

interface Bucket {
  count: number;
  firstHit: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

export function rateLimit(req: NextRequest): NextResponse | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket) {
    buckets.set(ip, { count: 1, firstHit: now });
    return null;
  }

  if (now - bucket.firstHit > WINDOW_MS) {
    buckets.set(ip, { count: 1, firstHit: now });
    return null;
  }

  bucket.count += 1;
  if (bucket.count > MAX_REQUESTS) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Intenta en un minuto.' },
      { status: 429 }
    );
  }
  return null;
}
