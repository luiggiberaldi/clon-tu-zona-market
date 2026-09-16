'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SlidersHorizontal } from 'lucide-react';
import { SelectDropdown } from '@/components/ui/select-dropdown';

export function ProductFilters({ categoryId, offerOnly = false }: { categoryId?: string; offerOnly?: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <form key={params.toString()} action={pathname} className="catalog-filters">
      {params.get('search') && <input type="hidden" name="search" value={params.get('search')!} />}
      {categoryId && pathname === '/productos' && <input type="hidden" name="category" value={categoryId} />}
      <div className="filter-price"><SlidersHorizontal size={17} aria-hidden="true" /><span className="text-xs font-semibold">Precio USD</span><input type="number" name="minPrice" min="0" step="0.01" defaultValue={params.get('minPrice') ?? ''} placeholder="Desde" aria-label="Precio mínimo en USD" /><span className="text-muted-foreground">–</span><input type="number" name="maxPrice" min="0" step="0.01" defaultValue={params.get('maxPrice') ?? ''} placeholder="Hasta" aria-label="Precio máximo en USD" /></div>
      {!offerOnly && <label className="flex items-center gap-2 whitespace-nowrap text-xs font-medium"><input type="checkbox" name="isOffer" value="true" defaultChecked={params.get('isOffer') === 'true'} className="h-4 w-4 accent-green-700" />Solo ofertas</label>}
      <label className="filter-sort"><span>Ordenar</span><SelectDropdown name="sort" ariaLabel="Ordenar productos" defaultValue={params.get('sort') ?? 'newest'} options={[{ value: 'newest', label: 'Más recientes' }, { value: 'price_asc', label: 'Menor precio' }, { value: 'price_desc', label: 'Mayor precio' }, { value: 'name_asc', label: 'Nombre: A–Z' }]} /></label>
      <button type="submit" className="filter-apply">Aplicar</button><Link href={pathname} className="text-xs underline underline-offset-4">Limpiar</Link>
    </form>
  );
}
