'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { zonesApi } from '@/lib/api/zones';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SelectDropdown } from '@/components/ui/select-dropdown';
import { addressSchema } from '@/lib/utils/validation';
import { cn } from '@/lib/utils/cn';
import type { Address } from '@/types';

type Draft = { id: string; existing?: Address };
export function AddressSelector({ userId, selectedId, onSelect }: { userId: string; selectedId?: string; onSelect: (id: string) => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>();
  const [cityId, setCityId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const addresses = useQuery({
    queryKey: ['addresses', userId],
    queryFn: async ({ signal }) => {
      const response = await createBrowserSupabase().from('addresses').select('*').eq('user_id', userId).order('is_default', { ascending: false }).order('created_at').abortSignal(signal);
      if (response.error) throw new Error('No se pudieron consultar tus direcciones.');
      return (response.data ?? []) as Address[];
    }
  });
  const zones = useQuery({ queryKey: ['zones'], queryFn: zonesApi.tree });
  const cities = zones.data?.cities.filter(city => city.is_active) ?? [];
  const areas = zones.data?.areas.filter(area => area.is_active && area.city_id === cityId) ?? [];

  useEffect(() => {
    if (!selectedId && addresses.data && addresses.data.length > 0) {
      const covered = addresses.data.find(a => zones.data?.areas.some(area => area.id === a.area_id));
      const target = addresses.data.find(a => a.is_default && zones.data?.areas.some(area => area.id === a.area_id)) || covered || addresses.data[0];
      if (target) {
        onSelect(target.id);
      }
    }
  }, [addresses.data, selectedId, zones.data, onSelect]);

  function edit(address?: Address) {
    const area = zones.data?.areas.find(entry => entry.id === address?.area_id);
    setCityId(area?.city_id || '');
    setAreaId(area?.id || '');
    setDraft({ id: address?.id || crypto.randomUUID(), existing: address });
    setMessage(null);
  }
  async function refresh() { await qc.invalidateQueries({ queryKey: ['addresses', userId] }); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !draft) return;
    const fields = new FormData(event.currentTarget);
    const parsed = addressSchema.omit({ latitude: true, longitude: true }).strict().safeParse({
      area_id: areaId, full_address: String(fields.get('full_address') || '').trim(),
      building: String(fields.get('building') || '').trim(), apartment: String(fields.get('apartment') || '').trim(),
      reference: String(fields.get('reference') || '').trim(), is_default: fields.get('is_default') === 'on'
    });
    if (!parsed.success || !areas.some(area => area.id === areaId)) { setMessage('Selecciona un sector habilitado y una dirección de 5 a 500 caracteres.'); return; }
    setSaving(true); setMessage(null);
    try {
      const supabase = createBrowserSupabase();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || auth.user?.id !== userId) throw new Error('Tu sesión cambió. Vuelve a iniciar sesión.');
      const result = await supabase.rpc('save_address', { p_values: parsed.data, p_address_id: draft.id });
      if (result.error) throw new Error(result.error.code === '22023' ? result.error.message : 'No se pudo guardar. Verifica las migraciones e inténtalo de nuevo.');
      if (!result.data?.id) throw new Error('Respuesta incompleta. Reintenta la misma dirección.');
      await refresh(); onSelect(result.data.id); setDraft(undefined); setMessage('Dirección guardada.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar la dirección.'); }
    finally { setSaving(false); }
  }
  async function remove(address: Address) {
    if (saving || !window.confirm('¿Eliminar esta dirección guardada? Las direcciones con historial de pedidos se conservan.')) return;
    setSaving(true); setMessage(null);
    try {
      const { error } = await createBrowserSupabase().rpc('delete_address', { p_address_id: address.id });
      if (error) throw new Error(error.code === '22023' ? error.message : 'No se pudo eliminar la dirección.');
      if (selectedId === address.id) onSelect('');
      await refresh(); setMessage('Dirección eliminada.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo eliminar.'); }
    finally { setSaving(false); }
  }
  return <section className="space-y-3" aria-labelledby="address-title">
    <h2 id="address-title" className="text-lg font-semibold">1. Dirección de entrega</h2>
    {addresses.isPending && <p role="status">Consultando tus direcciones…</p>}
    {addresses.error && <div role="alert"><p>{addresses.error.message}</p><Button type="button" variant="outline" onClick={() => void addresses.refetch()}>Reintentar direcciones</Button></div>}
    {zones.error && <div role="alert"><p>No se pudo consultar la cobertura.</p><Button type="button" variant="outline" onClick={() => void zones.refetch()}>Reintentar cobertura</Button></div>}
    <div className="grid gap-2.5 sm:grid-cols-2">{addresses.data?.map(address => {
      const covered = zones.data?.areas.some(area => area.id === address.area_id);
      const isSelected = selectedId === address.id;
      const areaName = zones.data?.areas.find(area => area.id === address.area_id)?.name || 'Sector no disponible';

      return (
        <div
          key={address.id}
          className={cn(
            'group relative flex flex-col justify-between rounded-xl border p-4 transition-all text-left',
            isSelected
              ? 'border-amber-400 bg-amber-50/50 shadow-xs ring-1 ring-amber-400 dark:bg-amber-950/20'
              : 'border-border bg-card hover:border-amber-400/50 hover:bg-secondary/40',
            (!covered || saving) && 'opacity-60'
          )}
        >
          <button
            type="button"
            aria-pressed={isSelected}
            disabled={!covered || saving}
            onClick={() => onSelect(address.id)}
            className="w-full text-left focus:outline-hidden disabled:cursor-not-allowed"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                  isSelected
                    ? 'border-amber-500 bg-amber-400 text-amber-950 font-bold'
                    : 'border-muted-foreground/30 bg-background'
                )}>
                  {isSelected && <span className="h-2 w-2 rounded-full bg-amber-950" />}
                </span>
                <span className="font-semibold text-foreground text-sm leading-tight">
                  {address.full_address}
                </span>
              </div>
              {isSelected && (
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  ✓ Seleccionada
                </span>
              )}
            </div>

            <p className="mt-1.5 pl-7 text-xs text-muted-foreground">
              {areaName}
              {address.building ? ` · ${address.building}` : ''}
              {address.apartment ? ` Apt ${address.apartment}` : ''}
            </p>

            {address.is_default && (
              <div className="mt-2 pl-7">
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                  Predeterminada
                </span>
              </div>
            )}
          </button>

          <div className="mt-3 flex items-center justify-end gap-3 border-t border-border/40 pt-2 pl-7">
            <button
              type="button"
              className="text-xs font-medium text-amber-900 underline hover:text-amber-950 dark:text-amber-300"
              disabled={saving}
              onClick={() => edit(address)}
            >
              Editar
            </button>
            <button
              type="button"
              className="text-xs text-destructive underline hover:opacity-80"
              disabled={saving}
              onClick={() => void remove(address)}
            >
              Eliminar
            </button>
          </div>
        </div>
      );
    })}</div>
    {addresses.data?.length === 0 && <p className="text-sm text-muted-foreground">Agrega una dirección para consultar envío y disponibilidad.</p>}
    {draft ? <Card className="p-4"><form key={draft.id} onSubmit={event => void save(event)} className="space-y-3">
      <h3 className="font-semibold">{draft.existing ? 'Editar dirección' : 'Nueva dirección'}</h3>
      <label className="block text-sm">Ciudad<SelectDropdown ariaLabel="Ciudad" placeholder="Selecciona una ciudad" className="mt-1" options={cities.map(city => ({ value: city.id, label: city.name }))} value={cityId} onChange={(v) => { setCityId(v); setAreaId(''); }} /></label>
      <label className="block text-sm">Sector<SelectDropdown ariaLabel="Sector" placeholder="Selecciona un sector" disabled={!cityId} className="mt-1" options={areas.map(area => ({ value: area.id, label: area.name }))} value={areaId} onChange={setAreaId} /></label>
      <label className="block text-sm">Dirección completa<input name="full_address" required minLength={5} maxLength={500} autoComplete="street-address" defaultValue={draft.existing?.full_address || ''} className="mt-1 block w-full rounded border bg-background p-2" /></label>
      <div className="grid grid-cols-2 gap-2"><label className="text-sm">Edificio<input name="building" maxLength={255} defaultValue={draft.existing?.building || ''} className="mt-1 w-full rounded border p-2" /></label><label className="text-sm">Apartamento<input name="apartment" maxLength={50} defaultValue={draft.existing?.apartment || ''} className="mt-1 w-full rounded border p-2" /></label></div>
      <label className="block text-sm">Punto de referencia<input name="reference" maxLength={500} defaultValue={draft.existing?.reference || ''} className="mt-1 block w-full rounded border p-2" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_default" defaultChecked={draft.existing?.is_default ?? addresses.data?.length === 0} />Usar como dirección predeterminada</label>
      <div className="flex gap-2"><Button type="submit" disabled={saving || zones.isPending || !!zones.error}>{saving ? 'Guardando…' : 'Guardar dirección'}</Button><Button type="button" variant="ghost" disabled={saving} onClick={() => setDraft(undefined)}>Cancelar</Button></div>
    </form></Card> : <Button type="button" variant="outline" disabled={saving || (addresses.data?.length || 0) >= 50} onClick={() => edit()}>Agregar dirección</Button>}
    {message && <p role="status" className="rounded border bg-secondary p-3 text-sm">{message}</p>}
    <p className="text-xs text-muted-foreground">El envío y el mínimo dependen de esta dirección, no de la zona de navegación. Editarla no cambia la dirección registrada en pedidos anteriores.</p>
  </section>;
}
