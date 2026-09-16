import 'server-only';
import { parseLocalizedNumber, extractBcvRate, averageTop3, officialRateFromPayload } from '@/lib/rates-parse';

/**
 * Tasas de cambio en tiempo real — adaptado del sistema de referencia
 * (listo-pos-cotizaciones · api/handlers/rates.js).
 *
 * Fuentes oficiales en orden de preferencia:
 *   1. HTML directo de bcv.org.ve (scrapeo con User-Agent de navegador).
 *   2. CDN que replica la publicación diaria del BCV (DolarVZLA).
 *   3. DolarAPI ve (último recurso; puede quedar un día atrás).
 * Además: USDT Binance P2P Venezuela vía CriptoYa.
 *
 * Cache interno de 10 minutos; si todas las fuentes fallan, se sirve la
 * última tasa conocida marcada `stale: true` en lugar de un error duro.
 */

const CACHE_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const BCV_URL = 'https://www.bcv.org.ve/';
// CDN público que replica la publicación diaria del BCV. Se usa solo si el
// servidor del BCV rechaza la conexión (TLS o protección anti-bot).
const BCV_CDN_URL = 'https://rates.dolarvzla.com/bcv/current.json';
const DOLAR_API_URLS = {
  usd: ['https://ve.dolarapi.com/v1/dolares/oficial', 'https://ve.dolarapi.com/v1/dolares'],
  eur: ['https://ve.dolarapi.com/v1/euros/oficial', 'https://ve.dolarapi.com/v1/euros'],
} as const;
const USDT_URL = 'https://criptoya.com/api/binancep2p/USDT/VES/1';
const BCV_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface RateSources {
  usd: number;
  eur: number;
  source: string;
  officialDate?: string | null;
  lastUpdate?: string;
  stale?: boolean;
}
export interface UsdtRate { precio: number; fuente: string }
export interface RatesPayload {
  source: string;
  bcv: { price: number; source: string; change: 0 };
  euro: { price: number; source: string; change: 0 };
  usdt: UsdtRate | null;
  lastUpdate: string;
  officialDate?: string;
  stale?: boolean;
}

interface CacheEntry { rates: RateSources; usdt: UsdtRate | null; at: number }
let cache: CacheEntry | null = null;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return null;
    return response;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBcvDirect(): Promise<RateSources> {
  // El querystring evita caches intermedios y el User-Agent reproduce la
  // consulta que funciona en el proyecto de referencia.
  const response = await fetchWithTimeout(`${BCV_URL}?_=${Date.now()}`, {
    headers: {
      'User-Agent': BCV_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-VE,es;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });
  if (!response) throw new Error('BCV no respondió correctamente');
  const html = await response.text();
  const usd = extractBcvRate(html, 'dolar');
  const eur = extractBcvRate(html, 'euro');
  if (usd <= 0 || eur <= 0) throw new Error('No se encontraron USD/EUR en la página del BCV');
  return { usd, eur, source: 'BCV Directo' };
}

async function fetchBcvCdn(): Promise<RateSources> {
  const response = await fetchWithTimeout(`${BCV_CDN_URL}?_=${Date.now()}`, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  }, 8000);
  if (!response) throw new Error('CDN BCV no respondió correctamente');
  const payload = await response.json() as { current?: { usd?: unknown; eur?: unknown; date?: unknown } };
  const current = payload?.current;
  const usd = parseLocalizedNumber(current?.usd);
  const eur = parseLocalizedNumber(current?.eur);
  if (usd <= 0 || eur <= 0 || typeof current?.date !== 'string') {
    throw new Error('CDN BCV no publicó USD/EUR vigentes');
  }
  return { usd, eur, source: 'BCV CDN (DolarVZLA)', officialDate: current.date };
}

function officialRate(payload: unknown): { price: number; officialDate: string | null } {
  return officialRateFromPayload(payload);
}

