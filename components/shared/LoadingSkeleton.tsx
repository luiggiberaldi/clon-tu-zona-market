import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';

export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return <div className="space-y-2" role="status" aria-label="Cargando contenido">{Array.from({ length: lines }, (_, index) => <Skeleton key={index} className={cn('h-4 w-full', index === lines - 1 && 'w-2/3')} />)}</div>;
}
export function ProductCardSkeleton() {
  return <div className="space-y-3 rounded-xl border p-4"><Skeleton className="aspect-square rounded-lg" /><Skeleton className="h-5 w-1/2" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /><Skeleton className="mt-4 h-9 w-full rounded-full" /></div>;
}
export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return <div className="product-grid" role="status" aria-label="Cargando productos">{Array.from({ length: count }, (_, index) => <ProductCardSkeleton key={index} />)}</div>;
}
