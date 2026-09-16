'use client';

import { useState } from 'react';
import { MapPin, ChevronDown, LoaderCircle, Clock, Truck, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SelectDropdown } from '@/components/ui/select-dropdown';
import { useZoneStore } from '@/store/zoneStore';
import { useCartStore, selectCartSubtotalUsd } from '@/store/cartStore';
import { calculateDeliveryCost } from '@/lib/delivery/calculator';
import type { State, City, Area } from '@/types';

type ZoneTree = { states: State[]; cities: City[]; areas: Area[] };

export function ZoneSelector({ variant = 'default' }: { variant?: 'default' | 'header' | 'mobile' }) {
  const store = useZoneStore();
  const subtotalUsd = useCartStore(selectCartSubtotalUsd);
  const [open, setOpen] = useState(false);
  const [stateId, setStateId] = useState('');
  const [cityId, setCityId] = useState('');
  const [areaId, setAreaId] = useState('');
  const { data, isPending, isError, refetch } = useQuery<ZoneTree>({
    queryKey: ['zones'], enabled: open, staleTime: 60_000,
    queryFn: async () => { const response = await fetch('/api/zonas'); if (!response.ok) throw new Error('Cobertura no disponible'); return response.json(); }
  });

  function changeOpen(next: boolean) {
    if (next) {
      setStateId(store.state?.id ?? '');
      setCityId(store.city?.id ?? '');
      setAreaId(store.area?.id ?? '');
    }
    setOpen(next);
  }

  const states = data?.states ?? [];
  const effectiveStateId = stateId || (states.length === 1 && states[0] ? states[0].id : '');

  const cities = data?.cities.filter((c) => c.state_id === effectiveStateId) ?? [];
  const areas = data?.areas.filter((a) => a.city_id === cityId) ?? [];
  const city = cities.find((c) => c.id === cityId);
  const selectedArea = areas.find((a) => a.id === areaId);

  // Delivery calculation logic
  const deliveryCalc = city ? calculateDeliveryCost({
    subtotalUsd,
    city,
    area: selectedArea,
    isPrime: false
  }) : null;

  const label = store.hydrated
    ? store.area?.name
      ? `${store.city?.name || ''} · ${store.area.name}`
      : store.city?.name || 'Selecciona tu zona'
    : 'Cargando zona…';

  function confirm() {
    const state = states.find((s) => s.id === effectiveStateId);
    if (!state || !city || !selectedArea) return;
    store.setState({ id: state.id, name: state.name });
    store.setCity({ id: city.id, name: city.name, delivery_fee_usd: city.delivery_fee_usd, min_order_usd: city.min_order_usd });
    store.setArea({ id: selectedArea.id, name: selectedArea.name, delivery_time_minutes: selectedArea.delivery_time_minutes });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <button className={`zone-trigger zone-${variant}`} aria-label="Seleccionar zona de entrega">
          <MapPin size={variant === 'mobile' ? 21 : 20} />
          <span>
            {variant === 'header' && <small>Tu zona de entrega</small>}
            <span className="truncate max-w-[160px] inline-block">{variant === 'mobile' ? 'Mi zona' : label}</span>
          </span>
          {variant !== 'mobile' && <ChevronDown size={13} />}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-xl">
        <DialogTitle>¿Dónde recibes tu compra?</DialogTitle>
        <DialogDescription>
          Elige tu sector para consultar la cobertura, tarifa de entrega y tiempo estimado.
        </DialogDescription>
        {isPending ? (
          <p className="flex items-center gap-2 py-5 text-sm" role="status">
            <LoaderCircle className="animate-spin" size={18} /> Consultando zonas…
          </p>
        ) : isError ? (
          <div role="alert" className="space-y-3 rounded-lg bg-red-50 p-4 text-sm text-red-950">
            <p>No pudimos consultar las zonas de entrega.</p>
            <Button variant="outline" onClick={() => refetch()}>Reintentar</Button>
          </div>
        ) : !states.length ? (
          <p className="rounded-lg bg-secondary p-4 text-sm">Aún no hay zonas de entrega publicadas.</p>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm font-medium">
              Estado
              <SelectDropdown
                ariaLabel="Estado"
                className="mt-1.5"
                placeholder="Selecciona un estado"
                options={states.map((s) => ({ value: s.id, label: s.name }))}
                value={effectiveStateId}
                onChange={(v) => { setStateId(v); setCityId(''); setAreaId(''); }}
              />
            </label>
            <label className="block text-sm font-medium">
              Ciudad / Municipio
              <SelectDropdown
                ariaLabel="Ciudad"
                className="mt-1.5"
                placeholder="Selecciona una ciudad"
                disabled={!effectiveStateId}
                options={cities.map((c) => ({ value: c.id, label: c.name }))}
                value={cityId}
                onChange={(v) => {
                  setCityId(v);
                  const cityAreas = data?.areas.filter((a) => a.city_id === v) ?? [];
                  setAreaId(cityAreas[0]?.id ?? '');
                }}
              />
            </label>
            <label className="block text-sm font-medium">
              Urbanización o sector
              <SelectDropdown
                ariaLabel="Urbanización o sector"
                className="mt-1.5"
                placeholder="Selecciona tu sector"
                disabled={!cityId}
                options={areas.map((a) => ({ value: a.id, label: a.name }))}
                value={areaId}
                onChange={setAreaId}
              />
            </label>
            {cityId && !areas.length && (
              <p className="text-sm text-muted-foreground">Esta ciudad no tiene sectores disponibles por ahora.</p>
            )}

            {/* Delivery Calculation Card */}
            {city && deliveryCalc && (
              <div className="zone-cost space-y-2 rounded-xl border border-amber-200 bg-[#fffdf0] p-3.5 text-sm text-[#3b3400]">
                <div className="flex items-center justify-between font-medium">
                  <span className="flex items-center gap-1.5">
                    <Truck size={16} className="text-primary" /> Costo de entrega:
                  </span>
                  <span>
                    {deliveryCalc.isFreeDelivery ? (
                      <>
                        <span className="mr-1.5 line-through text-xs text-muted-foreground">
                          ${deliveryCalc.baseFeeUsd.toFixed(2)} USD
                        </span>
                        <strong className="text-emerald-700 font-bold">¡GRATIS!</strong>
                      </>
                    ) : (
                      <strong>${deliveryCalc.baseFeeUsd.toFixed(2)} USD</strong>
                    )}
                  </span>
                </div>

                {/* Free Delivery Promo & Progress */}
                <div className="rounded-lg bg-white/90 p-2.5 border border-amber-100 text-xs leading-relaxed">
                  <div className="flex items-center gap-1.5 text-amber-950 font-semibold mb-1">
                    <Sparkles size={14} className="text-amber-500 shrink-0" />
                    <span>¡Envío GRATIS en compras desde ${deliveryCalc.freeDeliveryThresholdUsd.toFixed(0)} USD!</span>
                  </div>
                  {subtotalUsd > 0 ? (
                    deliveryCalc.isFreeDelivery ? (
                      <p className="text-emerald-700 font-medium">
                        Tu pedido actual de ${subtotalUsd.toFixed(2)} USD califica para envío gratuito.
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        Llevas ${subtotalUsd.toFixed(2)} USD en carrito. ¡Agrega <strong className="text-foreground">${deliveryCalc.amountNeededForFreeUsd.toFixed(2)} USD</strong> más para recibirlo gratis!
                      </p>
                    )
                  ) : (
                    <p className="text-muted-foreground">
                      Aplica automáticamente al alcanzar ${deliveryCalc.freeDeliveryThresholdUsd.toFixed(0)} USD en tu carrito.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground pt-1 border-t border-amber-100/80">
                  <span className="flex items-center gap-1">
                    <Clock size={13} /> Tiempo estimado: <strong>~{deliveryCalc.estimatedTimeMinutes} min</strong>
                  </span>
                  <span>
                    Pedido mínimo: <strong>${deliveryCalc.minOrderUsd.toFixed(2)} USD</strong>
                  </span>
                </div>
              </div>
            )}

            <Button onClick={confirm} disabled={!selectedArea} className="w-full">
              Confirmar mi zona
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
