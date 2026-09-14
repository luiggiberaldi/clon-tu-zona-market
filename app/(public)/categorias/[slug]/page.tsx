import type { Metadata } from 'next';
import { getCategories } from '@/lib/catalog';
import { CatalogView, type CatalogSearch } from '@/components/product/CatalogView';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<CatalogSearch> };
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const categories = await getCategories();
  const category = categories.find((item) => item.slug === slug);
  return { title: category?.name ?? 'Categoría no encontrada', description: category?.description ?? undefined };
}
export default async function CategoriaPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  return <CatalogView query={query} categorySlug={slug} />;
}
