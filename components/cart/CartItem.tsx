'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PriceDisplay } from '@/components/shared/PriceDisplay';
import { useCart } from '@/lib/hooks/useCart';
import { cartQuantity, type CartLine } from '@/store/cartStore';
import { productPriceUsd } from '@/lib/demo/pricing';

export function CartItem({ line }: { line: CartLine }) {
  const { updateQuantity, removeItem } = useCart();
  const { product, quantity } = line;

  return (
    <div className="flex gap-3 py-3">
      <Link
        href={`/productos/${product.slug}`}
        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted"
      >
        {product.images[0] ? (
          <Image
            src={product.images[0] ?? '/images/placeholder.png'}
            alt={product.name}
            fill
            sizes="80px"
            className="object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            s/img
          </div>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          href={`/productos/${product.slug}`}
          className="line-clamp-2 text-sm font-medium hover:underline"
        >
          {product.name}
        </Link>
        <PriceDisplay usd={productPriceUsd(product)} size="sm" showBoth />

        <div className="mt-auto flex flex-wrap items-center gap-1">
          <div className="flex items-center rounded-md border">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => updateQuantity(product.id, quantity - 1)}
              aria-label="Reducir"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="w-8 text-center text-sm" aria-live="polite">
              {quantity}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => updateQuantity(product.id, quantity + 1)}
              disabled={quantity >= cartQuantity(product, 99)}
              aria-label="Aumentar"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={() => removeItem(product.id)}
            aria-label="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
