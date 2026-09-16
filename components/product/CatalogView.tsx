import Link from 'next/link';
import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight, SearchX, PackageOpen, TriangleAlert } from 'lucide-react';
import { getCatalog, getCategories, getStorefrontSettings } from '@/lib/catalog';
import { ProductGrid } from '@/components/product/ProductCard';
import { ProductFilters } from '@/components/product/ProductFilters';
import { CategoryNav } from '@/components/shared/CategoryNav';
import type { ProductFilters as Filters } from '@/types';

export type CatalogSearch = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => typeof value === 'string' ? value : Array.isArray(value) ? value[value.length - 1] : undefined;
const price = (value: string | undefined) => value && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : undefined;
const sorts: NonNullable<Filters['sort']>[] = ['newest', 'price_asc', 'price_desc', 'name_asc'];

export function CatalogUnavailable({ message }: { message?: string }) {
  return <div role="alert" className="catalog-empty"><TriangleAlert size={34} strokeWidth={1.4} /><h2>No pudimos cargar el catálogo</h2><p>{message || 'El servicio no está disponible en este momento. Intenta nuevamente.'}</p><Link href="/productos" className="store-button">Volver a consultar</Link></div>;
}

export async function CatalogView({ query, categorySlug, offers = false }: { query: CatalogSearch; categorySlug?: string; offers?: boolean }) {
  const [categories, settings] = await Promise.all([getCategories(), getStorefrontSettings()]);
  const category = categorySlug ? categories.find((item) => item.slug === categorySlug) : categories.find((item) => item.id === first(query.category));
  const search = first(query.search)?.trim().slice(0, 120);
  const sort = first(query.sort) as Filters['sort'];
  const filters: Filters = { category: category?.id ?? (categorySlug ? undefined : first(query.category)), search, minPrice: price(first(query.minPrice)), maxPrice: price(first(query.maxPrice)), isOffer: offers || first(query.isOffer) === 'true' ? true : undefined, sort: sort && sorts.includes(sort) ? sort : 'newest', page: Math.max(1, Math.floor(Number(first(query.page))) || 1), pageSize: 12 };
  const result = await getCatalog(filters);
  if (categorySlug && !category && !result.error) notFound();
  const path = categorySlug ? `/categorias/${categorySlug}` : offers ? '/ofertas' : '/productos';
  const pageHref = (page: number) => { const params = new URLSearchParams(); for (const key of ['search', 'category', 'minPrice', 'maxPrice', 'sort', 'isOffer']) { const value = first(query[key]); if (value) params.set(key, value); } params.set('page', String(page)); return `${path}?${params.toString()}`; };
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  if (!result.error && result.page > pages) redirect(pageHref(pages));
  const title = search ? `Resultados para “${search}”` : category?.name ?? (offers ? 'Buenos precios, buenas compras' : 'Todo tu supermercado');
  return <div className="storefront-container catalog-page">
    <nav className="mb-5 flex items-center gap-2 text-xs text-muted-foreground" aria-label="Ruta de navegación"><Link href="/carabobo">Inicio</Link><ChevronRight size={12} /><span>{offers ? 'Ofertas' : category?.name ?? 'Supermercado'}</span></nav>
    <div className="catalog-heading"><div><p className="store-eyebrow">{offers ? 'LA SELECCIÓN DE OFERTAS' : 'TU COMPRA, A TU RITMO'}</p><h1>{title}</h1><p>{category?.description ?? (offers ? 'Descubre los productos con descuento publicado.' : 'Encuentra lo que necesitas para tu hogar, en un solo lugar.')}</p></div>{!result.error && <span className="catalog-count">{result.total} productos</span>}</div>
    <CategoryNav categories={categories} activeSlug={category?.slug} className="my-6" />
    <Suspense fallback={<div className="h-20 rounded-xl bg-secondary" />}><ProductFilters categoryId={category?.id} offerOnly={offers} totalCount={result.total} /></Suspense>
    <div className="mt-7">{result.error ? <CatalogUnavailable message={result.error} /> : result.data.length ? <ProductGrid products={result.data} rate={settings.exchange_rate} rateUpdatedAt={settings.rate_updated_at} /> : <div className="catalog-empty">{search ? <SearchX size={38} strokeWidth={1.4} /> : <PackageOpen size={38} strokeWidth={1.4} />}<h2>{search ? 'No encontramos coincidencias' : 'No hay productos para estos filtros'}</h2><p>Prueba otra búsqueda o revisa todas las categorías.</p><Link href="/productos" className="store-button">Ver todo el supermercado</Link></div>}</div>
    {!result.error && result.total > 0 && <nav className="catalog-pagination" aria-label="Paginación del catálogo">{result.page > 1 ? <Link href={pageHref(result.page - 1)} rel="prev"><ChevronLeft size={17} />Anterior</Link> : <span aria-disabled="true"><ChevronLeft size={17} />Anterior</span>}<p>Página <strong>{result.page}</strong> de {pages}</p>{result.hasMore ? <Link href={pageHref(result.page + 1)} rel="next">Siguiente<ChevronRight size={17} /></Link> : <span aria-disabled="true">Siguiente<ChevronRight size={17} /></span>}</nav>}
  </div>;
}
