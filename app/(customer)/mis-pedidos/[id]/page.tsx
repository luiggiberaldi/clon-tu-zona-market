'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Sparkles } from 'lucide-react';
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
  async function simulatePayment() {
    setBusy(true);
    setMessage('');
    try {
      await ordersApi.simulatePayment(id);
      await query.refetch();
      setMessage('¡Pago simulado y aprobado con éxito en entorno de prueba!');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo simular el pago.');
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
          Total: {formatMoney(order.total_ves, 'VES')} · Tasa registrada:{' '}
          {order.exchange_rate ?? 'No disponible'}
        </p>
      </div>
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-lg text-foreground">
            Estado del Pago:{' '}
            <span className={order.payment_status === 'paid' ? 'text-emerald-700 dark:text-emerald-400' : ''}>
              {order.payment_status === 'paid'
                ? 'Confirmado ✓'
                : order.payment_status === 'refunded'
                  ? 'Devolución registrada'
                  : order.payment_status === 'failed'
                    ? 'Fallido'
                    : 'Pendiente de verificación'}
            </span>
          </h2>
          {order.payment_status === 'paid' && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              ✓ Pagado
            </span>
          )}
        </div>

        {order.payment_status === 'paid' && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/80 p-4 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <div className="flex items-center gap-2 font-bold text-sm text-emerald-900 dark:text-emerald-100">
              <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
              ¡Pago recibido y verificado con éxito!
            </div>
            <p className="mt-1 text-xs text-emerald-800/90 dark:text-emerald-300/90">
              Tu compra ha sido confirmada en el sistema. Tu pedido ya se encuentra agendado para su despacho.
            </p>
            {order.payment_reference && (
              <p className="mt-2 text-xs font-semibold">
                Referencia: <code className="rounded bg-emerald-200/60 px-1.5 py-0.5 font-mono text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-100">{order.payment_reference}</code>
              </p>
            )}
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Método seleccionado: <strong className="text-foreground capitalize">{order.payment_method}</strong>.
        </p>

        {order.payment_instructions && order.payment_status !== 'paid' && (
          <p className="whitespace-pre-line rounded-lg bg-secondary/50 p-3 text-sm">
            {order.payment_instructions}
          </p>
        )}

        {order.reservation_expires_at && order.payment_status !== 'paid' && (
          <p className="text-xs text-muted-foreground">
            {expired ? 'Reserva vencida' : 'Reserva vigente hasta'}:{' '}
            {new Date(order.reservation_expires_at).toLocaleString('es-VE', {
              timeZone: 'America/Caracas'
            })}
          </p>
        )}

        {order.payment_reference && order.payment_status !== 'paid' && (
          <p className="text-sm">Referencia enviada: <span className="font-mono font-semibold">{order.payment_reference}</span></p>
        )}

        {order.user_id === userId &&
          order.status === 'pending' &&
          order.payment_status === 'pending' &&
          !expired && (
            <div className="space-y-4 pt-2">
              <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <div className="flex items-center justify-between gap-2 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Sparkles size={14} className="text-amber-600 dark:text-amber-400" />
                    Modo Demostración / Simulación
                  </span>
                  <span className="rounded bg-amber-200/80 px-1.5 py-0.5 text-[9px] uppercase font-bold text-amber-900">
                    Demo
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-amber-900/80 dark:text-amber-200/80">
                  ¿Quieres probar cómo se ve la orden al completarse la venta? Puedes aprobar el pago simulado con un solo clic:
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => void simulatePayment()}
                  className="mt-3 font-semibold"
                >
                  {busy ? 'Simulando…' : '⚡ Simular aprobación de pago (Modo Demo)'}
                </Button>
              </div>

              {order.payment_method !== 'cash' && (
                <form className="space-y-3 border-t pt-4" onSubmit={(e) => void submit(e)}>
                  <label className="block text-sm font-medium">
                    O reporta una referencia manual:
                    <input
                      name="reference"
                      minLength={6}
                      maxLength={100}
                      required
                      defaultValue={order.payment_reference || ''}
                      placeholder="Ej: 12345678"
                      className="mt-1 block w-full rounded-md border border-input bg-background p-2 text-sm"
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    No envíes contraseñas ni datos de tarjeta. La referencia será conciliada por el comercio.
                  </p>
                  <Button variant="outline" disabled={busy}>{busy ? 'Enviando…' : 'Enviar referencia'}</Button>
                </form>
              )}
            </div>
          )}

        {message && (
          <p role="status" className="rounded-md bg-secondary p-3 text-sm font-medium">
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
