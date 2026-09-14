import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getProduct, getCatalog, getStorefrontSettings } from '@/lib/catalog';
import { CatalogUnavailable } from '@/components/product/CatalogView';
import { ProductDetail } from '@/components/product/ProductDetail';

type Props = { params: Promise<{ slug: string }> };
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  return { title: product?.name ?? 'Producto no encontrado', description: product?.description ?? undefined };
}
export default async function ProductoPage({ params }: Props) {
  const { slug } = await params;
  const [product, settings] = await Promise.all([getProduct(slug), getStorefrontSettings()]);
  if (!product) {
    const availability = await getCatalog({ pageSize: 1 });
    if (availability.error) return <div className="storefront-container py-8"><CatalogUnavailable message={availability.error} /></div>;
    notFound();
  }
  return <ProductDetail product={product} rate={settings.exchange_rate} rateUpdatedAt={settings.rate_updated_at} />;
}
