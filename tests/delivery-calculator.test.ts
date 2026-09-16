import { describe, it, expect } from 'vitest';
import {
  calculateDeliveryCost,
  formatDeliveryTime,
  FREE_DELIVERY_THRESHOLD_USD,
} from '@/lib/delivery/calculator';

describe('Delivery Calculator', () => {
  const sampleCity = {
    delivery_fee_usd: 3.5,
    min_order_usd: 10.0,
  };

  const sampleArea = {
    estimated_delivery_minutes: 45,
  };

  it('calculates base fee when subtotal is below $40 threshold', () => {
    const res = calculateDeliveryCost({
      subtotalUsd: 25.0,
      city: sampleCity,
      area: sampleArea,
      exchangeRate: 50.0,
    });

    expect(res.baseFeeUsd).toBe(3.5);
    expect(res.baseFeeVes).toBe(175.0);
    expect(res.finalFeeUsd).toBe(3.5);
    expect(res.finalFeeVes).toBe(175.0);
    expect(res.isFreeDelivery).toBe(false);
    expect(res.amountNeededForFreeUsd).toBe(15.0);
    expect(res.freeDeliveryProgressPct).toBe(63);
    expect(res.estimatedTimeMinutes).toBe(45);
    expect(res.meetsMinOrder).toBe(true);
  });

  it('applies free delivery when subtotal reaches or exceeds $40', () => {
    const res = calculateDeliveryCost({
      subtotalUsd: 42.0,
      city: sampleCity,
      area: sampleArea,
      exchangeRate: 50.0,
    });

    expect(res.baseFeeUsd).toBe(3.5);
    expect(res.finalFeeUsd).toBe(0);
    expect(res.finalFeeVes).toBe(0);
    expect(res.isFreeDelivery).toBe(true);
    expect(res.amountNeededForFreeUsd).toBe(0);
    expect(res.freeDeliveryProgressPct).toBe(100);
    expect(res.ruleApplied).toBe('free_threshold');
  });

  it('applies free delivery for prime members regardless of subtotal', () => {
    const res = calculateDeliveryCost({
      subtotalUsd: 15.0,
      city: sampleCity,
      area: sampleArea,
      isPrime: true,
      exchangeRate: 50.0,
    });

    expect(res.finalFeeUsd).toBe(0);
    expect(res.isFreeDelivery).toBe(true);
    expect(res.ruleApplied).toBe('prime');
  });

  it('flags orders below minimum order requirement', () => {
    const res = calculateDeliveryCost({
      subtotalUsd: 8.0,
      city: sampleCity,
      area: sampleArea,
    });

    expect(res.meetsMinOrder).toBe(false);
    expect(res.minOrderUsd).toBe(10.0);
  });

  it('formats delivery times correctly', () => {
    expect(formatDeliveryTime(35)).toBe('25–45 min');
    expect(formatDeliveryTime(50)).toBe('40–60 min');
    expect(formatDeliveryTime(0)).toBe('30–45 min');
  });

  it('uses default fallback values when city or area are omitted', () => {
    const res = calculateDeliveryCost({
      subtotalUsd: 20.0,
    });

    expect(res.baseFeeUsd).toBe(3.0);
    expect(res.estimatedTimeMinutes).toBe(45);
    expect(res.meetsMinOrder).toBe(true);
  });
});
