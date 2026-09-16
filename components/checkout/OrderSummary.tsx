'use client';
import { formatMoney, formatDateTime } from '@/lib/utils/formatters';
import type { CheckoutQuote } from '@/types/commerce';
import { isDemoMode } from '@/lib/config';

export function OrderSummary({ quote, loading, error }: { quote?: CheckoutQuote; loading: boolean; error?: string }) {
  return (
    <section className="rounded-lg border bg-card p-4" aria-labelledby="summary-title" aria-busy={loading}>
      <h3 id="summary-title" className="font-semibold">Cotización del pedido</h3>
      {loading && <p role="status" className="mt-3 text-sm">Verificando precios, stock, entrega y tasa de cambio…</p>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {!quote && !loading && !error && <p className="mt-3 text-sm text-muted-foreground">Selecciona una dirección para consultar el total.</p>}
      {quote && !loading && !error && (
        <>
          <ul className="mt-3 max-h-60 space-y-2 overflow-y-auto text-sm">
            {quote.items.map(item => (
              <li key={item.product_id} className="flex justify-between gap-3">
                <span>{item.quantity} × {item.name}</span>
                <span className="shrink-0">{formatMoney(item.total_usd, 'USD')}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-2 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{formatMoney(quote.subtotal_usd, 'USD')}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt>Entrega</dt>
              <dd>
                {quote.delivery_fee_usd === 0 ? (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    ¡Gratis!
                  </span>
                ) : (
                  formatMoney(quote.delivery_fee_usd, 'USD')
                )}
              </dd>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <dt>Total USD</dt>
              <dd>{formatMoney(quote.total_usd, 'USD')}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Total VES</dt>
              <dd>{formatMoney(quote.total_ves, 'VES')}</dd>
            </div>
          </dl>
          {quote.delivery_fee_usd === 0 && quote.subtotal_usd >= 40 && (
            <div className="mt-2.5 rounded-md bg-emerald-50 p-2 text-xs font-medium text-emerald-800">
              ✓ Calificas para envío gratis por compras mayores a $40 USD
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            1 USD = {quote.exchange_rate} VES · {isDemoMode() ? 'Tasa capturada o configurada en el demo, no cotización en vivo' : 'Tasa publicada'} {formatDateTime(quote.rate_updated_at)}. Mínimo en productos: {formatMoney(quote.min_order_usd, 'USD')}.
          </p>
        </>
      )}
    </section>
  );
}
