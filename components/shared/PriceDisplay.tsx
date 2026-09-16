'use client';

import { useUserStore } from '@/store/userStore';
import { useQuery } from '@tanstack/react-query';
import { useNow } from '@/lib/hooks/useNow';
import { useTasaCambio } from '@/lib/hooks/useTasaCambio';
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

/**
 * Muestra el precio en la moneda preferida del visitante.
 *
 * Orden de fuentes de la tasa (puerto de useTasaCambio del sistema de
 * referencia): 1) tasa BCV/USDT/manual en vivo obtenida por el hook (tiempo
 * real vía /api/tasas); 2) tasa publicada en la configuración del comercio
 * (settings.exchange_rate); 3) prop rate (SSR). Con tasa fresca en VES o
 * "ambas", la conversión se calcula al instante.
 */
export function PriceDisplay({ usd, rate, rateUpdatedAt, showBoth = false, className, size = 'md' }: Props) {
  const { currency, hydrated } = useUserStore();
  const preference = hydrated ? currency : 'USD';
  const now = useNow();
  const needsVes = rate === undefined && hydrated && (currency === 'VES' || showBoth);
  const live = useTasaCambio();
  const liveFresh = typeof live.tasaEfectiva === 'number' && live.tasaEfectiva > 0;
  const config = useQuery<CheckoutConfig>({
    queryKey: ['checkout-config'],
    queryFn: async ({ signal }) => { const response = await fetch('/api/checkout/config', { signal, cache: 'no-store' }); if (!response.ok) throw new Error('Tasa no disponible'); return response.json(); },
    enabled: needsVes && !liveFresh,
    staleTime: 30000
  });
  let actualRate: number | null = null;
  let actualTimestamp: string | null = null;
  let source: 'live' | 'config' | 'prop' = 'prop';
  if (needsVes && liveFresh) {
    actualRate = live.tasaEfectiva;
    const liveInfo = live.modoTasa === 'usdt' ? live.tasaUsdt : live.modoTasa === 'manual' ? null : live.tasaBcv;
    actualTimestamp = liveInfo?.ultimaActualizacion ?? null;
    source = 'live';
  } else if (rate === undefined) {
    actualRate = config.data?.exchange_rate ?? null;
    actualTimestamp = config.data?.rate_updated_at ?? null;
    source = 'config';
  } else {
    actualRate = rate ?? null;
    actualTimestamp = rateUpdatedAt ?? null;
  }
  const timestamp = actualTimestamp ? Date.parse(actualTimestamp) : NaN;
  const fresh = typeof actualRate === 'number' && Number.isFinite(actualRate) && actualRate > 0 && (source === 'live' || (Number.isFinite(timestamp) && timestamp <= now && (isDemoMode() || now - timestamp <= 86400000)));
  const converted = fresh ? Math.round(usd * actualRate! * 100) / 100 : null;
  const useVes = preference === 'VES' && converted !== null;
  return (
    <div className={cn('price-display', size === 'sm' ? 'text-base' : size === 'lg' ? 'text-3xl' : 'text-xl', className)}>
      <span className="font-bold tabular-nums">{useVes ? formatMoney(converted, 'VES') : formatMoney(usd, 'USD')}</span>
      {preference === 'VES' && !fresh && <span className="mt-0.5 block text-[10px] font-normal leading-tight text-muted-foreground">USD · Tasa no disponible</span>}
      {showBoth && fresh && <span className="mt-1 block text-xs font-normal text-muted-foreground">{useVes ? formatMoney(usd, 'USD') : formatMoney(converted!, 'VES')}</span>}
    </div>
  );
}
