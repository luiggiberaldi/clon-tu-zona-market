import type { Metadata } from 'next';
import { CatalogView, type CatalogSearch } from '@/components/product/CatalogView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ofertas', description: 'Consulta los productos con descuento publicado en nuestro supermercado.' };
export default async function OfertasPage({ searchParams }: { searchParams: Promise<CatalogSearch> }) {
  return <CatalogView query={await searchParams} offers />;
}
