import { describe, it, expect } from 'vitest';
import { usdToVes, vesToUsd, applyOffer, toDbMoney, fromDbMoney } from '@/lib/utils/currency';

describe('currency utils', () => {
  it('convierte USD a VES con tasa explícita', () => {
    expect(usdToVes(10, 36.5)).toBeCloseTo(365, 2);
  });

  it('convierte con tasa custom', () => {
    expect(usdToVes(10, 40)).toBeCloseTo(400, 2);
  });

  it('convierte VES a USD', () => {
    expect(vesToUsd(365, 36.5)).toBeCloseTo(10, 2);
  });

  it('no aplica oferta si es null', () => {
    expect(applyOffer(100, null)).toBe(100);
  });

  it('no aplica oferta si es 0', () => {
    expect(applyOffer(100, 0)).toBe(100);
  });

  it('100 por ciento produce precio cero igual al servidor', () => {
    expect(applyOffer(100, 100)).toBe(0);
  });

  it('aplica descuento correctamente', () => {
    expect(applyOffer(100, 20)).toBe(80);
  });

  it('redondea a 2 decimales', () => {
    expect(applyOffer(33.33, 10)).toBe(30);
  });

  it('toDbMoney da string con 2 decimales', () => {
    expect(toDbMoney(10)).toBe('10.00');
  });

  it('fromDbMoney acepta string o number', () => {
    expect(fromDbMoney('10.50')).toBe(10.5);
    expect(fromDbMoney(10.5)).toBe(10.5);
  });
});
