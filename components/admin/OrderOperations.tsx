'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { SelectDropdown } from '@/components/ui/select-dropdown';
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
  const [orderStatus, setOrderStatus] = useState(order.status);
  const [paymentStatus, setPaymentStatus] = useState(order.payment_status);
  const [assignedDriverId, setAssignedDriverId] = useState(order.driver_id);
  const [prevOrder, setPrevOrder] = useState(order);

  if (order !== prevOrder) {
    setPrevOrder(order);
    setOrderStatus(order.status);
    setPaymentStatus(order.payment_status);
    setAssignedDriverId(order.driver_id);
  }

  const options = (nextStates[orderStatus] || []).filter(
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
        const res = await adminRequest<{ order?: Order }>('/api/admin/ordenes/' + order.id + '/pago', 'POST', {
          action: f.get('action'),
          note: f.get('note')
        });
        if (res?.order?.payment_status) setPaymentStatus(res.order.payment_status);
        else if (f.get('action') === 'approve') setPaymentStatus('paid');
      } else {
        const nextStatus = f.get('status') as OrderStatus;
        const nextDriver = f.get('driver_id') ? String(f.get('driver_id')) : undefined;
        await adminRequest('/api/ordenes/' + order.id, 'PATCH', {
          status: nextStatus,
          driver_id: nextDriver,
          cancellation_reason: String(f.get('reason') || '') || undefined
        });
        if (nextStatus) setOrderStatus(nextStatus);
        if (nextDriver !== undefined) setAssignedDriverId(nextDriver);
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
            {ORDER_STATUS_LABELS[orderStatus]} · Pago: {paymentStatus} ·{' '}
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
            Cambiar estado
            <SelectDropdown name="status" ariaLabel="Cambiar estado" className="mt-1 block" options={options.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }))} />
          </label>
          {!driverMode && (
            <label className="text-xs">
              Repartidor
              <SelectDropdown
                name="driver_id"
                defaultValue={assignedDriverId || ''}
                ariaLabel="Repartidor"
                placeholder="Mantener asignación"
                className="mt-1 block"
                options={drivers.map((d) => ({ value: d.id, label: d.full_name || d.email }))}
              />
            </label>
          )}
          {!driverMode && (
            <label className="text-xs">
              Motivo si cancelas
              <input
                name="reason"
                minLength={5}
                maxLength={1000}
                className="mt-1 block rounded-lg border p-2"
              />
            </label>
          )}
          <Button size="sm" disabled={busy}>
            Actualizar
          </Button>
        </form>
      )}
      {!driverMode &&
        orderStatus !== 'cancelled' &&
        ['pending', 'paid'].includes(paymentStatus) && (
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
                <SelectDropdown
                  name="action"
                  ariaLabel="Acción"
                  className="ml-2"
                  options={paymentStatus === 'paid'
                    ? [{ value: 'refund', label: 'Devolución ejecutada' }]
                    : order.payment_method !== 'cash'
                      ? [{ value: 'approve', label: 'Pago recibido y verificado' }, { value: 'reject', label: 'Referencia rechazada' }]
                      : [{ value: 'approve', label: 'Pago recibido y verificado' }]}
                />
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
          <OrderRow key={o.id} order={o} drivers={drivers} driverMode={driverMode} />
        ))
      ) : (
        <p className="rounded-xl border bg-white p-6 text-muted-foreground">
          No hay pedidos en esta vista.
        </p>
      )}
    </div>
  );
}