async function fetchDolarApiRate(urls: readonly string[]): Promise<{ price: number; officialDate: string | null }> {
  for (const url of urls) {
    const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 8000);
    if (!response) continue;
    try {
      const rate = officialRate(await response.json());
      if (rate.price > 0) return rate;
    } catch { /* intenta la siguiente variante */ }
  }
  return { price: 0, officialDate: null };
}

async function fetchDolarApiOfficial(): Promise<RateSources> {
  const [usd, eur] = await Promise.all([
    fetchDolarApiRate(DOLAR_API_URLS.usd),
    fetchDolarApiRate(DOLAR_API_URLS.eur),
  ]);
  if (usd.price <= 0 || eur.price <= 0) throw new Error('DolarAPI no devolvió USD/EUR oficiales');
  return {
    usd: usd.price,
    eur: eur.price,
    source: 'DolarAPI Oficial (último recurso)',
    officialDate: usd.officialDate || eur.officialDate || null,
  };
}

/** Promedio ask/bid de Binance P2P Venezuela (misma lógica del sistema de referencia). */
export async function fetchUsdtRate(): Promise<UsdtRate | null> {
  const response = await fetchWithTimeout(USDT_URL, { headers: { Accept: 'application/json' } });
  if (!response) return null;
  let result: { ask?: unknown; bid?: unknown };
  try { result = await response.json(); } catch { return null; }
  const average = averageTop3;
  const avgAsk = average(result?.ask);
  const avgBid = average(result?.bid);
  if (avgAsk <= 0 && avgBid <= 0) return null;
  const precio = avgAsk > 0 && avgBid > 0 ? (avgAsk + avgBid) / 2 : (avgAsk || avgBid);
  return { precio, fuente: 'Binance P2P' };
}

async function resolveOfficialRates(): Promise<RateSources> {
  const sources: Array<{ name: string; fetch: () => Promise<RateSources> }> = [
    { name: 'BCV directo', fetch: fetchBcvDirect },
    { name: 'BCV CDN', fetch: fetchBcvCdn },
    { name: 'DolarAPI', fetch: fetchDolarApiOfficial },
  ];
  let lastError: unknown = null;
  for (const source of sources) {
    try {
      const candidate = await source.fetch();
      if (candidate) return candidate;
    } catch (error) {
      lastError = error;
      console.warn('[RATES]', source.name, 'falló');
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No hay una fuente BCV disponible');
}

export function buildRatesPayload(entry: CacheEntry, stale = false): RatesPayload {
  const { rates, usdt } = entry;
  return {
    source: rates.source,
    bcv: { price: rates.usd, source: `${rates.source} (USD)`, change: 0 },
    euro: { price: rates.eur, source: `${rates.source} (EUR)`, change: 0 },
    usdt,
    lastUpdate: rates.lastUpdate || new Date().toISOString(),
    ...(rates.officialDate ? { officialDate: rates.officialDate } : {}),
    ...(stale ? { stale: true } : {}),
  };
}

/** Cache solo-lectura para otros módulos del servidor (sincronización con la BD). */
export function getCachedRates(): CacheEntry | null {
  return cache;
}

export async function getRates(forceRefresh = false): Promise<{ payload: RatesPayload; cacheStatus: 'HIT' | 'MISS' | 'STALE' }> {
  if (cache && !forceRefresh && Date.now() - cache.at < CACHE_MS) {
    return { payload: buildRatesPayload(cache), cacheStatus: 'HIT' };
  }
  try {
    const [rates, usdt] = await Promise.all([resolveOfficialRates(), fetchUsdtRate()]);
    cache = { rates: { ...rates, lastUpdate: new Date().toISOString() }, usdt, at: Date.now() };
    return { payload: buildRatesPayload(cache), cacheStatus: 'MISS' };
  } catch (error) {
    if (cache) return { payload: buildRatesPayload(cache, true), cacheStatus: 'STALE' };
    throw error;
  }
}
