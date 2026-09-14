'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { adminRequest } from '@/lib/admin-client';
import { formatMoney } from '@/lib/utils/formatters';
import { ORDER_STATUS_LABELS } from '@/lib/utils/constants';
import type { Order, OrderStatus, User } from '@/types';
import { isDemoMode } from '@/lib/config';
const nextStates: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['on_way', 'cancelled'],
  on_way: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: []
};
function OrderRow({
  order,
  drivers,
  driverMode
}: {
  order: Order;
  drivers: User[];
  driverMode: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const options = (nextStates[order.status] || []).filter(
    (s) => !driverMode || ['on_way', 'delivered'].includes(s)
  );
  async function run(e: React.FormEvent<HTMLFormElement>, payment: boolean) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      if (payment) {
        if (f.get('verified') !== 'on')
          throw new Error('Confirma la verificación del movimiento real.');
        await adminRequest('/api/admin/ordenes/' + order.id + '/pago', 'POST', {
          action: f.get('action'),
          note: f.get('note')
        });
      } else {
        await adminRequest('/api/ordenes/' + order.id, 'PATCH', {
          status: f.get('status'),
          driver_id: f.get('driver_id') || undefined,
          cancellation_reason: String(f.get('reason') || '') || undefined
        });
      }
      setMessage('Cambio guardado.');
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="rounded-xl border bg-white p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <Link href={'/mis-pedidos/' + order.id} className="font-bold text-primary underline">
            {order.order_number}
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">
            Entrega {order.delivery_date} · {order.time_slot_start.slice(0, 5)}–
            {order.time_slot_end.slice(0, 5)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold">
            {formatMoney(order.total_usd, 'USD')} · {formatMoney(order.total_ves, 'VES')}
          </p>
          <p className="text-xs">
            {ORDER_STATUS_LABELS[order.status]} · Pago: {order.payment_status} ·{' '}
            {order.payment_method}
          </p>
        </div>
      </div>
      {order.address_snapshot && (
        <p className="mt-3 text-sm">
          {String(order.address_snapshot.full_address || '')} ·{' '}
          {String(order.address_snapshot.area || '')}
        </p>
      )}
      {order.payment_reference && (
        <p className="mt-3 rounded-md bg-amber-50 p-2 text-sm">
          Referencia declarada: <strong>{order.payment_reference}</strong>. No equivale a pago
          verificado.
        </p>
      )}
      {options.length > 0 && (
        <form onSubmit={(e) => void run(e, false)} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-xs">
            Siguiente estado
            <select name="status" required className="mt-1 block rounded border p-2">
              {options.map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          {!driverMode && (
            <label className="text-xs">
              Repartidor
              <select
                name="driver_id"
                defaultValue={order.driver_id || ''}
                className="mt-1 block rounded border p-2"
              >
                <option value="">Mantener asignación</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name || d.email}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!driverMode && (
            <label className="text-xs">
              Motivo si cancelas
              <input
                name="reason"
                minLength={5}
                maxLength={1000}
                className="mt-1 block rounded border p-2"
              />
            </label>
          )}
          <Button size="sm" disabled={busy}>
            Actualizar
          </Button>
        </form>
      )}
      {!driverMode &&
        order.status !== 'cancelled' &&
        ['pending', 'paid'].includes(order.payment_status) && (
          <details className="mt-4 border-t pt-3">
            <summary className="cursor-pointer text-sm font-semibold">
              Conciliar pago / registrar devolución
            </summary>
            <form onSubmit={(e) => void run(e, true)} className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                {isDemoMode() ? 'Prueba local: esta decisión modifica el estado del pago simulado. No consultes cuentas bancarias ni muevas dinero real.' : 'Verifica el ingreso o devolución en la cuenta bancaria o caja. Esta acción registra la decisión; no mueve dinero ni acepta una imagen como prueba automática.'}
              </p>
              <label className="block text-xs">
                Acción
                <select name="action" className="ml-2 rounded border p-2">
                  {order.payment_status === 'paid' ? (
                    <option value="refund">Devolución ejecutada</option>
                  ) : (
                    <>
                      <option value="approve">Pago recibido y verificado</option>
                      {order.payment_method !== 'cash' && (
                        <option value="reject">Referencia rechazada</option>
                      )}
                    </>
                  )}
                </select>
              </label>
              <label className="block text-xs">
                Nota de verificación
                <textarea
                  name="note"
                  required
                  minLength={5}
                  maxLength={1000}
                  className="mt-1 block w-full rounded border p-2"
                />
              </label>
              <label className="flex gap-2 text-sm">
                <input type="checkbox" name="verified" required />
                {isDemoMode() ? 'Confirmo que esta revisión es solo una simulación local.' : 'He comprobado el movimiento real y el importe.'}
              </label>
              <Button disabled={busy} size="sm">
                Registrar revisión
              </Button>
            </form>
          </details>
        )}
      {message && (
        <p className="mt-3 text-sm" role="status">
          {message}
        </p>
      )}
    </article>
  );
}
export function OrderOperations({
  orders,
  drivers,
  driverMode = false
}: {
  orders: Order[];
  drivers: User[];
  driverMode?: boolean;
}) {
  return (
    <div className="space-y-4">
      {orders.length ? (
        orders.map((o) => (
          <OrderRow key={o.id + o.updated_at} order={o} drivers={drivers} driverMode={driverMode} />
        ))
      ) : (
        <p className="rounded-xl border bg-white p-6 text-muted-foreground">
          No hay pedidos en esta vista.
        </p>
      )}
    </div>
  );
}
