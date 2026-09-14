import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';

export function EmptyCart({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'px-4 py-6 text-center' : 'flex min-h-[40vh] flex-col items-center justify-center text-center'}>
      <ShoppingCart className="h-12 w-12 text-muted-foreground" />
      <p className="mt-4 text-lg font-medium">Tu carrito está vacío</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Explora el catálogo y agrega productos para empezar.
      </p>
      <Button asChild className="mt-4">
        <Link href="/productos">Ver productos</Link>
      </Button>
    </div>
  );
}
