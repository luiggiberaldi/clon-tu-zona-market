import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { State, City, Area } from '@/types/database';
import { ZONE_STORAGE_KEY } from '@/lib/utils/constants';

interface ZoneState {
  state: Pick<State, 'id' | 'name'> | null;
  city: Pick<City, 'id' | 'name' | 'delivery_fee_usd' | 'min_order_usd'> | null;
  area: Pick<Area, 'id' | 'name' | 'delivery_time_minutes'> | null;
  hydrated: boolean;
  setState: (s: ZoneState['state']) => void;
  setCity: (c: ZoneState['city']) => void;
  setArea: (a: ZoneState['area']) => void;
  clear: () => void;
  setHydrated: () => void;
}

export const useZoneStore = create<ZoneState>()(
  persist(
    (set) => ({
      state: null,
      city: null,
      area: null,
      hydrated: false,
      setState: (state) => set({ state, city: null, area: null }),
      setCity: (city) => set({ city, area: null }),
      setArea: (area) => set({ area }),
      clear: () => set({ state: null, city: null, area: null }),
      setHydrated: () => set({ hydrated: true })
    }),
    {
      name: ZONE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => state?.setHydrated()
    }
  )
);

export function selectZoneLabel(state: ZoneState): string {
  const parts = [state.area?.name, state.city?.name, state.state?.name].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Selecciona tu zona';
}

export function selectHasZone(state: ZoneState): boolean {
  return Boolean(state.state && state.city && state.area);
}
