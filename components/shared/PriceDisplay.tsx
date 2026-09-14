'use client';

import { useUserStore } from '@/store/userStore';
import { useQuery } from '@tanstack/react-query';
import { useNow } from '@/lib/hooks/useNow';
import type { CheckoutConfig } from '@/types/commerce';
import { formatMoney } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils/cn';
import { isDemoMode } from '@/lib/config';

export interface PriceRateProps { rate?: number | null; rateUpdatedAt?: string | null }
interface Props extends PriceRateProps {
  usd: number;
  ves?: number;
  showBoth?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function PriceDisplay({ usd, rate, rateUpdatedAt, showBoth = false, className, size = 'md' }: Props) {
  const { currency, hydrated } = useUserStore();
  const preference = hydrated ? currency : 'USD';
  const now = useNow();
  const config = useQuery<CheckoutConfig>({
    queryKey: ['checkout-config'],
    queryFn: async ({ signal }) => { const response = await fetch('/api/checkout/config', { signal, cache: 'no-store' }); if (!response.ok) throw new Error('Tasa no disponible'); return response.json(); },
    enabled: rate === undefined && hydrated && (currency === 'VES' || showBoth),
    staleTime: 30000
  });
  const actualRate = rate === undefined ? config.data?.exchange_rate : rate;
  const actualTimestamp = rateUpdatedAt === undefined ? config.data?.rate_updated_at : rateUpdatedAt;
  const timestamp = actualTimestamp ? Date.parse(actualTimestamp) : NaN;
  const fresh = typeof actualRate === 'number' && Number.isFinite(actualRate) && actualRate > 0 && Number.isFinite(timestamp) && timestamp <= now && (isDemoMode() || now - timestamp <= 86400000);
  const converted = fresh ? Math.round(usd * actualRate * 100) / 100 : null;
  const useVes = preference === 'VES' && converted !== null;
  return (
    <div className={cn('price-display', size === 'sm' ? 'text-base' : size === 'lg' ? 'text-3xl' : 'text-xl', className)}>
      <span className="font-bold tabular-nums">{useVes ? formatMoney(converted, 'VES') : formatMoney(usd, 'USD')}</span>
      {preference === 'VES' && !fresh && <span className="mt-0.5 block text-[10px] font-normal leading-tight text-muted-foreground">USD · Tasa no disponible</span>}
      {showBoth && fresh && <span className="mt-1 block text-xs font-normal text-muted-foreground">{useVes ? formatMoney(usd, 'USD') : formatMoney(converted!, 'VES')}</span>}
    </div>
  );
}
