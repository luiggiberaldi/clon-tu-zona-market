'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { SelectDropdown } from '@/components/ui/select-dropdown';
import { formatMoney, formatDateTime } from '@/lib/utils/formatters';
import { ORDER_STATUS_LABELS } from '@/lib/utils/constants';
import type { Order, OrderStatus } from '@/types';

const STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'on_way',
  'delivered',
  'cancelled'
];

export function OrderTable({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function update(id: string, status: OrderStatus) {
    setBusy(id);
    const res = await fetch(`/api/ordenes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast({
        title: 'Error',
        description: (body as { error?: string }).error ?? 'No se pudo actualizar',
        variant: 'error'
      });
      return;
    }
    toast({ title: 'Orden actualizada', variant: 'success' });
    router.refresh();
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Orden</th>
            <th className="px-3 py-2">Fecha</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2">Pago</th>
            <th className="px-3 py-2">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-secondary/30">
              <td className="px-3 py-2 font-medium">{o.order_number}</td>
              <td className="px-3 py-2 text-muted-foreground">{formatDateTime(o.created_at)}</td>
              <td className="px-3 py-2 text-right">{formatMoney(o.total_usd, 'USD')}</td>
              <td className="px-3 py-2">
                <span
                  className={
                    o.payment_status === 'paid'
                      ? 'text-green-600'
                      : o.payment_status === 'failed'
                        ? 'text-destructive'
                        : 'text-amber-600'
                  }
                >
                  {o.payment_status}
                </span>
              </td>
              <td className="px-3 py-2">
                <SelectDropdown
                  value={o.status}
                  disabled={busy === o.id}
                  onChange={(v) => update(o.id, v as OrderStatus)}
                  className="min-w-[9rem]"
                  ariaLabel="Cambiar estado"
                  options={STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }))}
                />
              </td>
            </tr>
          ))}
          {!orders.length && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                Sin órdenes.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
