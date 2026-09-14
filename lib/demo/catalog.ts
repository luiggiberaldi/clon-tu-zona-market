import type { ProductWithCategory, Category, State, City, Area } from '@/types';

const createdAt = '2026-09-01T12:00:00.000Z';
const categoryId = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const definitions = [
  ['Despensa', 'despensa', 'Los básicos para tus recetas de cada día.'],
  ['Frutas y vegetales', 'frutas-y-vegetales', 'Color y variedad para tu cocina.'],
  ['Lácteos y huevos', 'lacteos-y-huevos', 'Para el desayuno y mucho más.'],
  ['Panadería', 'panaderia', 'El complemento de tus momentos favoritos.'],
  ['Bebidas', 'bebidas', 'Opciones para acompañar cada comida.'],
  ['Limpieza y hogar', 'limpieza-y-hogar', 'Lo esencial para cuidar tu casa.'],
  ['Cuidado personal', 'cuidado-personal', 'Básicos de tu rutina diaria.'],
  ['Arroz y granos', 'arroz-y-granos', 'Una selección para tu despensa.']
];

export const demoCategories: Category[] = definitions.map(([name, slug, description], index) => ({
  id: categoryId(index + 1), name: name!, slug: slug!, description: description!,
  image_url: null, parent_id: index === 7 ? categoryId(1) : null,
  sort_order: index, is_active: true, created_at: createdAt
}));

type DemoDefinition = [name: string, slug: string, category: number, price: number, stock: number, image: string, offer?: number];
const products: DemoDefinition[] = [
  ['Harina de maíz · 1 kg', 'harina-de-maiz-demo', 1, 1.80, 45, 'corn', 15],
  ['Arroz blanco · 1 kg', 'arroz-blanco-demo', 8, 2.10, 60, 'rice', 10],
  ['Pasta larga · 500 g', 'pasta-larga-demo', 1, 1.65, 34, 'pasta'],
  ['Aceite vegetal · 900 ml', 'aceite-vegetal-demo', 1, 3.90, 22, 'oil', 12],
  ['Café molido · 250 g', 'cafe-molido-demo', 1, 4.20, 28, 'coffee'],
  ['Caraotas negras · 500 g', 'caraotas-negras-demo', 8, 2.45, 19, 'beans'],
  ['Tomates · 1 kg', 'tomates-demo', 2, 2.80, 16, 'tomato', 20],
  ['Cambur · 1 kg', 'cambur-demo', 2, 1.90, 25, 'banana'],
  ['Aguacates · 500 g', 'aguacates-demo', 2, 3.10, 12, 'avocado'],
  ['Leche completa · 1 l', 'leche-completa-demo', 3, 2.60, 35, 'milk', 10],
  ['Queso blanco · 500 g', 'queso-blanco-demo', 3, 4.50, 18, 'cheese'],
  ['Yogur natural · 500 g', 'yogur-natural-demo', 3, 3.20, 20, 'yogurt'],
  ['Pan de molde · 450 g', 'pan-de-molde-demo', 4, 2.75, 15, 'bread'],
  ['Avena en hojuelas · 400 g', 'avena-demo', 1, 2.30, 30, 'oats'],
  ['Jugo de naranja · 1 l', 'jugo-naranja-demo', 5, 2.95, 24, 'juice', 15],
  ['Lavaplatos líquido · 750 ml', 'lavaplatos-demo', 6, 3.40, 27, 'cleaner'],
  ['Detergente líquido · 1 l', 'detergente-demo', 6, 4.80, 16, 'detergent', 10],
  ['Jabón de manos · 300 ml', 'jabon-manos-demo', 7, 2.20, 0, 'soap']
];

// Fictional development fixtures, never a production fallback or live price feed.
export const demoProducts: ProductWithCategory[] = products.map(([name, slug, category, price, stock, image, offer], index) => {
  const categoryData = demoCategories[category - 1]!;
  return {
    id: `d0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name, slug, description: 'Producto ficticio de demostración. La ilustración, el precio y la disponibilidad son datos de prueba y no constituyen una oferta comercial.',
    category_id: categoryData.id, category: { id: categoryData.id, name: categoryData.name, slug: categoryData.slug },
    price_usd: price, price_ves: 0, stock_quantity: stock, min_stock: 5,
    sku: `DEMO-${String(index + 1).padStart(3, '0')}`, barcode: null,
    images: [`/storefront/${image}.svg`], is_prime: false, is_offer: Boolean(offer),
    offer_percentage: offer ?? null, is_active: true, metadata: { demo: true },
    created_at: createdAt, updated_at: createdAt
  };
});

const stateId = 'e0000000-0000-4000-8000-000000000001';
const cityId = 'e0000000-0000-4000-8000-000000000002';
export const demoZones: { states: State[]; cities: City[]; areas: Area[] } = {
  states: [{ id: stateId, name: 'Carabobo', is_active: true, created_at: createdAt }],
  cities: [{ id: cityId, state_id: stateId, name: 'Valencia', delivery_fee_usd: 3, min_order_usd: 10, is_active: true, created_at: createdAt }],
  areas: [{ id: 'e0000000-0000-4000-8000-000000000003', city_id: cityId, name: 'Zona de demostración', delivery_time_minutes: 60, is_active: true, created_at: createdAt }]
};
