'use client';
import { useState } from 'react';
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
  const available = availableDeliverySlots(slots, now);
  const days = [...new Set(available.map((slot) => slot.date))];
  return (
    <section className="space-y-3" aria-labelledby="slot-title">
      <h2 id="slot-title" className="text-lg font-semibold">
        2. Horario de entrega
      </h2>
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
            aria-pressed={date === day}
            onClick={() => {
              if (date !== day) {
                setDate(day);
                onChange(undefined);
              }
            }}
            className={cn(
              'rounded-lg border p-3 text-sm',
              date === day ? 'border-primary bg-primary/10' : 'hover:bg-secondary'
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
      {date && (
        <div className="grid grid-cols-2 gap-2">
          {available
            .filter((slot) => slot.date === date)
            .map((slot) => (
              <button
                key={slot.start}
                type="button"
                aria-pressed={selected?.date === date && selected.start === slot.start}
                onClick={() => onChange(slot)}
                className={cn(
                  'rounded-lg border p-3 text-sm',
                  selected?.date === date && selected.start === slot.start
                    ? 'border-primary bg-primary/10'
                    : 'hover:bg-secondary'
                )}
              >
                {slot.start.slice(0, 5)} – {slot.end.slice(0, 5)}
              </button>
            ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Hora de Venezuela (UTC−04:00). La disponibilidad se comprueba de nuevo al confirmar.
      </p>
    </section>
  );
}
