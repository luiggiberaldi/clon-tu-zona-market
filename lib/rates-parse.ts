/**
 * Utilidades puras de análisis de tasas — puerto fiel del sistema de
 * referencia (listo-pos-cotizaciones · api/handlers/rates.js y
 * src/hooks/useTasaCambio.js). Sin dependencias de servidor para poder
 * probarlas en unit tests.
 */

/** Convierte números con formato venezolano/español ("1.234,56") a número. */
export function parseLocalizedNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const clean = value.replace(/[^\d.,]/g, '');
  if (!clean) return 0;
  const lastDot = clean.lastIndexOf('.');
  const lastComma = clean.lastIndexOf(',');
  const lastSeparator = Math.max(lastDot, lastComma);
  if (lastSeparator === -1) return Number(clean) || 0;
  const integer = clean.slice(0, lastSeparator).replace(/[.,]/g, '');
  const decimals = clean.slice(lastSeparator + 1);
  return Number(`${integer}.${decimals}`) || 0;
}

/** Extrae la tasa de un div del HTML oficial del BCV (clases strong-tb). */
export function extractBcvRate(html: string, id: string): number {
  const patterns = [
    new RegExp(`id=["']${id}["'][\\s\\S]{0,5000}?<strong\\b[^>]*class=["'][^"']*strong-tb[^"']*["'][^>]*>\\s*([\\d.,]+)`, 'i'),
    new RegExp(`id=["']${id}["'][\\s\\S]{0,5000}?<strong\\b[^>]*>\\s*([\\d.,]+)`, 'i'),
  ];
  for (const pattern of patterns) {
    const value = parseLocalizedNumber(html.match(pattern)?.[1]);
    if (value > 0) return value;
  }
  return 0;
}

/** Promedio de los 3 primeros precios (ask/bid) del P2P de Binance. */
export function averageTop3(entry: unknown): number {
  if (typeof entry === 'number') return entry;
  if (Array.isArray(entry) && entry.length > 0) {
    const first = entry.slice(0, 3);
    const sum = first.reduce((acc: number, item) => acc + (typeof item === 'number' ? item : typeof (item as { price?: unknown })?.price === 'number' ? (item as { price: number }).price : 0), 0);
    return sum / Math.min(3, entry.length);
  }
  return 0;
}

/** Localiza la fila "oficial" en la respuesta de DolarAPI. */
export function officialRateFromPayload(payload: unknown): { price: number; officialDate: string | null } {
  const rows = Array.isArray(payload) ? payload : [payload];
  const row = rows.find(item => (item as { fuente?: string })?.fuente === 'oficial' || (item as { nombre?: string })?.nombre === 'Oficial') as { promedio?: unknown; precio?: unknown; fechaActualizacion?: string } | undefined;
  return {
    price: parseLocalizedNumber(row?.promedio ?? row?.precio),
    officialDate: row?.fechaActualizacion ?? null,
  };
}
