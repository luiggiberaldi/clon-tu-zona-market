'use client';

/**
 * Hook de tasas de cambio — adaptado del sistema de referencia
 * (listo-pos-cotizaciones · src/hooks/useTasaCambio.js).
 *
 * - Singleton a nivel de módulo: deduplica fetches entre todos los
 *   componentes que usan el hook (una página puede montarlo decenas de veces).
 * - Refresco automático cada 5 minutos y al recuperar el foco de la pestaña.
 * - Cache inicial desde localStorage para evitar parpadeos al recargar.
 * - Tasa efectiva según modo: bcv (oficial), usdt (Binance P2P) o manual.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNow } from '@/lib/hooks/useNow';

const STORAGE_KEY_BCV = 'tuzona_tasa_v1';
const STORAGE_KEY_USDT = 'tuzona_tasa_usdt_v1';
const STORAGE_KEY_MODE = 'tuzona_tasa_modo_v1';
const STORAGE_KEY_MANUAL = 'tuzona_tasa_manual_v1';
const UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutos
const MIN_REFRESH_INTERVAL = 60 * 1000; // al volver al foco, máximo 1x/min

export type RateMode = 'bcv' | 'usdt' | 'manual';
const MODOS_VALIDOS: RateMode[] = ['bcv', 'usdt', 'manual'];

export interface TasaInfo {
  precio: number;
  fuente: string;
  ultimaActualizacion: string | null;
}

const DEFAULT_RATE: TasaInfo = { precio: 0, fuente: '', ultimaActualizacion: null };

// ─── Singleton: deduplicar fetches entre instancias del hook ────────────────
let _inflight: Promise<{ bcv: TasaInfo; usdt: TasaInfo; bcvEuro: TasaInfo } | null> | null = null;
let _lastFetchTs = 0;
const _subscribers = new Set<(result: { bcv: TasaInfo; usdt: TasaInfo; bcvEuro: TasaInfo; esAutoUpdate: boolean }) => void>();
const MIN_DEDUP_INTERVAL = 5000;

interface ApiPayload {
  bcv?: { price?: number; source?: string };
  euro?: { price?: number; source?: string };
  usdt?: { precio?: number; fuente?: string } | null;
  lastUpdate?: string;
}

function parseSafeFloat(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (typeof val === 'string') {
    const clean = val.replace(/[^\d.,]/g, '');
    const lastDot = clean.lastIndexOf('.');
    const lastComma = clean.lastIndexOf(',');
    const lastSep = Math.max(lastDot, lastComma);
    if (lastSep === -1) return parseFloat(clean) || 0;
    const integer = clean.slice(0, lastSep).replace(/[.,]/g, '');
    const decimals = clean.slice(lastSep + 1);
    return parseFloat(`${integer}.${decimals}`) || 0;
  }
  return 0;
}

async function fetchJson(url: string, timeout = 10000): Promise<ApiPayload | null> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as ApiPayload;
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

/** Una consulta al endpoint propio del sitio (que agrupa BCV + USDT). */
async function fetchRatesRaw(): Promise<{ bcv: TasaInfo; usdt: TasaInfo; bcvEuro: TasaInfo } | null> {
  const data = await fetchJson('/api/tasas');
  if (!data) return null;
  const usd = parseSafeFloat(data?.bcv?.price);
  const usdt = parseSafeFloat(data?.usdt?.precio);
  const eur = parseSafeFloat(data?.euro?.price);
  const actualizadoEn = data?.lastUpdate || null;
  return {
    bcv: usd > 0 ? { precio: usd, fuente: data?.bcv?.source || 'BCV Oficial', ultimaActualizacion: actualizadoEn } : DEFAULT_RATE,
    bcvEuro: eur > 0 ? { precio: eur, fuente: data?.euro?.source || 'BCV Oficial (EUR)', ultimaActualizacion: actualizadoEn } : DEFAULT_RATE,
    usdt: usdt > 0 ? { precio: usdt, fuente: data?.usdt?.fuente || 'Binance P2P', ultimaActualizacion: actualizadoEn } : DEFAULT_RATE,
  };
}

function fetchDedup(): Promise<{ bcv: TasaInfo; usdt: TasaInfo; bcvEuro: TasaInfo } | null> {
  if (_inflight) return _inflight;
  _inflight = fetchRatesRaw().finally(() => { _inflight = null; });
  return _inflight;
}

async function fetchTasaGlobal(esAutoUpdate: boolean): Promise<void> {
  if (Date.now() - _lastFetchTs < MIN_DEDUP_INTERVAL) return;
  const result = await fetchDedup();
  _lastFetchTs = Date.now();
  const payload = result ?? { bcv: DEFAULT_RATE, usdt: DEFAULT_RATE, bcvEuro: DEFAULT_RATE };
  _subscribers.forEach(cb => cb({ ...payload, esAutoUpdate }));
}

function readSavedRate(key: string): TasaInfo {
  if (typeof window === 'undefined') return DEFAULT_RATE;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null') as TasaInfo | null;
    if (saved && typeof saved.precio === 'number' && saved.precio > 0) return { precio: saved.precio, fuente: String(saved.fuente || ''), ultimaActualizacion: saved.ultimaActualizacion ?? null };
  } catch { /* cache corrupta: se ignora */ }
  return DEFAULT_RATE;
}

