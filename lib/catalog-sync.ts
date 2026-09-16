import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/server';
import catalog from '@/lib/demo/source-catalog.json';

let _syncPromise: Promise<{ success: boolean; count: number; error?: string }> | null = null;

export async function syncCatalogToSupabase(force = false): Promise<{ success: boolean; count: number; error?: string }> {
  if (_syncPromise) return _syncPromise;

  _syncPromise = (async () => {
    try {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return { success: false, count: 0, error: 'Falta configuración de Supabase o service role key.' };
      }

      const admin = createAdminSupabase();

      // Check current count
      if (!force) {
        const { count, error } = await admin.from('products').select('id', { count: 'exact', head: true });
        if (!error && typeof count === 'number' && count >= 500) {
          return { success: true, count };
        }
      }

      console.log(`[CATALOG-SYNC] Sincronizando ${catalog.categories.length} categorías y ${catalog.products.length} productos a Supabase...`);

      // 1. Upsert categories (parents first, then children)
      const pending = catalog.categories.map((c) => ({ ...c }));
      const inserted = new Set<string>();
      let guard = 0;

      while (pending.length > 0 && guard++ <= pending.length + 10) {
        const ready = pending.filter((c) => !c.parent_id || inserted.has(c.parent_id));
        if (ready.length === 0) {
          // Break potential cycle or orphan references
          for (const c of pending) {
            c.parent_id = null;
          }
          continue;
        }

        for (const row of ready) {
          const { error } = await admin.from('categories').upsert(
            {
              id: row.id,
              name: row.name,
              slug: row.slug,
              description: row.description,
              image_url: row.image_url,
              parent_id: row.parent_id,
              sort_order: row.sort_order ?? 0,
              is_active: row.is_active ?? true,
            },
            { onConflict: 'id' }
          );
          if (!error) {
            inserted.add(row.id);
          }
        }

        pending.length = 0;
        pending.push(...catalog.categories.filter((c) => !inserted.has(c.id)));
      }

      // 2. Upsert products in batches of 50
      const seenSkus = new Set<string>();
      const batchSize = 50;
      let insertedProducts = 0;

      for (let i = 0; i < catalog.products.length; i += batchSize) {
        const chunk = catalog.products.slice(i, i + batchSize);
        const rows = chunk.map((p) => {
          const sku = p.sku && !seenSkus.has(p.sku) ? (seenSkus.add(p.sku), p.sku) : null;
          return {
            id: p.id,
            name: p.name,
            slug: p.slug,
            description: p.description,
            category_id: p.category_id,
            price_usd: p.price_usd,
            price_ves: 0,
            stock_quantity: p.stock_quantity,
            min_stock: p.min_stock ?? 5,
            sku,
            barcode: p.barcode ?? sku,
            images: p.images,
            is_prime: false,
            is_offer: p.is_offer ?? false,
            offer_percentage: p.offer_percentage ?? null,
            is_active: true,
            metadata: p.metadata ?? {},
            created_at: p.created_at,
            updated_at: p.updated_at || p.created_at,
          };
        });

        const { error } = await admin.from('products').upsert(rows, { onConflict: 'id' });
        if (error) {
          console.error('[CATALOG-SYNC] Error en batch de productos:', error.message);
        } else {
          insertedProducts += rows.length;
        }
      }

      console.log(`[CATALOG-SYNC] Completado: ${insertedProducts} productos actualizados.`);
      return { success: true, count: insertedProducts };
    } catch (err) {
      console.error('[CATALOG-SYNC] Fallo inesperado:', err);
      return { success: false, count: 0, error: err instanceof Error ? err.message : String(err) };
    } finally {
      _syncPromise = null;
    }
  })();

  return _syncPromise;
}
