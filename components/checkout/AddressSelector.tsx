'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { zonesApi } from '@/lib/api/zones';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
    <div className="grid gap-2 sm:grid-cols-2">{addresses.data?.map(address => {
      const covered = zones.data?.areas.some(area => area.id === address.area_id);
      return <div key={address.id} className={cn('rounded-lg border p-3', selectedId === address.id && 'border-primary bg-primary/5')}>
        <button type="button" aria-pressed={selectedId === address.id} disabled={!covered || saving} onClick={() => onSelect(address.id)} className="w-full text-left text-sm disabled:opacity-60"><span className="block font-medium">{address.full_address}</span><span className="text-muted-foreground">{zones.data?.areas.find(area => area.id === address.area_id)?.name || 'Sector no disponible'}</span>{address.is_default && <span className="ml-2 text-xs text-primary">Predeterminada</span>}</button>
        <div className="mt-2 flex gap-3"><button type="button" className="text-xs text-primary underline" disabled={saving} onClick={() => edit(address)}>Editar</button><button type="button" className="text-xs text-destructive underline" disabled={saving} onClick={() => void remove(address)}>Eliminar</button></div>
      </div>;
    })}</div>
    {addresses.data?.length === 0 && <p className="text-sm text-muted-foreground">Agrega una dirección para consultar envío y disponibilidad.</p>}
    {draft ? <Card className="p-4"><form key={draft.id} onSubmit={event => void save(event)} className="space-y-3">
      <h3 className="font-semibold">{draft.existing ? 'Editar dirección' : 'Nueva dirección'}</h3>
      <label className="block text-sm">Ciudad<select value={cityId} onChange={event => { setCityId(event.target.value); setAreaId(''); }} required className="mt-1 block w-full rounded border bg-background p-2"><option value="">Selecciona una ciudad</option>{cities.map(city => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
      <label className="block text-sm">Sector<select value={areaId} onChange={event => setAreaId(event.target.value)} disabled={!cityId} required className="mt-1 block w-full rounded border bg-background p-2"><option value="">Selecciona un sector</option>{areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
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
