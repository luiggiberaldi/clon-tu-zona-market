'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Building2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/utils/formatters';
import type { State, City, Area } from '@/types';

export function ZoneManager({
  states,
  cities,
  areas
}: {
  states: State[];
  cities: City[];
  areas: Area[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [newState, setNewState] = useState('');
  const [loading, setLoading] = useState(false);

  async function addState(e: React.FormEvent) {
    e.preventDefault();
    if (!newState.trim()) return;
    setLoading(true);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.from('states').insert({ name: newState.trim() });
    setLoading(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'error' });
      return;
    }
    setNewState('');
    toast({ title: 'Estado agregado', variant: 'success' });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={addState} className="flex gap-2">
        <Input
          value={newState}
          onChange={(e) => setNewState(e.target.value)}
          placeholder="Nuevo estado (ej. Mérida)"
          aria-label="Nuevo estado"
        />
        <Button type="submit" disabled={loading || !newState.trim()}>
          <Plus className="h-4 w-4" />
          Agregar estado
        </Button>
      </form>

      <div className="space-y-4">
        {states.map((s) => {
          const sc = cities.filter((c) => c.state_id === s.id);
          return (
            <div key={s.id} className="rounded-lg border">
              <div className="border-b bg-secondary/40 px-4 py-2">
                <p className="font-semibold">{s.name}</p>
              </div>
              <div className="p-4">
                {!sc.length && <p className="text-sm text-muted-foreground">Sin ciudades.</p>}
                <div className="space-y-2">
                  {sc.map((c) => {
                    const ca = areas.filter((a) => a.city_id === c.id);
                    return (
                      <div key={c.id} className="rounded-md bg-secondary/20 p-3">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">
                            <Building2 className="mr-1 inline h-3.5 w-3.5" />
                            {c.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Envío {formatMoney(c.delivery_fee_usd, 'USD')} · Mín{' '}
                            {formatMoney(c.min_order_usd, 'USD')}
                          </p>
                        </div>
                        {ca.length > 0 && (
                          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                            {ca.map((a) => (
                              <li key={a.id} className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {a.name} · ~{a.delivery_time_minutes} min
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
