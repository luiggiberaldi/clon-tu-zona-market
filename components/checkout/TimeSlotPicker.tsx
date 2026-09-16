'use client';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { useNow } from '@/lib/hooks/useNow';
import type { DeliverySlot } from '@/types/commerce';
export function availableDeliverySlots(slots: DeliverySlot[], now = Date.now()): DeliverySlot[] {
  return slots.filter(
    (slot) => slot.available > 0 && new Date(`${slot.date}T${slot.start}-04:00`).getTime() > now
  );
}
export function TimeSlotPicker({
  slots,
  selected,
  onChange,
  loading,
  error,
  onRetry
}: {
  slots: DeliverySlot[];
  selected?: DeliverySlot;
  onChange: (slot: DeliverySlot | undefined) => void;
  loading: boolean;
  error?: string;
  onRetry: () => void;
}) {
  const [date, setDate] = useState('');
  const now = useNow();
  const available = useMemo(() => availableDeliverySlots(slots, now), [slots, now]);
  const days = useMemo(() => [...new Set(available.map((slot) => slot.date))], [available]);
  const activeDate = date && days.includes(date) ? date : (days[0] ?? '');

  useEffect(() => {
    if (activeDate && (!selected || selected.date !== activeDate)) {
      const firstSlot = available.find((slot) => slot.date === activeDate);
      if (firstSlot) {
        onChange(firstSlot);
      }
    }
  }, [activeDate, selected, available, onChange]);

  return (
    <section className="space-y-3" aria-labelledby="slot-title">
      <div className="flex items-center justify-between">
        <h2 id="slot-title" className="text-lg font-semibold text-foreground">
          2. Horario de entrega
        </h2>
        {selected && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            ✓ Horario seleccionado
          </span>
        )}
      </div>
      {loading && <p role="status">Consultando disponibilidad…</p>}
      {error && (
        <div role="alert">
          <p className="text-sm text-destructive">{error}</p>
          <button type="button" onClick={onRetry} className="text-sm underline">
            Reintentar disponibilidad
          </button>
        </div>
      )}
      {!loading && !error && !days.length && (
        <p role="status" className="text-sm text-muted-foreground">
          No hay horarios disponibles para esta dirección. Inténtalo más tarde.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {days.map((day) => (
          <button
            key={day}
            type="button"
            aria-pressed={activeDate === day}
            onClick={() => {
              if (activeDate !== day) {
                setDate(day);
                const firstSlot = available.find((slot) => slot.date === day);
                if (firstSlot) onChange(firstSlot);
              }
            }}
            className={cn(
              'rounded-xl border p-3 text-sm transition-all',
              activeDate === day
                ? 'border-amber-400 bg-amber-50 font-semibold text-amber-950 shadow-xs ring-1 ring-amber-400 dark:bg-amber-950/40 dark:text-amber-200'
                : 'border-border bg-card hover:border-amber-400/50 hover:bg-secondary'
            )}
          >
            {new Intl.DateTimeFormat('es-VE', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              timeZone: 'America/Caracas'
            }).format(new Date(`${day}T12:00:00-04:00`))}
          </button>
        ))}
      </div>
      {activeDate && (
        <div className="grid grid-cols-2 gap-2">
          {available
            .filter((slot) => slot.date === activeDate)
            .map((slot) => {
              const isSelected = selected?.date === activeDate && selected.start === slot.start;
              return (
                <button
                  key={slot.start}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onChange(slot)}
                  className={cn(
                    'rounded-xl border p-3 text-sm transition-all text-center',
                    isSelected
                      ? 'border-amber-400 bg-amber-50 font-semibold text-amber-950 shadow-xs ring-1 ring-amber-400 dark:bg-amber-950/40 dark:text-amber-200'
                      : 'border-border bg-card hover:border-amber-400/50 hover:bg-secondary'
                  )}
                >
                  {slot.start.slice(0, 5)} – {slot.end.slice(0, 5)}
                </button>
              );
            })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Hora de Venezuela (UTC−04:00). La disponibilidad se comprueba de nuevo al confirmar.
      </p>
    </section>
  );
}
