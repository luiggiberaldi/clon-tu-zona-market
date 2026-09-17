import Link from 'next/link';
import {
  Apple,
  Beef,
  Croissant,
  CupSoda,
  Globe,
  HeartHandshake,
  LayoutGrid,
  Leaf,
  Milk,
  Pill,
  Snowflake,
  SprayCan,
  Wheat,
  ChevronRight,
  type LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { Category } from '@/types';

type NavCategory = Pick<Category, 'id' | 'name' | 'slug'> & Partial<Pick<Category, 'parent_id'>>;

const icons: Record<string, LucideIcon> = {
  // Despensa y Alimentos
  alimentos: Wheat,
  despensa: Wheat,
  'pan-harinas-cereales': Wheat,

  // Frutas y Verduras
  'frutas-y-verduras': Apple,
  'frutas-y-vegetales': Apple,

  // Carnicería y Pescadería
  'carniceria-y-pescaderia': Beef,
  carniceria: Beef,

  // Panadería, Pastelería y Charcutería
  'panaderia-pasteleria-y-charcuteria': Croissant,
  panaderia: Croissant,

  // Farmacia y Salud
  farmacia: Pill,
  saludable: Leaf,

  // Limpieza y Hogar
  'limpieza-y-hogar': SprayCan,
  'cuidado-personal': HeartHandshake,

  // Bebidas y Lácteos
  bebidas: CupSoda,
  'lacteos-y-huevos': Milk,
  'leches-y-huevos': Milk,

  // Congelados e Importados
  'congelados-y-refrigerados': Snowflake,
  importado: Globe
};

function resolveCategoryIcon(slug: string): LucideIcon {
  if (icons[slug]) return icons[slug];
  const s = slug.toLowerCase();
  if (s.includes('fruta') || s.includes('verdura') || s.includes('vegetal')) return Apple;
  if (s.includes('carne') || s.includes('pescad') || s.includes('pollo') || s.includes('res') || s.includes('cerdo')) return Beef;
  if (s.includes('pan') || s.includes('pasteler') || s.includes('charcuter')) return Croissant;
  if (s.includes('farma') || s.includes('medic') || s.includes('salud')) return Pill;
  if (s.includes('limp') || s.includes('hogar')) return SprayCan;
  if (s.includes('bebid') || s.includes('jugo') || s.includes('cafe')) return CupSoda;
  if (s.includes('congel') || s.includes('refriger') || s.includes('hielo')) return Snowflake;
  if (s.includes('import')) return Globe;
  if (s.includes('saludable') || s.includes('organ') || s.includes('fit')) return Leaf;
  if (s.includes('lacteo') || s.includes('leche') || s.includes('queso')) return Milk;
  if (s.includes('cuidado') || s.includes('higiene') || s.includes('belleza')) return HeartHandshake;
  return Wheat;
}

export function CategoryNav({ categories, className, activeSlug, tiles = false }: { categories: NavCategory[]; className?: string; activeSlug?: string; tiles?: boolean }) {
  const activeCategory = categories.find((c) => c.slug === activeSlug);
  const parents = categories.filter((c) => !c.parent_id);
  const descendants = activeCategory ? categories.filter(c => c.parent_id === activeCategory.id) : [];
  const children = descendants.length ? descendants : activeCategory ? categories.filter(c => c.parent_id === activeCategory.parent_id && c.parent_id) : [];
  const parentCategory = descendants.length
    ? activeCategory
    : activeCategory?.parent_id
      ? categories.find(c => c.id === activeCategory.parent_id)
      : undefined;
  const ancestry: NavCategory[] = []; let ancestor = activeCategory; const seen = new Set<string>();
  while (ancestor && !seen.has(ancestor.id)) { seen.add(ancestor.id); ancestry.unshift(ancestor); ancestor = categories.find(c => c.id === ancestor?.parent_id); }
  return (
    <div className={className}>
      <nav className={cn(tiles ? 'category-tiles' : 'category-chips')} aria-label="Categorías del supermercado">
        <Link href="/productos" aria-current={!activeSlug ? 'page' : undefined} className={cn(!activeSlug && 'active')}><span className="category-icon"><LayoutGrid size={tiles ? 26 : 15} strokeWidth={1.6} /></span><span>Todo el mercado</span></Link>
        {parents.map((category) => { const Icon = resolveCategoryIcon(category.slug); return <Link key={category.id} href={`/categorias/${category.slug}`} className={cn((activeSlug === category.slug || activeCategory?.parent_id === category.id) && 'active')} aria-current={activeSlug === category.slug ? 'page' : undefined}><span className="category-icon"><Icon size={tiles ? 28 : 15} strokeWidth={1.6} /></span><span>{category.name}</span></Link>; })}
      </nav>
      {!tiles && ancestry.length > 1 && (
        <nav className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" aria-label="Jerarquía de categorías">
          {ancestry.map((category, idx) => (
            <span key={category.id} className="inline-flex items-center gap-1.5">
              {idx > 0 && <ChevronRight size={12} className="opacity-50" />}
              <Link
                href={`/categorias/${category.slug}`}
                className={cn('hover:text-foreground transition-colors', activeSlug === category.slug && 'font-semibold text-foreground underline decoration-[#FFEB01] underline-offset-4')}
                aria-current={activeSlug === category.slug ? 'page' : undefined}
              >
                {category.name}
              </Link>
            </span>
          ))}
        </nav>
      )}
      {!tiles && children.length > 0 && (
        <div className="mt-3 border-t border-dashed border-[#EAE4D5] pt-2.5">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 font-semibold text-foreground/85">
              <ChevronRight size={13} className="text-amber-600 dark:text-amber-400" />
              <span>Subcategorías{parentCategory ? `: ${parentCategory.name}` : ''}</span>
              <span className="rounded-full bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                {children.length}
              </span>
            </span>
            <span className="text-[11px] font-medium text-muted-foreground/70 flex items-center gap-1">
              Desliza para ver más <span aria-hidden="true">→</span>
            </span>
          </div>
          <nav
            className="subcategory-chips -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-2 pt-0.5 sm:mx-0 sm:px-0"
            aria-label="Subcategorías"
          >
            {parentCategory && (
              <Link
                href={`/categorias/${parentCategory.slug}`}
                aria-current={activeSlug === parentCategory.slug ? 'page' : undefined}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                  activeSlug === parentCategory.slug
                    ? 'active border-[#D4C200] bg-[#FFFBD1] text-[#614F00] font-bold ring-1 ring-[#D4C200] dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-600'
                    : 'border-[#EAE4D5] bg-white text-[#3B464F] hover:border-[#D4C200] hover:bg-[#FFFBD1]/60 dark:bg-card dark:border-border dark:text-foreground'
                )}
              >
                Todas ({children.length})
              </Link>
            )}
            {children.map((category) => (
              <Link
                key={category.id}
                href={`/categorias/${category.slug}`}
                aria-current={activeSlug === category.slug ? 'page' : undefined}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                  activeSlug === category.slug
                    ? 'active border-[#D4C200] bg-[#FFFBD1] text-[#614F00] font-bold ring-1 ring-[#D4C200] dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-600'
                    : 'border-[#EAE4D5] bg-white text-[#3B464F] hover:border-[#D4C200] hover:bg-[#FFFBD1]/60 dark:bg-card dark:border-border dark:text-foreground'
                )}
              >
                {category.name}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
