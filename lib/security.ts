import { isDemoMode } from '@/lib/config';

/** Next's Node adapter may reconstruct a loopback URL as localhost while preserving Host. */
export function localRequestOrigin(request: Request): string | null {
  if (!isDemoMode()) return null;
  try {
    const target = new URL(request.url);
    const loopback = ['localhost', '127.0.0.1', '[::1]'];
    if (!loopback.includes(target.hostname) || !['http:', 'https:'].includes(target.protocol)) return null;
    const authority = request.headers.get('host');
    if (!authority) return target.origin;
    if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/i.test(authority)) return null;
    const host = new URL(target.protocol + '//' + authority);
    if (host.port !== target.port) return null;
    return host.origin;
  } catch { return null; }
}

export function safeRedirect(value: string | null | undefined, fallback = '/carabobo'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return fallback;
  try {
    const base = new URL('https://store.invalid');
    const target = new URL(value, base);
    if (target.origin !== base.origin) return fallback;
    return target.pathname + target.search + target.hash;
  } catch { return fallback; }
}

export function validOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') return false;
  if (!origin) return fetchSite !== 'cross-site';
  try {
    const expected = isDemoMode() ? localRequestOrigin(request) : new URL(request.url).origin;
    return expected !== null && new URL(origin).origin === expected;
  } catch { return false; }
}
