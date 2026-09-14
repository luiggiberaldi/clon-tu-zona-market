'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { EmptyCart } from '@/components/cart/EmptyCart';
import { CartItem } from '@/components/cart/CartItem';
import { CartSummary } from '@/components/cart/CartSummary';
import { useCartStore } from '@/store/cartStore';
import { useCart } from '@/lib/hooks/useCart';

export default function CarritoPage() {
  const items = useCartStore((s) => s.items);
  const hydrated = useCartStore((s) => s.hydrated);
  const { clear } = useCart();
  const { toast } = useToast();

  if (!hydrated) {
    return <div className="container-prose py-10" aria-busy="true" />;
  }

  if (!items.length) {
    return (
      <div className="container-prose py-10">
        <EmptyCart />
      </div>
    );
  }

  return (
    <div className="container-prose py-6 lg:py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold lg:text-3xl">Tu carrito</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (confirm('¿Vaciar el carrito?')) {
              clear();
              toast({ title: 'Carrito vaciado', variant: 'info' });
            }
          }}
        >
          Vaciar
        </Button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border bg-card">
          <div className="px-4 py-2 border-b text-sm font-medium">
            {items.length} producto{items.length === 1 ? '' : 's'}
          </div>
          <div className="divide-y px-4">
            {items.map((line) => (
              <CartItem key={line.product.id} line={line} />
            ))}
          </div>
        </div>

        <div>
          <CartSummary />
          <Button asChild variant="outline" className="mt-3 w-full">
            <Link href="/productos">
              <Plus className="h-4 w-4" />
              Seguir comprando
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
