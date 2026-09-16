'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminRequest } from '@/lib/admin-client';
import { Button } from '@/components/ui/button';
import { SelectDropdown } from '@/components/ui/select-dropdown';
import type { State, City, Area } from '@/types';
type Zones = { states: State[]; cities: City[]; areas: Area[] };
export function CoverageEditor() {
  const query = useQuery({
    queryKey: ['admin-zones'],
    queryFn: () => adminRequest<Zones>('/api/admin/zonas')
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(kind: string, values: unknown, id?: string) {
    setBusy(true);
    setMessage('');
    try {
      await adminRequest('/api/admin/zonas', id ? 'PATCH' : 'POST', { kind, id, values });
      await query.refetch();
      setMessage('Cobertura guardada.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending) return <p>Cargando cobertura…</p>;
  if (query.error) return <p role="alert">{query.error.message}</p>;
  const zones = query.data!;
  const input = 'mt-1 block w-full rounded-lg border p-2';
  return (
    <div className="space-y-5">
      {message && (
        <p role="status" className="rounded border bg-white p-3">
          {message}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <form
          className="rounded-xl border bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save('state', { name: f.get('name'), is_active: true });
          }}
        >
          <h2 className="mb-3 font-bold">Crear estado</h2>
          <label>
            Nombre
            <input className={input} name="name" required minLength={2} maxLength={100} />
          </label>
          <Button className="mt-3" disabled={busy}>
            Crear estado
          </Button>
        </form>
        <form
          className="rounded-xl border bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save('city', {
              name: f.get('name'),
              state_id: f.get('state'),
              delivery_fee_usd: Number(f.get('fee')),
              min_order_usd: Number(f.get('minimum')),
              is_active: true
            });
          }}
        >
          <h2 className="mb-3 font-bold">Crear ciudad</h2>
          <label>
            Estado
            <SelectDropdown name="state" ariaLabel="Estado" placeholder="Selecciona" className={input} options={zones.states.map((s) => ({ value: s.id, label: s.name }))} />
          </label>
          <label>
            Nombre
            <input name="name" required minLength={2} className={input} />
          </label>
          <label>
            Envío USD
            <input
              name="fee"
              type="number"
              step="0.01"
              min={0}
              defaultValue={0}
              className={input}
            />
          </label>
          <label>
            Mínimo USD
            <input
              name="minimum"
              type="number"
              step="0.01"
              min={0}
              defaultValue={10}
              className={input}
            />
          </label>
          <Button className="mt-3" disabled={busy}>
            Crear ciudad
          </Button>
        </form>
        <form
          className="rounded-xl border bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save('area', {
              name: f.get('name'),
              city_id: f.get('city'),
              delivery_time_minutes: Number(f.get('minutes')),
              is_active: true
            });
          }}
        >
          <h2 className="mb-3 font-bold">Crear sector</h2>
          <label>
            Ciudad
            <SelectDropdown name="city" ariaLabel="Ciudad" placeholder="Selecciona" className={input} options={zones.cities.map((c) => ({ value: c.id, label: c.name }))} />
          </label>
          <label>
            Sector
            <input name="name" required minLength={2} className={input} />
          </label>
          <label>
            Referencia de entrega (min)
            <input
              name="minutes"
              type="number"
              min={15}
              max={1440}
              defaultValue={60}
              className={input}
            />
          </label>
          <Button className="mt-3" disabled={busy}>
            Crear sector
          </Button>
        </form>
      </div>
      <h2 className="text-lg font-bold">Estado de cobertura</h2>
      {zones.states.map((state) => (
        <section key={state.id} className="rounded-xl border bg-white p-5">
          <div className="flex justify-between">
            <h3 className="font-bold">{state.name}</h3>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void save('state', { is_active: !state.is_active }, state.id)}
            >
              {state.is_active ? 'Pausar' : 'Activar'}
            </Button>
          </div>
          {zones.cities
            .filter((c) => c.state_id === state.id)
            .map((city) => (
              <div className="mt-4 border-t pt-3" key={city.id}>
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void save(
                      'city',
                      {
                        delivery_fee_usd: Number(f.get('fee')),
                        min_order_usd: Number(f.get('min'))
                      },
                      city.id
                    );
                  }}
                >
                  <strong>{city.name}</strong>
                  <label className="text-xs">
                    Envío USD
                    <input
                      type="number"
                      name="fee"
                      step="0.01"
                      min={0}
                      defaultValue={city.delivery_fee_usd}
                      className="ml-2 w-24 rounded border p-2"
                    />
                  </label>
                  <label className="text-xs">
                    Mínimo USD
                    <input
                      type="number"
                      name="min"
                      min={0}
                      step="0.01"
                      defaultValue={city.min_order_usd}
                      className="ml-2 w-24 rounded border p-2"
                    />
                  </label>
                  <Button size="sm" disabled={busy}>
                    Guardar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void save('city', { is_active: !city.is_active }, city.id)}
                  >
                    {city.is_active ? 'Pausar' : 'Activar'}
                  </Button>
                </form>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {zones.areas
                    .filter((a) => a.city_id === city.id)
                    .map((a) => (
                      <li key={a.id}>
                        <button
                          disabled={busy}
                          onClick={() => void save('area', { is_active: !a.is_active }, a.id)}
                          className="rounded border px-3 py-2 text-xs"
                        >
                          {a.name} · {a.is_active ? 'Activo (pausar)' : 'Pausado (activar)'}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}
