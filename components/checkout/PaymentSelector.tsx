'use client';

import { useEffect } from 'react';
import {
  Smartphone,
  Landmark,
  CircleDollarSign,
  Coins,
  CreditCard,
  Banknote,
  CheckCircle2,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { CorePaymentMethod, PaymentMethodConfig } from '@/types/commerce';

const methodIcons: Record<string, typeof Smartphone> = {
  pagomovil: Smartphone,
  transfer: Landmark,
  zelle: CircleDollarSign,
  binance: Coins,
  card: CreditCard,
  cash: Banknote
};

const methodSubtitles: Record<string, string> = {
  pagomovil: 'Pago móvil interbancario en Bs',
  transfer: 'Transferencia nacional o custodia USD',
  zelle: 'Transferencia directa en dólares',
  binance: 'Cripto vía Binance Pay (USDT)',
  card: 'Visa, Mastercard y débito',
  cash: 'Divisas o bolívares al recibir'
};

export function PaymentSelector({
  methods,
  selected,
  onSelect
}: {
  methods: PaymentMethodConfig[];
  selected?: CorePaymentMethod;
  onSelect: (method: CorePaymentMethod) => void;
}) {
  const enabled = methods.filter((m) => m.enabled);
  const currentMethod = enabled.find((entry) => entry.id === selected);

  useEffect(() => {
    if (!selected && enabled[0]) {
      onSelect(enabled[0].id);
    }
  }, [selected, enabled, onSelect]);

  return (
    <section className="space-y-4" aria-labelledby="payment-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="payment-title" className="text-lg font-semibold text-foreground">
          3. Método de pago
        </h2>
        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Entorno de prueba · Datos ficticios
        </span>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {enabled.map((entry) => {
          const Icon = methodIcons[entry.id] || Landmark;
          const isSelected = selected === entry.id;
          const subtitle = methodSubtitles[entry.id] || `Pago en ${entry.currency}`;

          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(entry.id)}
              className={cn(
                'group relative flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary'
                  : 'border-border bg-card hover:border-primary/40 hover:bg-secondary/40'
              )}
            >
              <div
                className={cn(
                  'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground group-hover:text-foreground'
                )}
              >
                <Icon size={19} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-semibold text-foreground truncate text-sm">
                    {entry.label}
                  </span>
                  <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
                    {entry.currency === 'VES' ? 'Bs' : entry.id === 'binance' ? 'USDT' : '$ USD'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground truncate">{subtitle}</p>
              </div>

              {isSelected && (
                <div className="absolute right-2.5 top-2.5 text-primary">
                  <CheckCircle2 size={16} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {!enabled.length && (
        <p role="alert" className="text-sm text-destructive">
          El comercio aún no ha habilitado métodos de pago. No es posible confirmar pedidos.
        </p>
      )}

      {currentMethod && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Info size={15} className="text-primary shrink-0" />
            <span>Instrucciones para: {currentMethod.label}</span>
          </div>

          <div className="rounded-lg bg-background border border-border/80 p-3.5 text-xs font-mono whitespace-pre-wrap leading-relaxed text-foreground">
            {currentMethod.instructions || 'Consulta las instrucciones con el comercio.'}
          </div>

          <p className="text-xs text-muted-foreground">
            💡 En este entorno de prueba puedes ingresar cualquier referencia ficticia al confirmar tu orden.
          </p>
        </div>
      )}
    </section>
  );
}
