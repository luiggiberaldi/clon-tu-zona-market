import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { hasSupabaseConfig, isDemoMode } from '@/lib/config';
import { makeDemoServerClient } from '@/lib/demo/server-client';
import { productPriceUsd } from '@/lib/demo/pricing';
import { syncExchangeRateDeduped } from '@/lib/rates-sync';
import { syncCatalogToSupabase } from '@/lib/catalog-sync';
import catalog from '@/lib/demo/source-catalog.json';
import type { ProductFilters, ProductWithCategory, Category, State, City, Area } from '@/types';
import type { CheckoutConfig, PaymentMethodConfig } from '@/types/commerce';

function publicClient() {
  if (isDemoMode()) return makeDemoServerClient(null);
  if (!hasSupabaseConfig()) throw new Error('La tienda todavía no está conectada a Supabase.');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) }
  });
}
function finite(value: number | undefined, fallback: number, maximum = 10000) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(1, Math.floor(value))) : fallback;
}
export async function getCatalog(filters: ProductFilters = {}): Promise<{ data: ProductWithCategory[]; total: number; page: number; pageSize: number; hasMore: boolean; error?: string }> {
  const page = finite(filters.page, 1);
  const pageSize = finite(filters.pageSize, 24, 60);
  const empty = { data: [] as ProductWithCategory[], total: 0, page, pageSize, hasMore: false };
  try {
    const categoryIds = new Set<string>();
    if (filters.category) {
      categoryIds.add(filters.category);
      const categories = await getCategories();
      for (let remaining = categories.length; remaining > 0; remaining--) {
        const before = categoryIds.size;
        for (const category of categories) if (category.parent_id && categoryIds.has(category.parent_id)) categoryIds.add(category.id);
        if (categoryIds.size === before) break;
      }
    }
    if (isDemoMode()) {
      const result = await publicClient().from('products').select('*, category:categories(id,name,slug)').eq('is_active', true);
      if (result.error) throw result.error;
      const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
      let rows = (result.data as ProductWithCategory[]).filter(product => {
        const ids = [product.category_id, ...((product.metadata?.source_category_ids as string[] | undefined) || [])];
        const value = productPriceUsd(product);
        return (!filters.category || ids.some(id => !!id && categoryIds.has(id))) &&
          (!filters.search || normalize(product.name + ' ' + (product.sku || '')).includes(normalize(filters.search))) &&
          (filters.isOffer === undefined || product.is_offer === filters.isOffer) &&
          (filters.minPrice === undefined || value >= filters.minPrice) &&
          (filters.maxPrice === undefined || value <= filters.maxPrice);
      });
      rows = [...rows].sort((a,b) => filters.sort === 'price_asc' ? productPriceUsd(a)-productPriceUsd(b) : filters.sort === 'price_desc' ? productPriceUsd(b)-productPriceUsd(a) : filters.sort === 'name_asc' ? a.name.localeCompare(b.name,'es') : b.created_at.localeCompare(a.created_at));
      return { data: rows.slice((page-1)*pageSize,page*pageSize), total: rows.length, page, pageSize, hasMore: page*pageSize<rows.length };
    }
    void syncCatalogToSupabase().catch(() => undefined);
    let query = publicClient().from('products').select('*, category:categories(id,name,slug)', { count: 'exact' }).eq('is_active', true);
    if (filters.category) query = query.in('category_id', [...categoryIds]);
    if (filters.search) query = query.ilike('name', '%' + filters.search.slice(0, 100).replace(/[%_\\]/g, '') + '%');
    if (typeof filters.minPrice === 'number' && Number.isFinite(filters.minPrice)) query = query.gte('price_usd', Math.max(0, filters.minPrice));
    if (typeof filters.maxPrice === 'number' && Number.isFinite(filters.maxPrice)) query = query.lte('price_usd', Math.max(0, filters.maxPrice));
    if (filters.isOffer !== undefined) query = query.eq('is_offer', filters.isOffer);
    const sort = filters.sort;
    query = query.order(sort === 'price_asc' || sort === 'price_desc' ? 'price_usd' : sort === 'name_asc' ? 'name' : 'created_at', { ascending: sort === 'price_asc' || sort === 'name_asc' }).order('id');
    const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
    if (!error && typeof count === 'number' && count >= 500) {
      return { data: (data || []) as unknown as ProductWithCategory[], total: count, page, pageSize, hasMore: page * pageSize < count };
    }
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    let rows = (catalog.products as unknown as ProductWithCategory[]).filter(product => {
      const ids = [product.category_id, ...((product.metadata?.source_category_ids as string[] | undefined) || [])];
      const value = productPriceUsd(product);
      return (!filters.category || ids.some(id => !!id && categoryIds.has(id))) &&
        (!filters.search || normalize(product.name + ' ' + (product.sku || '')).includes(normalize(filters.search))) &&
        (filters.isOffer === undefined || product.is_offer === filters.isOffer) &&
        (filters.minPrice === undefined || value >= filters.minPrice) &&
        (filters.maxPrice === undefined || value <= filters.maxPrice);
    });
    rows = [...rows].sort((a,b) => filters.sort === 'price_asc' ? productPriceUsd(a)-productPriceUsd(b) : filters.sort === 'price_desc' ? productPriceUsd(b)-productPriceUsd(a) : filters.sort === 'name_asc' ? a.name.localeCompare(b.name,'es') : b.created_at.localeCompare(a.created_at));
    return { data: rows.slice((page-1)*pageSize,page*pageSize), total: rows.length, page, pageSize, hasMore: page*pageSize<rows.length };
  } catch {
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    let rows = (catalog.products as unknown as ProductWithCategory[]).filter(product => {
      const value = productPriceUsd(product);
      return (!filters.search || normalize(product.name + ' ' + (product.sku || '')).includes(normalize(filters.search))) &&
        (filters.isOffer === undefined || product.is_offer === filters.isOffer) &&
        (filters.minPrice === undefined || value >= filters.minPrice) &&
        (filters.maxPrice === undefined || value <= filters.maxPrice);
    });
    rows = [...rows].sort((a,b) => filters.sort === 'price_asc' ? productPriceUsd(a)-productPriceUsd(b) : filters.sort === 'price_desc' ? productPriceUsd(b)-productPriceUsd(a) : filters.sort === 'name_asc' ? a.name.localeCompare(b.name,'es') : b.created_at.localeCompare(a.created_at));
    return { data: rows.slice((page-1)*pageSize,page*pageSize), total: rows.length, page, pageSize, hasMore: page*pageSize<rows.length };
  }
}
export async function getCategories(): Promise<Category[]> {
  try {
    if (hasSupabaseConfig()) {
      const { data, error } = await publicClient().from('categories').select('*').eq('is_active', true).order('sort_order').order('name');
      if (!error && data && data.length >= 50) return data as Category[];
    }
  } catch {}
  return (catalog.categories as unknown as Category[]);
}
export async function getProduct(slug: string): Promise<ProductWithCategory | null> {
  try {
    if (hasSupabaseConfig()) {
      const { data, error } = await publicClient().from('products').select('*, category:categories(id,name,slug)').eq('slug', slug).eq('is_active', true).maybeSingle();
      if (!error && data) return data as unknown as ProductWithCategory;
    }
  } catch {}
  const found = catalog.products.find(p => p.slug === slug);
  return (found as unknown as ProductWithCategory) || null;
}
export async function getZones(): Promise<{ states: State[]; cities: City[]; areas: Area[] }> {
  if (!hasSupabaseConfig() && !isDemoMode()) return { states: [], cities: [], areas: [] };
  const client = publicClient();
  const [states, cities, areas] = await Promise.all(['states', 'cities', 'areas'].map(table => client.from(table).select('*').eq('is_active', true).order('name')));
  if (states?.error || cities?.error || areas?.error) throw new Error('No se pudieron cargar las zonas.');
  const stateRows = (states?.data || []) as State[];
  const cityRows = ((cities?.data || []) as City[]).filter(c => stateRows.some(s => s.id === c.state_id));
  return { states: stateRows, cities: cityRows, areas: ((areas?.data || []) as Area[]).filter(a => cityRows.some(c => c.id === a.city_id)) };
}
export async function getCheckoutConfig(): Promise<CheckoutConfig> {
  const defaults: CheckoutConfig = {
    payment_methods: [], exchange_rate: null, rate_updated_at: null,
    delivery_hours: { start: '09:00', end: '19:00', cutoff_time: '17:00', slot_capacity: 20, lead_minutes: 60, horizon_days: 7 }
  };
  if (!hasSupabaseConfig() && !isDemoMode()) return defaults;
  const client = publicClient();
  // Autocuración: si la tasa publicada expiró, intenta sincronizarla con la
  // tasa BCV en vivo antes de leerla (antiduplicado; solo service-role).
  void syncExchangeRateDeduped().catch(() => undefined);
  const [settings, methods] = await Promise.all([
    client.from('settings').select('key,value').in('key', ['exchange_rate', 'delivery_hours']),
    client.from('payment_methods').select('*').eq('enabled', true)
  ]);
  if (settings.error || methods.error) return defaults;
  const rows = settings.data as Array<{ key: string; value: { usd_to_ves?: number; updated_at?: string } & Partial<CheckoutConfig['delivery_hours']> }> | null;
  const rate = rows?.find(s => s.key === 'exchange_rate')?.value;
  const hours = rows?.find(s => s.key === 'delivery_hours')?.value;
  const age = Date.now() - Date.parse(rate?.updated_at || '');
  const fresh = Number.isFinite(age) && age >= 0 && (isDemoMode() || age <= 86400000) && typeof rate?.usd_to_ves === 'number' && Number.isFinite(rate.usd_to_ves) && rate.usd_to_ves > 0;
  return { payment_methods: (methods.data || []) as PaymentMethodConfig[], exchange_rate: fresh ? Number(rate.usd_to_ves) : null, rate_updated_at: rate?.updated_at || null, delivery_hours: { ...defaults.delivery_hours, ...(hours || {}) } };
}
export async function getStorefrontSettings() {
  const { exchange_rate, rate_updated_at, payment_methods } = await getCheckoutConfig();
  return { exchange_rate, rate_updated_at, payment_methods };
}