function readSavedMode(): RateMode {
  if (typeof window === 'undefined') return 'bcv';
  const saved = localStorage.getItem(STORAGE_KEY_MODE) as RateMode | null;
  return saved && MODOS_VALIDOS.includes(saved) ? saved : 'bcv';
}

export function useTasaCambio() {
  const [tasaBcv, setTasaBcv] = useState<TasaInfo>(() => readSavedRate(STORAGE_KEY_BCV));
  const [tasaEuro, setTasaEuro] = useState<TasaInfo>(() => readSavedRate('tuzona_tasa_euro_v1'));
  const [tasaUsdt, setTasaUsdt] = useState<TasaInfo>(() => readSavedRate(STORAGE_KEY_USDT));
  const [modoTasa, setModoTasa] = useState<RateMode>(() => readSavedMode());
  const [tasaManual, setTasaManual] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const saved = localStorage.getItem(STORAGE_KEY_MANUAL);
    return saved && parseFloat(saved) > 0 ? saved : '';
  });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const handleResult = useCallback((result: { bcv: TasaInfo; usdt: TasaInfo; bcvEuro: TasaInfo; esAutoUpdate: boolean }) => {
    const { bcv, usdt, bcvEuro, esAutoUpdate } = result;
    if (bcv.precio > 0) {
      setTasaBcv(bcv);
      localStorage.setItem(STORAGE_KEY_BCV, JSON.stringify(bcv));
    } else if (!esAutoUpdate) setError('No se pudo obtener la tasa BCV');
    if (bcvEuro.precio > 0) {
      setTasaEuro(bcvEuro);
      localStorage.setItem('tuzona_tasa_euro_v1', JSON.stringify(bcvEuro));
    }
    if (usdt.precio > 0) {
      // Mismo margen del sistema de referencia: redondeo hacia arriba + 2 Bs.
      const margen = { ...usdt, precio: Math.ceil(usdt.precio) + 2 };
      setTasaUsdt(margen);
      localStorage.setItem(STORAGE_KEY_USDT, JSON.stringify(margen));
    } else if (!esAutoUpdate) setError('No se pudo obtener la tasa USDT');
  }, []);

  const fetchTasa = useCallback(async (esAutoUpdate = false) => {
    if (!esAutoUpdate) setCargando(true);
    setError('');
    try { await fetchTasaGlobal(esAutoUpdate); }
    catch { if (!esAutoUpdate) setError('Error de conexión'); }
    finally { if (!esAutoUpdate) setCargando(false); }
  }, []);

  // Suscripción compartida: cualquier instancia recibe el resultado del fetch global.
  useEffect(() => {
    _subscribers.add(handleResult);
    return () => { _subscribers.delete(handleResult); };
  }, [handleResult]);

  // Auto-fetch al montar (diferido: sin setState síncrono en el effect)
  // + intervalo de 5 min + refresco al volver al foco.
  useEffect(() => {
    const kickoff = setTimeout(() => { void fetchTasa(readSavedRate(STORAGE_KEY_BCV).precio > 0); }, 0);
    const intervalId = setInterval(() => { void fetchTasa(true); }, UPDATE_INTERVAL);
    const lastFetch = { ts: Date.now() };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch.ts > MIN_REFRESH_INTERVAL) {
        void fetchTasa(true);
        lastFetch.ts = Date.now();
      }
    };
    const onFocus = () => {
      if (Date.now() - lastFetch.ts > MIN_REFRESH_INTERVAL) {
        void fetchTasa(true);
        lastFetch.ts = Date.now();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(kickoff);
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchTasa]);

  // Persistir el modo y la tasa manual.
  useEffect(() => { localStorage.setItem(STORAGE_KEY_MODE, modoTasa); }, [modoTasa]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_MANUAL, tasaManual); }, [tasaManual]);

  const tasaEfectiva = modoTasa === 'usdt'
    ? (Number(tasaUsdt.precio) > 0 ? Number(tasaUsdt.precio) : 0)
    : modoTasa === 'manual'
      ? (parseFloat(tasaManual) > 0 ? parseFloat(tasaManual) : 0)
      : (Number(tasaBcv.precio) > 0 ? Number(tasaBcv.precio) : 0);

  const tasaActiva = modoTasa === 'usdt' ? tasaUsdt : tasaBcv;
  const STALE_MS = 30 * 60 * 1000;
  const now = useNow();
  const tasaTimestamp = tasaActiva.ultimaActualizacion ? Date.parse(tasaActiva.ultimaActualizacion) : NaN;
  const esStale = modoTasa !== 'manual' && Number.isFinite(tasaTimestamp) && tasaTimestamp <= now && now - tasaTimestamp > STALE_MS;

  const refrescar = useCallback(() => { _lastFetchTs = 0; return fetchTasa(false); }, [fetchTasa]);

  return {
    tasaBcv, tasaEuro, tasaUsdt,
    tasaEfectiva,
    modoTasa, setModoTasa,
    tasaManual, setTasaManual,
    cargando, error, esStale,
    refrescar,
  };
}
