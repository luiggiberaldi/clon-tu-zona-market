import Link from 'next/link';
import { Apple, Milk, Croissant, CupSoda, SprayCan, Wheat, HeartHandshake, LayoutGrid, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { Category } from '@/types';

type NavCategory = Pick<Category, 'id' | 'name' | 'slug'> & Partial<Pick<Category, 'parent_id'>>;
const icons = { despensa: Wheat, 'frutas-y-vegetales': Apple, 'lacteos-y-huevos': Milk, panaderia: Croissant, bebidas: CupSoda, 'limpieza-y-hogar': SprayCan, 'cuidado-personal': HeartHandshake };
export function CategoryNav({ categories, className, activeSlug, tiles = false }: { categories: NavCategory[]; className?: string; activeSlug?: string; tiles?: boolean }) {
  const activeCategory = categories.find((c) => c.slug === activeSlug);
  const parents = categories.filter((c) => !c.parent_id);
  const descendants = activeCategory ? categories.filter(c => c.parent_id === activeCategory.id) : [];
  const children = descendants.length ? descendants : activeCategory ? categories.filter(c => c.parent_id === activeCategory.parent_id && c.parent_id) : [];
  const ancestry: NavCategory[] = []; let ancestor = activeCategory; const seen = new Set<string>();
  while (ancestor && !seen.has(ancestor.id)) { seen.add(ancestor.id); ancestry.unshift(ancestor); ancestor = categories.find(c => c.id === ancestor?.parent_id); }
  return (
    <div className={className}>
      <nav className={cn(tiles ? 'category-tiles' : 'category-chips')} aria-label="Categorías del supermercado">
        <Link href="/productos" aria-current={!activeSlug ? 'page' : undefined} className={cn(!activeSlug && 'active')}><span className="category-icon"><LayoutGrid size={tiles ? 26 : 15} strokeWidth={1.6} /></span><span>Todo el mercado</span></Link>
        {parents.map((category) => { const Icon = icons[category.slug as keyof typeof icons] ?? Wheat; return <Link key={category.id} href={`/categorias/${category.slug}`} className={cn((activeSlug === category.slug || activeCategory?.parent_id === category.id) && 'active')} aria-current={activeSlug === category.slug ? 'page' : undefined}><span className="category-icon"><Icon size={tiles ? 28 : 15} strokeWidth={1.6} /></span><span>{category.name}</span></Link>; })}
      </nav>
      {!tiles && ancestry.length > 1 && <nav className="mt-3 flex flex-wrap gap-2 text-xs" aria-label="Jerarquía de categorías">{ancestry.map(category => <Link key={category.id} href={`/categorias/${category.slug}`} className="text-primary underline" aria-current={activeSlug === category.slug ? 'page' : undefined}>{category.name}</Link>)}</nav>}
      {!tiles && children.length > 0 && <nav className="mt-3 flex flex-wrap items-center gap-2 text-xs" aria-label="Subcategorías"><ChevronRight size={14} className="text-muted-foreground" />{children.map((category) => <Link key={category.id} href={`/categorias/${category.slug}`} aria-current={activeSlug === category.slug ? 'page' : undefined} className={cn('rounded-full border px-3 py-2', activeSlug === category.slug && 'border-primary text-primary')}>{category.name}</Link>)}</nav>}
    </div>
  );
}
