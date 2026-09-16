const envStoreName = process.env.NEXT_PUBLIC_STORE_NAME?.trim();
const resolvedStoreName = !envStoreName || envStoreName === 'Mercado Cercano' ? 'Todo Market' : envStoreName;
const envShortName = process.env.NEXT_PUBLIC_STORE_SHORT_NAME?.trim();
const resolvedShortName = !envShortName || envShortName === 'Cercano' ? 'TodoMarket' : envShortName;

export const storeConfig = {
  name: resolvedStoreName,
  shortName: resolvedShortName,
  description: 'Tu supermercado en un solo lugar.',
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || '',
  phone: process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() || '',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000',
  defaultRegion: 'Carabobo',
  locale: 'es-VE',
  timezone: 'America/Caracas'
} as const;

/** Deliberate, local-only showcase. Never inferred from missing credentials. */
export function isDemoMode(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}

export function hasSupabaseConfig(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return Boolean(/^https?:\/\//.test(url) && key && !/^(your|example|placeholder|xxx)/i.test(key));
}
