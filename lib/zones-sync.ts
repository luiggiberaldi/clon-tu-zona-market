import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/server';
import { canonicalState, canonicalCities, canonicalAreas } from '@/lib/data/carabobo-zones';

let _zonesSyncPromise: Promise<{ success: boolean; citiesCount: number; areasCount: number; error?: string }> | null = null;

export async function syncZonesToSupabase(force = false): Promise<{ success: boolean; citiesCount: number; areasCount: number; error?: string }> {
  if (_zonesSyncPromise) return _zonesSyncPromise;

  _zonesSyncPromise = (async () => {
    try {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return { success: false, citiesCount: 0, areasCount: 0, error: 'Falta configuración de Supabase o service role key.' };
      }

      const admin = createAdminSupabase();

      if (!force) {
        const [{ count: citiesCount }, { count: areasCount }] = await Promise.all([
          admin.from('cities').select('id', { count: 'exact', head: true }),
          admin.from('areas').select('id', { count: 'exact', head: true }),
        ]);
        if (
          typeof citiesCount === 'number' &&
          citiesCount >= canonicalCities.length &&
          typeof areasCount === 'number' &&
          areasCount >= canonicalAreas.length
        ) {
          return { success: true, citiesCount, areasCount };
        }
      }

      console.log(`[ZONES-SYNC] Sincronizando ${canonicalCities.length} ciudades y ${canonicalAreas.length} sectores a Supabase...`);

      // 1. State
      const { error: stateErr } = await admin.from('states').upsert(
        { id: canonicalState.id, name: canonicalState.name, is_active: true },
        { onConflict: 'id' }
      );
      if (stateErr) {
        console.error('[ZONES-SYNC] Error en states:', stateErr);
        return { success: false, citiesCount: 0, areasCount: 0, error: stateErr.message };
      }

      // 2. Cities
      for (const city of canonicalCities) {
        const { error: cityErr } = await admin.from('cities').upsert(
          {
            id: city.id,
            state_id: city.state_id,
            name: city.name,
            delivery_fee_usd: city.delivery_fee_usd,
            min_order_usd: city.min_order_usd,
            is_active: true
          },
          { onConflict: 'id' }
        );
        if (cityErr) {
          console.error(`[ZONES-SYNC] Error en city ${city.name}:`, cityErr);
        }
      }

      // 3. Areas (batch upsert)
      const areaBatches: Array<typeof canonicalAreas> = [];
      const batchSize = 30;
      for (let i = 0; i < canonicalAreas.length; i += batchSize) {
        areaBatches.push(canonicalAreas.slice(i, i + batchSize));
      }

      let syncedAreas = 0;
      for (const batch of areaBatches) {
        const { error: areaErr } = await admin.from('areas').upsert(
          batch.map(a => ({
            id: a.id,
            city_id: a.city_id,
            name: a.name,
            delivery_time_minutes: a.delivery_time_minutes,
            is_active: true
          })),
          { onConflict: 'id' }
        );
        if (areaErr) {
          console.error('[ZONES-SYNC] Error en lote de areas:', areaErr);
        } else {
          syncedAreas += batch.length;
        }
      }

      console.log(`[ZONES-SYNC] Completado: ${canonicalCities.length} ciudades y ${syncedAreas} sectores sincronizados.`);
      return { success: true, citiesCount: canonicalCities.length, areasCount: syncedAreas };
    } catch (err) {
      console.error('[ZONES-SYNC] Excepción fatal:', err);
      return { success: false, citiesCount: 0, areasCount: 0, error: err instanceof Error ? err.message : String(err) };
    } finally {
      _zonesSyncPromise = null;
    }
  })();

  return _zonesSyncPromise;
}
