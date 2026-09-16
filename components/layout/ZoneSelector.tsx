'use client';

import { useState } from 'react';
import { MapPin, ChevronDown, LoaderCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SelectDropdown } from '@/components/ui/select-dropdown';
import { useZoneStore } from '@/store/zoneStore';
import type { State, City, Area } from '@/types';

type ZoneTree = { states: State[]; cities: City[]; areas: Area[] };

export function ZoneSelector({ variant = 'default' }: { variant?: 'default' | 'header' | 'mobile' }) {
  const store = useZoneStore();
  const [open, setOpen] = useState(false);
  const [stateId, setStateId] = useState('');
  const [cityId, setCityId] = useState('');
  const [areaId, setAreaId] = useState('');
  const { data, isPending, isError, refetch } = useQuery<ZoneTree>({
    queryKey: ['zones'], enabled: open, staleTime: 60_000,
    queryFn: async () => { const response = await fetch('/api/zonas'); if (!response.ok) throw new Error('Cobertura no disponible'); return response.json(); }
  });
  function changeOpen(next: boolean) {
    if (next) { setStateId(store.state?.id ?? ''); setCityId(store.city?.id ?? ''); setAreaId(store.area?.id ?? ''); }
    setOpen(next);
  }
  const states = data?.states ?? [];
  const cities = data?.cities.filter((c) => c.state_id === stateId) ?? [];
  const areas = data?.areas.filter((a) => a.city_id === cityId) ?? [];
  const city = cities.find((c) => c.id === cityId);
  const selectedArea = areas.find((a) => a.id === areaId);
  const label = store.hydrated ? store.city?.name ?? 'Elegir zona' : 'Elegir zona';
  function confirm() {
    const state = states.find((s) => s.id === stateId);
    if (!state || !city || !selectedArea) return;
    store.setState({ id: state.id, name: state.name });
    store.setCity({ id: city.id, name: city.name, delivery_fee_usd: city.delivery_fee_usd, min_order_usd: city.min_order_usd });
    store.setArea({ id: selectedArea.id, name: selectedArea.name, delivery_time_minutes: selectedArea.delivery_time_minutes });
    setOpen(false);
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild><button className={`zone-trigger zone-${variant}`} aria-label="Seleccionar zona de entrega"><MapPin size={variant === 'mobile' ? 21 : 20} /><span>{variant === 'header' && <small>Tu zona de entrega</small>}<span>{variant === 'mobile' ? 'Mi zona' : label}</span></span>{variant !== 'mobile' && <ChevronDown size={13} />}</button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-xl">
        <DialogTitle>¿Dónde recibes tu compra?</DialogTitle><DialogDescription>Elige tu sector para consultar la cobertura y el costo de entrega. El catálogo corresponde a un solo almacén.</DialogDescription>
        {isPending ? <p className="flex items-center gap-2 py-5 text-sm" role="status"><LoaderCircle className="animate-spin" size={18} /> Consultando zonas…</p> : isError ? <div role="alert" className="space-y-3 rounded-lg bg-red-50 p-4 text-sm"><p>No pudimos consultar las zonas de entrega.</p><Button variant="outline" onClick={() => refetch()}>Reintentar</Button></div> : !states.length ? <p className="rounded-lg bg-secondary p-4 text-sm">Aún no hay zonas de entrega publicadas.</p> : <div className="space-y-4">
          <label className="block text-sm font-medium">Estado<SelectDropdown ariaLabel="Estado" className="mt-1.5" placeholder="Selecciona un estado" options={states.map((s) => ({ value: s.id, label: s.name }))} value={stateId} onChange={(v) => { setStateId(v); setCityId(''); setAreaId(''); }} /></label>
          <label className="block text-sm font-medium">Ciudad<SelectDropdown ariaLabel="Ciudad" className="mt-1.5" placeholder="Selecciona una ciudad" disabled={!stateId} options={cities.map((c) => ({ value: c.id, label: c.name }))} value={cityId} onChange={(v) => { setCityId(v); setAreaId(''); }} /></label>
          <label className="block text-sm font-medium">Urbanización o sector<SelectDropdown ariaLabel="Urbanización o sector" className="mt-1.5" placeholder="Selecciona tu sector" disabled={!cityId} options={areas.map((a) => ({ value: a.id, label: a.name }))} value={areaId} onChange={setAreaId} /></label>
          {cityId && !areas.length && <p className="text-sm text-muted-foreground">Esta ciudad no tiene sectores disponibles.</p>}
          {city && <div className="rounded-lg bg-[#edf5ee] p-3 text-sm"><p>Entrega: <strong>${city.delivery_fee_usd.toFixed(2)} USD</strong></p><p className="mt-1">Pedido mínimo: ${city.min_order_usd.toFixed(2)} USD</p></div>}
          <Button onClick={confirm} disabled={!selectedArea} className="w-full">Confirmar mi zona</Button>
        </div>}
      </DialogContent>
    </Dialog>
  );
}
