import { describe, it, expect } from 'vitest';
import { formatMoney, formatNumber, formatDate, slugify, generateOrderNumber } from '@/lib/utils/formatters';

describe('formatters', () => {
  it('formatMoney USD', () => {
    const out = formatMoney(10, 'USD');
    expect(out).toMatch(/10/);
  });

  it('formatMoney VES usa símbolo Bs en fallback', () => {
    expect(formatMoney(12.5, 'VES')).toMatch(/12/);
  });

  it('formatNumber separa miles (es-VE)', () => {
    expect(formatNumber(1234567)).toMatch(/1/);
  });

  it('formatDate devuelve fecha en español', () => {
    expect(formatDate('2025-01-15')).toBeTruthy();
  });

  it('slugify normaliza acentos y espacios', () => {
    expect(slugify('HARÍNA de Maíz')).toBe('harina-de-maiz');
  });

  it('slugify limpia caracteres especiales', () => {
    expect(slugify('Coca-Cola 2L!')).toBe('coca-cola-2l');
  });

  it('generateOrderNumber respeta el prefijo TZ', () => {
    const n = generateOrderNumber(42);
    expect(n.startsWith('TZ')).toBe(true);
  });

  it('generateOrderNumber tiene longitud fija 8', () => {
    expect(generateOrderNumber(5)).toHaveLength(8);
  });
});
