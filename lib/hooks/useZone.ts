import { createBrowserSupabase } from '@/lib/supabase/client';
import { useZoneStore } from '@/store/zoneStore';

export function useZone() {
  const state = useZoneStore((s) => s.state);
  const city = useZoneStore((s) => s.city);
  const area = useZoneStore((s) => s.area);
  const hydrated = useZoneStore((s) => s.hydrated);
  const setState = useZoneStore((s) => s.setState);
  const setCity = useZoneStore((s) => s.setCity);
  const setArea = useZoneStore((s) => s.setArea);
  const clear = useZoneStore((s) => s.clear);

  const persistArea = async () => {
    const supabase = createBrowserSupabase();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('users').update({ updated_at: new Date().toISOString() }).eq('id', user.id);
  };

  return {
    state,
    city,
    area,
    hydrated,
    hasZone: Boolean(state && city && area),
    setState,
    setCity,
    setArea,
    clear,
    persistArea
  };
}
