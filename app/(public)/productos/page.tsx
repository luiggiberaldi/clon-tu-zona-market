import type { Metadata } from 'next';
import { CatalogView, type CatalogSearch } from '@/components/product/CatalogView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Supermercado', description: 'Explora nuestro catálogo, filtra por categoría y encuentra los productos para tu hogar.' };
export default async function ProductosPage({ searchParams }: { searchParams: Promise<CatalogSearch> }) {
  return <CatalogView query={await searchParams} />;
}
