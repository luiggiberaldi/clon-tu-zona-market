'use client';
import { useRef } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CartItem } from '@/components/cart/CartItem';
import { EmptyCart } from '@/components/cart/EmptyCart';
import { useCartStore, selectCartSubtotalUsd } from '@/store/cartStore';
import { PriceDisplay } from '@/components/shared/PriceDisplay';

export function CartDrawer() {
  const isOpen = useCartStore(state => state.isOpen);
  const toggle = useCartStore(state => state.toggleDrawer);
  const close = useCartStore(state => state.closeDrawer);
  const items = useCartStore(state => state.items);
  const subtotal = useCartStore(selectCartSubtotalUsd);
  const count = items.reduce((sum, line) => sum + line.quantity, 0);
  const previousFocus = useRef<HTMLElement | null>(null);
  return <Dialog.Root open={isOpen} onOpenChange={toggle}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/45" />
    <Dialog.Content className="fixed inset-y-0 right-0 z-[71] flex w-full max-w-md flex-col bg-background shadow-xl" onOpenAutoFocus={() => { previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }} onCloseAutoFocus={event => { event.preventDefault(); previousFocus.current?.focus(); }}>
      <div className="flex items-center justify-between border-b p-4"><div><Dialog.Title className="text-lg font-semibold">Tu carrito ({count})</Dialog.Title><Dialog.Description className="text-xs text-muted-foreground">Revisa las cantidades antes de continuar.</Dialog.Description></div><Dialog.Close asChild><button type="button" aria-label="Cerrar carrito" className="rounded p-2 hover:bg-secondary"><X size={20} /></button></Dialog.Close></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">{items.length ? <div className="divide-y">{items.map(line => <CartItem key={line.product.id} line={line} />)}</div> : <EmptyCart compact />}</div>
      {items.length > 0 && (
        <div className="space-y-3 border-t p-4">
          <div className="rounded-lg border border-amber-200/80 bg-amber-50/70 p-2.5 text-xs dark:border-amber-900/50 dark:bg-amber-950/20">
            {subtotal >= 40 ? (
              <div className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-300">
                <span>🎉</span>
                <span>¡Calificas para <strong>Envío GRATIS</strong>!</span>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between font-medium text-foreground">
                  <span className="text-stone-800 dark:text-stone-200">Envío gratis desde $40</span>
                  <span className="inline-flex items-center rounded-md bg-amber-200/80 px-2 py-0.5 text-xs font-bold text-amber-950 dark:bg-amber-900/70 dark:text-amber-100">
                    Faltan ${(40 - subtotal).toFixed(2)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-200/60 dark:bg-slate-700">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.round((subtotal / 40) * 100))}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-sm font-semibold">Subtotal estimado</span>
              <p className="text-[11px] text-muted-foreground">En $ y Bs al cambio</p>
            </div>
            <div className="text-right">
              <PriceDisplay usd={subtotal} size="md" showBoth className="text-right" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Envío y disponibilidad se verifican en el checkout.</p>
          <Button asChild className="w-full">
            <Link href="/carrito" onClick={close}>Ver carrito</Link>
          </Button>
          <Button asChild variant="secondary" className="w-full">
            <Link href="/checkout" onClick={close}>Continuar al checkout</Link>
          </Button>
        </div>
      )}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
