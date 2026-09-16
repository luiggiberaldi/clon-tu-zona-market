import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/server';
import { getRates } from '@/lib/rates';
import { isDemoMode, hasSupabaseConfig } from '@/lib/config';

/**
 * Sincroniza la tasa oficial publicada en `settings.exchange_rate` con la
 * tasa BCV en vivo. Copia la filosofía del sistema de referencia: la tasa
 * automática siempre proviene de una fuente confirmada; la tasa manual del
 * comercio nunca se sobrescribe.
 *
 * - Se omite en modo demo y sin Supabase configurado.
 * - Escriben la tasa solo el service-role (cron interno) y el admin (panel),
 *   igual que hoy; el público sigue leyéndola vía RLS.
 * - Idempotente: si la fuente está caída y el último valor tiene menos de
 *   24 h, la cotización del checkout sigue funcionando sin cambios.
 */

const RATE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // igual que la validación SQL de quote_order

export interface SyncResult {
  skipped?: 'demo' | 'no-config' | 'manual' | 'fresh';
  updated?: boolean;
  rate?: number;
  source?: string;
  reason?: string;
}

export async function syncExchangeRateFromBcv(force = false): Promise<SyncResult> {
  if (isDemoMode()) return { skipped: 'demo' };
  if (!hasSupabaseConfig() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { skipped: 'no-config' };

  const admin = createAdminSupabase();
  const current = await admin.from('settings').select('value').eq('key', 'exchange_rate').maybeSingle();
  if (current.error) return { skipped: 'no-config', reason: 'No se pudo leer la tasa publicada.' };
  const value = current.data?.value as { usd_to_ves?: number; manual?: boolean; updated_at?: string } | null;

  // La tasa fijada manualmente por el comercio manda: no se sobrescribe.
  if (value?.manual === true) return { skipped: 'manual' };

  const age = value?.updated_at ? Date.now() - Date.parse(value.updated_at) : Infinity;
  if (!force && Number.isFinite(age) && age >= 0 && age < 60 * 60 * 1000) {
    return { skipped: 'fresh', rate: Number(value?.usd_to_ves) || undefined };
  }

  try {
    const { payload } = await getRates(force);
    const usd = Number(payload.bcv?.price) || 0;
    if (usd <= 0 || payload.stale === true) {
      return { updated: false, reason: 'Ninguna fuente confirmó la tasa BCV; se conserva el último valor.' };
    }
    const updated_at = new Date().toISOString();
    const { error } = await admin.from('settings').upsert({
      key: 'exchange_rate',
      value: { usd_to_ves: usd, updated_at, source: payload.source },
      updated_at
    }, { onConflict: 'key' });
    if (error) return { updated: false, reason: 'No se pudo guardar la tasa en la configuración.' };
    return { updated: true, rate: usd, source: payload.source };
  } catch (error) {
    return {
      updated: false,
      reason: `Fuentes BCV no disponibles: ${error instanceof Error ? error.message : 'error desconocido'}.`
    };
  }
}

/** ¿La tasa publicada aún sirve para cotizar (menos de 24 h)? */
export function isPublishedRateFresh(value: { updated_at?: string } | null | undefined, now = Date.now()): boolean {
  if (!value?.updated_at) return false;
  const ts = Date.parse(value.updated_at);
  return Number.isFinite(ts) && ts <= now && now - ts < RATE_MAX_AGE_MS;
}

// Ventana antiduplicado: aunque lleguen muchas peticiones paralelas (SSR de
// varias páginas, refetch del cliente), la sincronización con las fuentes
// externas corre como máximo una vez cada 10 minutos por proceso.
const DEDUP_WINDOW_MS = 10 * 60 * 1000;
let _lastAttempt = 0;
let _inflight: Promise<SyncResult> | null = null;

export async function syncExchangeRateDeduped(): Promise<SyncResult> {
  if (_inflight) return _inflight;
  if (Date.now() - _lastAttempt < DEDUP_WINDOW_MS) return { skipped: 'fresh' };
  _lastAttempt = Date.now();
  _inflight = syncExchangeRateFromBcv().finally(() => { _inflight = null; });
  return _inflight;
}
