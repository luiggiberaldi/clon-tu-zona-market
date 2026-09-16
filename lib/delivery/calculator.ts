export const FREE_DELIVERY_THRESHOLD_USD = 40.00;
export const DEFAULT_MIN_ORDER_USD = 0.00;

export interface DeliveryCalculation {
  baseFeeUsd: number;
  baseFeeVes: number;
  finalFeeUsd: number;
  finalFeeVes: number;
  minOrderUsd: number;
  freeDeliveryThresholdUsd: number;
  isFreeDelivery: boolean;
  amountNeededForFreeUsd: number;
  freeDeliveryProgressPct: number;
  estimatedTimeMinutes: number;
  meetsMinOrder: boolean;
  ruleApplied: 'free_threshold' | 'prime' | 'standard';
}

export function calculateDeliveryCost({
  subtotalUsd = 0,
  city,
  area,
  isPrime = false,
  exchangeRate = 1
}: {
  subtotalUsd?: number;
  city?: { delivery_fee_usd?: number; min_order_usd?: number } | null;
  area?: { delivery_time_minutes?: number; estimated_delivery_minutes?: number } | null;
  isPrime?: boolean;
  exchangeRate?: number | null;
}): DeliveryCalculation {
  const rate = typeof exchangeRate === 'number' && exchangeRate > 0 ? exchangeRate : 1;
  const baseFeeUsd = typeof city?.delivery_fee_usd === 'number' && city.delivery_fee_usd >= 0 ? city.delivery_fee_usd : 3.00;
  const minOrderUsd = typeof city?.min_order_usd === 'number' && city.min_order_usd >= 0 ? city.min_order_usd : DEFAULT_MIN_ORDER_USD;
  const estimatedTimeMinutes =
    typeof area?.delivery_time_minutes === 'number' && area.delivery_time_minutes > 0
      ? area.delivery_time_minutes
      : typeof area?.estimated_delivery_minutes === 'number' && area.estimated_delivery_minutes > 0
      ? area.estimated_delivery_minutes
      : 45;

  const meetsMinOrder = subtotalUsd >= minOrderUsd;
  const amountNeededForFreeUsd = Math.max(0, Number((FREE_DELIVERY_THRESHOLD_USD - subtotalUsd).toFixed(2)));
  const freeDeliveryProgressPct = Math.min(100, Math.round((subtotalUsd / FREE_DELIVERY_THRESHOLD_USD) * 100));

  let finalFeeUsd = baseFeeUsd;
  let ruleApplied: 'free_threshold' | 'prime' | 'standard' = 'standard';

  if (isPrime) {
    finalFeeUsd = 0;
    ruleApplied = 'prime';
  } else if (subtotalUsd >= FREE_DELIVERY_THRESHOLD_USD) {
    finalFeeUsd = 0;
    ruleApplied = 'free_threshold';
  }

  const baseFeeVes = Number((baseFeeUsd * rate).toFixed(2));
  const finalFeeVes = Number((finalFeeUsd * rate).toFixed(2));

  return {
    baseFeeUsd,
    baseFeeVes,
    finalFeeUsd,
    finalFeeVes,
    minOrderUsd,
    freeDeliveryThresholdUsd: FREE_DELIVERY_THRESHOLD_USD,
    isFreeDelivery: finalFeeUsd === 0,
    amountNeededForFreeUsd,
    freeDeliveryProgressPct,
    estimatedTimeMinutes,
    meetsMinOrder,
    ruleApplied
  };
}

export function formatDeliveryTime(minutes: number): string {
  if (!minutes || minutes <= 0) return '30–45 min';
  const min = Math.max(20, minutes - 10);
  const max = minutes + 10;
  return `${min}–${max} min`;
}
