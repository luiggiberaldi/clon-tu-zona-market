import { getRates } from '@/lib/rates';
import { endpoint, json, HttpError } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export function GET(request: Request) {
  return endpoint(async () => {
    const forceRefresh = new URL(request.url).searchParams.get('refresh') === '1';
    try {
      const { payload, cacheStatus } = await getRates(forceRefresh);
      return json(payload, 200, {
        'X-Rate-Source': payload.source,
        'X-Rate-Cache': cacheStatus,
        ...(payload.officialDate ? { 'X-Rate-Official-Date': payload.officialDate } : {}),
      });
    } catch (error) {
      throw new HttpError(503, `No se pudo obtener la tasa BCV: ${error instanceof Error ? error.message : 'fuente no disponible'}`);
    }
  });
}
