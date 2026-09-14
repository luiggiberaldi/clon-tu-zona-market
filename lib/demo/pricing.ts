import type { Product } from '@/types';
import { applyOffer } from '@/lib/utils/currency';
import { isDemoMode } from '@/lib/config';

/** Published rounded prices are authoritative; never recalculate a rounded source discount badge. */
export function productPriceUsd(product: Product): number {
  const source = product.metadata?.source as { final_price_usd?: number } | undefined;
  if (isDemoMode() && product.metadata?.demo === true && product.metadata?.source_pricing_active === true &&
      typeof source?.final_price_usd === 'number' && Number.isFinite(source.final_price_usd) && source.final_price_usd >= 0) return source.final_price_usd;
  return applyOffer(product.price_usd, product.is_offer ? product.offer_percentage : null);
}
