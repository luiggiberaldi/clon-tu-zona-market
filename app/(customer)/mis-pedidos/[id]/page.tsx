'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CustomerGate } from '@/components/checkout/CustomerGate';
import { ordersApi } from '@/lib/api/orders';
import { formatMoney } from '@/lib/utils/formatters';
import { ORDER_STATUS_LABELS } from '@/lib/utils/constants';
import { Button } from '@/components/ui/button';
import { useNow } from '@/lib/hooks/useNow';
function OrderDetail({ id, userId }: { id: string; userId: string }) {
  const now = useNow();
  const query = useQuery({
    queryKey: ['order', userId, id],
    queryFn: ({ signal }) => ordersApi.byId(id, signal),
    refetchInterval: 30000
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await ordersApi.paymentReference(id, String(new FormData(e.currentTarget).get('reference')));
      await query.refetch();
      setMessage(
        'Referencia enviada. El comercio debe verificar el ingreso antes de confirmar el pago.'
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo enviar.');
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending) return <p role="status">Cargando pedido…</p>;
  if (query.error)
    return (
      <div role="alert">
        <p>{query.error.message}</p>
        <Button onClick={() => void query.refetch()}>Reintentar</Button>
      </div>
    );
  const order = query.data!;
  const expired = !!order.reservation_expires_at && Date.parse(order.reservation_expires_at) <= now;
  return (
    <div className="space-y-5">
      <Link className="text-sm underline" href="/mis-pedidos">
        Mis pedidos
      </Link>
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="text-2xl font-bold">{order.order_number}</h1>
        <span className="rounded-full bg-emerald-50 px-3 py-2 text-sm">
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </div>
      <p className="text-sm">
        Entrega: {order.delivery_date} · {order.time_slot_start.slice(0, 5)}–
        {order.time_slot_end.slice(0, 5)} (Caracas)
      </p>
      <div className="rounded-xl border bg-white p-5">
        <h2 className="font-bold">Productos</h2>
        <ul className="mt-3 divide-y">
          {order.order_items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 py-3 text-sm">
              <span>
                {item.quantity} × {item.product_name}
              </span>
              <strong>{formatMoney(item.total_usd, 'USD')}</strong>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-2 border-t pt-4">
          {[
            ['Subtotal', order.subtotal_usd],
            ['Envío', order.delivery_fee_usd],
            ['Total', order.total_usd]
          ].map(([label, value]) => (
            <div className="flex justify-between" key={label}>
              <dt>{label}</dt>
              <dd className="font-semibold">{formatMoney(Number(value), 'USD')}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-right text-sm">
          Total Bs: {formatMoney(order.total_ves, 'VES')} · Tasa registrada:{' '}
          {order.exchange_rate ?? 'No disponible'}
        </p>
      </div>
      <section className="space-y-3 rounded-xl border bg-white p-5">
        <h2 className="font-bold">
          Pago:{' '}
          {order.payment_status === 'paid'
            ? 'Confirmado'
            : order.payment_status === 'refunded'
              ? 'Devolución registrada'
              : order.payment_status === 'failed'
                ? 'Fallido'
                : 'Pendiente de verificación'}
        </h2>
        <p className="text-sm">
          Método: {order.payment_method}. Un pedido creado no significa que el pago esté confirmado.
        </p>
        {order.payment_instructions && (
          <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm">
            {order.payment_instructions}
          </p>
        )}
        {order.reservation_expires_at && (
          <p className="text-xs">
            {expired ? 'Reserva vencida' : 'Reserva vigente hasta'}:{' '}
            {new Date(order.reservation_expires_at).toLocaleString('es-VE', {
              timeZone: 'America/Caracas'
            })}
          </p>
        )}
        {order.payment_reference && (
          <p className="text-sm">Referencia enviada: {order.payment_reference}</p>
        )}
        {order.user_id === userId &&
          order.status === 'pending' &&
          order.payment_status === 'pending' &&
          order.payment_method !== 'cash' &&
          !expired && (
            <form className="space-y-3" onSubmit={(e) => void submit(e)}>
              <label className="block text-sm">
                Referencia de la transferencia / PagoMóvil
                <input
                  name="reference"
                  minLength={6}
                  maxLength={100}
                  required
                  defaultValue={order.payment_reference || ''}
                  className="mt-1 block w-full rounded border p-2"
                />
              </label>
              <p className="text-xs text-muted-foreground">
                No envíes contraseñas ni datos de tarjeta. La referencia será conciliada por una
                persona autorizada.
              </p>
              <Button disabled={busy}>{busy ? 'Enviando…' : 'Enviar referencia'}</Button>
            </form>
          )}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </section>
      {order.address_snapshot && (
        <section className="rounded-xl border p-5">
          <h2 className="font-bold">Dirección del pedido</h2>
          <p className="mt-2 text-sm">
            {String(order.address_snapshot.full_address || '')} ·{' '}
            {String(order.address_snapshot.area || '')} ·{' '}
            {String(order.address_snapshot.city || '')}
          </p>
        </section>
      )}
      <p className="text-sm text-muted-foreground">
        Para cancelar o solicitar una devolución, contacta al comercio desde Ayuda. Nunca repitas un
        pago sin confirmar antes el estado de este pedido.
      </p>
      <Link href="/ayuda" className="text-primary underline">
        Ayuda con mi pedido
      </Link>
    </div>
  );
}
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="container-prose py-8">
      <CustomerGate redirect={'/mis-pedidos/' + id}>
        {(userId) => <OrderDetail id={id} userId={userId} />}
      </CustomerGate>
    </div>
  );
}
