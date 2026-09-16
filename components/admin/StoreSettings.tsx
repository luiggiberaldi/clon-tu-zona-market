'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminRequest } from '@/lib/admin-client';
import { Button } from '@/components/ui/button';
import { SelectDropdown } from '@/components/ui/select-dropdown';
import { isDemoMode } from '@/lib/config';
import type { PaymentMethodConfig, DeliveryHours } from '@/types/commerce';
type Config = {
  settings: Array<{ key: string; value: Record<string, unknown> }>;
  payment_methods: PaymentMethodConfig[];
};
export function StoreSettings() {
  const query = useQuery({
    queryKey: ['admin-config'],
    queryFn: () => adminRequest<Config>('/api/admin/config')
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(payload: unknown) {
    setBusy(true);
    setMessage('');
    try {
      await adminRequest('/api/admin/config', 'PATCH', payload);
      await query.refetch();
      setMessage('Configuración guardada.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending) return <p role="status">Cargando configuración…</p>;
  if (query.error) return <p role="alert">{query.error.message}</p>;
  const data = query.data!;
  const rate = data.settings.find((s) => s.key === 'exchange_rate')?.value;
  const hours = data.settings.find((s) => s.key === 'delivery_hours')
    ?.value as unknown as DeliveryHours;
  return (
    <div className="space-y-5">
      {message && (
        <p role="status" className="rounded border bg-white p-3">
          {message}
        </p>
      )}
      <form
        className="rounded-xl border bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save({
            kind: 'exchange_rate',
            mode: 'manual',
            usd_to_ves: Number(new FormData(e.currentTarget).get('rate'))
          });
        }}
      >
        <h2 className="mb-2 text-lg font-semibold">Tasa USD / VES</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {isDemoMode() ? 'La tasa inicial es una captura verificada de la fuente, no una cotización en vivo. Publicar otra tasa modifica únicamente esta simulación local.' : 'Por defecto la tasa se actualiza sola con el valor oficial del BCV (varias veces al día). Si publicas una tasa manual, esa manda y no se sobrescribe; puedes volver al automático cuando quieras.'}
        </p>
        {rate?.manual === false && !isDemoMode() && (
          <p className="mb-3 rounded-lg bg-emerald-50 p-2 text-xs font-medium text-emerald-800">
            Modo automático activo · {String(rate?.source || 'BCV')} · última sincronización: {String(rate?.updated_at || '—')}
          </p>
        )}
        {rate?.manual === true && (
          <p className="mb-3 rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-800">
            Tasa manual (el sistema no la sobrescribe) · publicada: {String(rate?.updated_at || '—')}
          </p>
        )}
        <label className="text-sm">
          Bolívares por USD
          <input
            name="rate"
            type="number"
            step="0.0001"
            min="0.0001"
            max="100000000"
            defaultValue={Number(rate?.usd_to_ves) || ''}
            required
            className="mx-3 rounded-lg border p-2"
          />
        </label>
        <Button disabled={busy}>Publicar tasa</Button>
        {!isDemoMode() && (
          <Button type="button" variant="outline" className="ml-2" disabled={busy}
            onClick={() => void save({ kind: 'exchange_rate', mode: 'auto' })}>
            Usar tasa BCV automática
          </Button>
        )}
        <p className="mt-2 text-xs">
          Última publicación: {String(rate?.updated_at || 'Sin configurar')}
        </p>
      </form>
      <form
        key={JSON.stringify(hours)}
        className="rounded-xl border bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void save({
            kind: 'delivery_hours',
            value: {
              start: f.get('start'),
              end: f.get('end'),
              cutoff_time: f.get('cutoff_time'),
              slot_capacity: Number(f.get('slot_capacity')),
              lead_minutes: Number(f.get('lead_minutes')),
              horizon_days: Number(f.get('horizon_days'))
            }
          });
        }}
      >
        <h2 className="mb-4 text-lg font-semibold">Entregas · America/Caracas</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['start', 'Apertura'],
            ['end', 'Cierre'],
            ['cutoff_time', 'Corte mismo día']
          ].map(([key, label]) => (
            <label key={key} className="text-sm">
              {label}
              <input
                type="time"
                name={key}
                required
                defaultValue={String(hours?.[key as keyof DeliveryHours] || '09:00')}
                className="mt-1 block w-full rounded-lg border p-2"
              />
            </label>
          ))}
          {[
            ['slot_capacity', 'Cupos por franja', 1, 1000, 20],
            ['lead_minutes', 'Anticipación (min)', 0, 1440, 60],
            ['horizon_days', 'Días anticipados', 1, 7, 7]
          ].map(([key, label, min, max, fallback]) => (
            <label className="text-sm" key={key}>
              {label}
              <input
                type="number"
                name={String(key)}
                min={Number(min)}
                max={Number(max)}
                required
                defaultValue={Number(hours?.[key as keyof DeliveryHours] ?? fallback)}
                className="mt-1 block w-full rounded-lg border p-2"
              />
            </label>
          ))}
        </div>
        <Button className="mt-4" disabled={busy}>
          Guardar horarios
        </Button>
      </form>
      {data.payment_methods.map((method) => (
        <form
          key={method.id + JSON.stringify(method)}
          className="rounded-xl border bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save({
              kind: 'payment_method',
              value: {
                id: method.id,
                label: String(f.get('label')),
                instructions: String(f.get('instructions')),
                currency: f.get('currency'),
                enabled: f.get('enabled') === 'on'
              }
            });
          }}
        >
          <h2 className="text-lg font-semibold">{method.id}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Nombre
              <input
                name="label"
                required
                minLength={2}
                defaultValue={method.label}
                className="mt-1 block w-full rounded-lg border p-2"
              />
            </label>
            <label className="text-sm">
              Moneda
              <SelectDropdown
                name="currency"
                defaultValue={method.currency}
                ariaLabel="Moneda del método"
                className="mt-1 block w-full"
                options={[{ value: 'USD', label: 'USD' }, { value: 'VES', label: 'VES' }]}
              />
            </label>
          </div>
          <label className="mt-3 block text-sm">
            Instrucciones visibles al comprador
            <textarea
              name="instructions"
              maxLength={2000}
              defaultValue={method.instructions}
              rows={3}
              className="mt-1 block w-full rounded-lg border p-2"
            />
          </label>
          <label className="my-3 flex gap-2 text-sm">
            <input name="enabled" type="checkbox" defaultChecked={method.enabled} />
            Habilitar método (solo con datos de cobro correctos)
          </label>
          <Button disabled={busy}>Guardar método</Button>
        </form>
      ))}
    </div>
  );
}
