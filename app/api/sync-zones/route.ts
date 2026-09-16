import { syncZonesToSupabase } from '@/lib/zones-sync';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';
  const result = await syncZonesToSupabase(force);
  return Response.json(result, { status: result.success ? 200 : 500 });
}

export async function POST() {
  const result = await syncZonesToSupabase(true);
  return Response.json(result, { status: result.success ? 200 : 500 });
}
