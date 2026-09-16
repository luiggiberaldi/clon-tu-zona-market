'use client';

import { useRef, useTransition } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SlidersHorizontal, Tag, X, ArrowRight, RotateCcw, Check } from 'lucide-react';
import { SelectDropdown } from '@/components/ui/select-dropdown';

interface ProductFiltersProps {
  categoryId?: string;
  offerOnly?: boolean;
  totalCount?: number;
}

export function ProductFilters({ categoryId, offerOnly = false, totalCount }: ProductFiltersProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();

  const minPrice = searchParams.get('minPrice') ?? '';
  const maxPrice = searchParams.get('maxPrice') ?? '';
  const isOffer = searchParams.get('isOffer') === 'true';
  const sort = searchParams.get('sort') ?? 'newest';
  const search = searchParams.get('search');

  const hasActiveFilters = Boolean(minPrice || maxPrice || (isOffer && !offerOnly));

  function handleSortChange(nextSort: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextSort && nextSort !== 'newest') {
      nextParams.set('sort', nextSort);
    } else {
      nextParams.delete('sort');
    }
    nextParams.delete('page');
    startTransition(() => {
      router.push(`${pathname}?${nextParams.toString()}`);
    });
  }

  function handleOfferToggle() {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (isOffer) {
      nextParams.delete('isOffer');
    } else {
      nextParams.set('isOffer', 'true');
    }
    nextParams.delete('page');
    startTransition(() => {
      router.push(`${pathname}?${nextParams.toString()}`);
    });
  }

  function removeFilter(key: 'minPrice' | 'maxPrice' | 'isOffer') {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete(key);
    nextParams.delete('page');
    startTransition(() => {
      router.push(`${pathname}?${nextParams.toString()}`);
    });
  }

  const resetHref = (() => {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (categoryId && pathname === '/productos') p.set('category', categoryId);
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  })();

  return (
    <div className="space-y-3">
      <form
        ref={formRef}
        key={searchParams.toString()}
        action={pathname}
        className="catalog-filters-bar"
      >
        {search && <input type="hidden" name="search" value={search} />}
        {categoryId && pathname === '/productos' && (
          <input type="hidden" name="category" value={categoryId} />
        )}
        {/* Hidden inputs to preserve parameters on form submit */}
        {isOffer && <input type="hidden" name="isOffer" value="true" />}
        <input type="hidden" name="sort" value={sort} />

        {/* Grupo Izquierdo: Rango de Precio y Ofertas */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* Módulo de Rango de Precio */}
          <div className="flex items-center gap-1.5 rounded-xl border border-[#EAE4D5] bg-white px-2.5 py-1.5 shadow-2xs focus-within:border-[#ECA700] focus-within:ring-2 focus-within:ring-[#ECA700]/20 transition-all">
            <SlidersHorizontal size={15} className="text-[#5C6770] shrink-0" aria-hidden="true" />
            <span className="text-[11px] font-semibold text-[#5C6770] pr-0.5 hidden sm:inline">Precio</span>
            <div className="relative flex items-center">
              <span className="pointer-events-none absolute left-2 text-xs font-semibold text-[#5C6770]">$</span>
              <input
                type="number"
                name="minPrice"
                min="0"
                step="0.01"
                defaultValue={minPrice}
                placeholder="Mín"
                aria-label="Precio mínimo en USD"
                className="h-7 w-16 rounded-md bg-transparent pl-5 pr-1 text-xs text-[#14191D] placeholder:text-[#80939F] focus:outline-none"
              />
            </div>
            <span className="text-xs text-[#5C6770] font-light">–</span>
            <div className="relative flex items-center">
              <span className="pointer-events-none absolute left-2 text-xs font-semibold text-[#5C6770]">$</span>
              <input
                type="number"
                name="maxPrice"
                min="0"
                step="0.01"
                defaultValue={maxPrice}
                placeholder="Máx"
                aria-label="Precio máximo en USD"
                className="h-7 w-16 rounded-md bg-transparent pl-5 pr-1 text-xs text-[#14191D] placeholder:text-[#80939F] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              aria-label="Aplicar rango de precio"
              className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#ECA700] text-[#14191D] hover:bg-[#C68500] hover:text-white transition-colors cursor-pointer"
              title="Aplicar rango de precio"
            >
              <ArrowRight size={13} strokeWidth={2.5} />
            </button>
          </div>

          {/* Botón Píldora de Solo Ofertas */}
          {!offerOnly && (
            <button
              type="button"
              onClick={handleOfferToggle}
              aria-pressed={isOffer}
              className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-all cursor-pointer select-none ${
                isOffer
                  ? 'border-[#ECA700] bg-[#FFF4D1] text-[#14191D] font-semibold shadow-2xs'
                  : 'border-[#EAE4D5] bg-white text-[#5C6770] hover:border-[#ECA700]/70 hover:text-[#14191D]'
              }`}
            >
              <Tag size={14} className={isOffer ? 'text-[#ECA700] fill-[#ECA700]/20' : 'text-[#5C6770]'} />
              <span>Solo ofertas</span>
              {isOffer && <Check size={13} className="text-[#ECA700] stroke-[2.5]" />}
            </button>
          )}
        </div>

        {/* Grupo Derecho: Conteo + Ordenar + Limpiar */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 ml-auto">
          {totalCount !== undefined && (
            <span className="hidden lg:inline-block text-xs text-muted-foreground mr-1">
              <strong>{totalCount}</strong> productos
            </span>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#5C6770] whitespace-nowrap hidden sm:inline font-medium">
              Ordenar por
            </span>
            <SelectDropdown
              name="sort"
              ariaLabel="Ordenar productos"
              value={sort}
              onChange={handleSortChange}
              className="w-40 sm:w-44"
              options={[
                { value: 'newest', label: 'Más recientes' },
                { value: 'price_asc', label: 'Menor precio' },
                { value: 'price_desc', label: 'Mayor precio' },
                { value: 'name_asc', label: 'Nombre: A–Z' }
              ]}
            />
          </div>

          {hasActiveFilters && (
            <Link
              href={resetHref}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-dashed border-[#EAE4D5] bg-white px-3 text-xs font-medium text-[#5C6770] hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive transition-all"
              title="Limpiar todos los filtros"
            >
              <RotateCcw size={13} />
              <span className="hidden sm:inline">Limpiar</span>
            </Link>
          )}
        </div>
      </form>

      {/* Chips de filtros activos */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Filtros activos:
          </span>
          {isOffer && !offerOnly && (
            <button
              type="button"
              onClick={() => removeFilter('isOffer')}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF4D1] border border-[#ECA700]/50 px-2.5 py-1 text-xs font-medium text-[#14191D] hover:bg-[#FFE8A3] transition-colors cursor-pointer"
            >
              <Tag size={12} className="text-[#ECA700]" />
              Solo ofertas
              <X size={13} className="text-muted-foreground hover:text-[#14191D]" />
            </button>
          )}
          {minPrice && (
            <button
              type="button"
              onClick={() => removeFilter('minPrice')}
              className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#EAE4D5] px-2.5 py-1 text-xs font-medium text-[#14191D] hover:border-destructive hover:text-destructive transition-colors cursor-pointer"
            >
              Mín: ${minPrice}
              <X size={13} className="text-muted-foreground" />
            </button>
          )}
          {maxPrice && (
            <button
              type="button"
              onClick={() => removeFilter('maxPrice')}
              className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#EAE4D5] px-2.5 py-1 text-xs font-medium text-[#14191D] hover:border-destructive hover:text-destructive transition-colors cursor-pointer"
            >
              Máx: ${maxPrice}
              <X size={13} className="text-muted-foreground" />
            </button>
          )}
          <Link
            href={resetHref}
            className="text-xs text-muted-foreground underline hover:text-[#14191D] ml-1"
          >
            Borrar todos
          </Link>
        </div>
      )}
    </div>
  );
}
