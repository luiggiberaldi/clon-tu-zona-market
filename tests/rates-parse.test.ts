import { describe, it, expect } from 'vitest';
import { parseLocalizedNumber, extractBcvRate, averageTop3, officialRateFromPayload } from '@/lib/rates-parse';

describe('parseLocalizedNumber (formato venezolano del BCV)', () => {
  it('parses comma decimals like the BCV site prints', () => expect(parseLocalizedNumber('234,56')).toBe(234.56));
  it('parses thousands with dots and comma decimals', () => expect(parseLocalizedNumber('1.234,56')).toBe(1234.56));
  it('parses plain numbers', () => expect(parseLocalizedNumber('36.5')).toBe(36.5));
  it('parses numeric input passthrough', () => expect(parseLocalizedNumber(42.1)).toBe(42.1));
  it('returns 0 for garbage, empty and null values', () => {
    expect(parseLocalizedNumber('no hay tasa')).toBe(0);
    expect(parseLocalizedNumber('')).toBe(0);
    expect(parseLocalizedNumber(null)).toBe(0);
    expect(parseLocalizedNumber(undefined)).toBe(0);
    expect(parseLocalizedNumber(NaN)).toBe(0);
  });
  it('strips currency symbols and spaces', () => expect(parseLocalizedNumber('Bs. 234,56')).toBe(234.56));
});

describe('extractBcvRate (HTML oficial de bcv.org.ve)', () => {
  const strongTb = (id: string, value: string) =>
    `<div id="${id}" class="row protagon"><div class="col-sm-6 col-xs-6"><span>Dolar</span></div><div class="col-sm-6 col-xs-6"><strong class="strong-tb"> ${value}</strong></div></div>`;
  it('extracts USD and EUR with the strong-tb class', () => {
    const html = strongTb('dolar', '234,56') + strongTb('euro', '251,30');
    expect(extractBcvRate(html, 'dolar')).toBe(234.56);
    expect(extractBcvRate(html, 'euro')).toBe(251.30);
  });
  it('falls back to any strong element when the class is missing', () => {
    const html = '<div id="dolar"><strong> 100,00</strong></div>';
    expect(extractBcvRate(html, 'dolar')).toBe(100);
  });
  it('returns 0 when the section or number is absent', () => {
    expect(extractBcvRate('<html><body>mantenimiento</body></html>', 'dolar')).toBe(0);
    expect(extractBcvRate(strongTb('dolar', '----'), 'dolar')).toBe(0);
  });
  it('does not confuse euro with dolar sections', () => {
    const html = strongTb('euro', '251,30');
    expect(extractBcvRate(html, 'dolar')).toBe(0);
  });
});

describe('averageTop3 (P2P de Binance vía CriptoYa)', () => {
  it('averages the first three ask prices', () => expect(averageTop3([{ price: 100 }, { price: 102 }, { price: 104 }, { price: 999 }])).toBe(102));
  it('accepts plain number arrays', () => expect(averageTop3([40, 41, 42])).toBe(41));
  it('accepts a single number', () => expect(averageTop3(36.5)).toBe(36.5));
  it('averages fewer entries when the book is thin', () => expect(averageTop3([{ price: 30 }])).toBe(30));
  it('returns 0 for empty or invalid shapes', () => {
    expect(averageTop3([])).toBe(0);
    expect(averageTop3(undefined)).toBe(0);
    expect(averageTop3('no')).toBe(0);
  });
});

describe('officialRateFromPayload (DolarAPI)', () => {
  it('finds the oficial row in array form', () => {
    const payload = [{ fuente: 'paralelo', promedio: '300,00' }, { fuente: 'oficial', promedio: '234,56', fechaActualizacion: '2026-09-15T10:00:00Z' }];
    expect(officialRateFromPayload(payload)).toEqual({ price: 234.56, officialDate: '2026-09-15T10:00:00Z' });
  });
  it('finds the Oficial row by nombre in object form', () => {
    expect(officialRateFromPayload({ nombre: 'Oficial', precio: '36,90' })).toEqual({ price: 36.9, officialDate: null });
  });
  it('returns 0 when no oficial row exists', () => {
    expect(officialRateFromPayload([{ fuente: 'paralelo', promedio: '300' }]).price).toBe(0);
  });
});
