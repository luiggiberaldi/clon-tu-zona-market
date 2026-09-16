'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useCart } from '@/lib/hooks/useCart';
import { formatMoney } from '@/lib/utils/formatters';
import { PriceDisplay } from '@/components/shared/PriceDisplay';

export function CartSummary({ showCheckout = true }: { showCheckout?: boolean }) {
  const { items, subtotalUsd, count } = useCart();
  if (!items.length) return null;
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-semibold">Resumen estimado</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <dt>{count} unidades</dt>
          <dd>{formatMoney(subtotalUsd, 'USD')}</dd>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <dt>Entrega</dt>
          <dd>Se calcula al continuar</dd>
        </div>
        <div className="flex items-start justify-between border-t pt-2">
          <div>
            <dt className="font-semibold">Subtotal estimado</dt>
            <p className="text-[11px] text-muted-foreground">En $ y Bs al cambio</p>
          </div>
          <dd className="text-right font-semibold">
            <PriceDisplay usd={subtotalUsd} size="md" showBoth className="text-right" />
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        El precio final, el stock, el mínimo de compra y el envío se verifican según tu dirección. La conversión VES requiere una tasa vigente.
      </p>
      {showCheckout && (
        <Button asChild className="mt-4 w-full">
          <Link href="/checkout">Continuar al checkout</Link>
        </Button>
      )}
    </div>
  );
}

