import { CURRENCIES } from './constants';
import type { Currency } from './currency';

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(locale: string, currency: string): Intl.NumberFormat {
  const key = `${locale}-${currency}`;
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 });
    formatterCache.set(key, f);
  }
  return f;
}

export function formatMoney(amount: number, currency: Currency = 'USD'): string {
  const c = CURRENCIES[currency];
  try {
    const formatted = getFormatter(c.locale, c.code).format(amount);
    if (currency === 'VES') {
      return formatted
        .replace(/Bs\.S\.?[\s\u00a0]*/gi, 'Bs ')
        .replace(/Bs\.[\s\u00a0]*/gi, 'Bs ')
        .replace(/[\s\u00a0]*Bs\.S\.?/gi, ' Bs')
        .replace(/[\s\u00a0]*Bs\./gi, ' Bs')
        .trim();
    }
    return formatted;
  } catch {
    return currency === 'VES' ? `Bs ${amount.toFixed(2)}` : `${c.symbol}${amount.toFixed(2)}`;
  }
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-VE').format(value);
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('es-VE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(d);
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(d);
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = d.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat('es-VE', { numeric: 'auto' });
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  return rtf.format(days, 'day');
}

export function generateOrderNumber(seed?: number): string {
  const n = seed ?? Math.floor(Math.random() * 1000000);
  return `TZ${String(n).padStart(6, '0')}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
