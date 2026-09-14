'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCartStore } from '@/store/cartStore';
import { cartInput } from '@/lib/cart-sync';
import { useNow } from '@/lib/hooks/useNow';
import { CustomerGate } from '@/components/checkout/CustomerGate';
import { AddressSelector } from '@/components/checkout/AddressSelector';
import { TimeSlotPicker, availableDeliverySlots } from '@/components/checkout/TimeSlotPicker';
import { PaymentSelector } from '@/components/checkout/PaymentSelector';
import { OrderSummary } from '@/components/checkout/OrderSummary';
import { ordersApi, OrderRequestError } from '@/lib/api/orders';
import { checkoutSchema } from '@/lib/utils/validation';
import type { CheckoutPayload } from '@/types';
import type { CorePaymentMethod, DeliverySlot } from '@/types/commerce';

type Attempt = { payload: CheckoutPayload; intent: string };
export function CheckoutForm() {
  return (
    <CustomerGate redirect="/checkout">
      {(userId) => <AuthenticatedCheckout key={userId} userId={userId} />}
    </CustomerGate>
  );
}
function AuthenticatedCheckout({ userId }: { userId: string }) {
  const router = useRouter();
  const now = useNow();
  const items = useCartStore((state) => state.items);
  const ownerId = useCartStore((state) => state.ownerId);
  const hydrated = useCartStore((state) => state.hydrated);
  const guestMergePending = useCartStore((state) => state.guestMergePending);
  const [addressId, setAddressId] = useState<string>();
  const [slot, setSlot] = useState<DeliverySlot>();
  const [payment, setPayment] = useState<CorePaymentMethod>();
  const [instructions, setInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [unresolved, setUnresolved] = useState<Attempt | null>(null);
  const [recovered, setRecovered] = useState(false);
  const lock = useRef(false);
  const live = useRef(true);
  const storageKey = 'mercado-pending-order:' + userId;

  useEffect(() => {
    live.current = true;
    // Recover an ambiguous response only for this account. Never persist payment secrets.
    const timer = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        const saved: unknown = raw ? JSON.parse(raw) : null;
        if (saved && typeof saved === 'object' && 'payload' in saved) {
          const parsed = checkoutSchema.safeParse(saved.payload);
          if (parsed.success) {
            const restored = { payload: parsed.data, intent: '' };
            setUnresolved(restored);
            setSubmitError(
              'Hay una confirmación pendiente de respuesta. Recupera ese mismo pedido antes de crear otro.'
            );
          }
        }
      } catch {
        /* Storage is optional; in-page idempotency still applies. */
      }
      setRecovered(true);
    }, 0);
    return () => {
      live.current = false;
      clearTimeout(timer);
    };
  }, [storageKey]);

  const config = useQuery({
    queryKey: ['checkout-config'],
    queryFn: ({ signal }) => ordersApi.config(signal),
    staleTime: 30000
  });
  const slots = useQuery({
    queryKey: ['checkout-slots', userId, addressId],
    queryFn: ({ signal }) => ordersApi.slots(addressId!, signal),
    enabled: !!addressId,
    refetchInterval: 30000
  });
  const input = cartInput(items);
  const quoteKey = JSON.stringify({
    items: input,
    address_id: addressId,
    delivery_date: slot?.date,
    time_slot_start: slot?.start
  });
  const ready = hydrated && recovered && ownerId === userId && !guestMergePending;
  const quote = useQuery({
    queryKey: ['checkout-quote', userId, quoteKey],
    queryFn: async ({ signal }) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 250);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true }
        );
      });
      return ordersApi.quote(JSON.parse(quoteKey), signal);
    },
    enabled: ready && !!addressId && input.length > 0 && !submitted && !unresolved,
    staleTime: 10000,
    refetchInterval: 30000,
    retry: false
  });
  const selectedMethod = config.data?.payment_methods.find(
    (method) => method.id === payment && method.enabled
  );
  const slotValid =
    !!slot &&
    availableDeliverySlots(slots.data?.slots ?? [], now).some(
      (entry) => entry.date === slot.date && entry.start === slot.start
    );
  const canSubmit = !!(
    ready &&
    input.length &&
    addressId &&
    slotValid &&
    selectedMethod &&
    quote.data &&
    !quote.isFetching &&
    !quote.error &&
    !slots.isFetching &&
    !slots.error &&
    !config.isFetching &&
    !config.error &&
    !unresolved
  );

  async function onSubmit() {
    if (lock.current || submitted || (!unresolved && !canSubmit)) return;
    let current = unresolved;
    if (!current) {
      if (!addressId || !slot || !payment || !quote.data) return;
      const payload: CheckoutPayload = {
        items: input,
        address_id: addressId,
        payment_method: payment,
        delivery_date: slot.date,
        time_slot_start: slot.start,
        expected_total_usd: quote.data.total_usd,
        expected_rate: quote.data.exchange_rate,
        idempotency_key: crypto.randomUUID(),
        delivery_instructions: instructions.trim() || undefined
      };
      current = { payload, intent: quoteKey };
    }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(current));
    } catch {
      /* Optional persistence. */
    }
    lock.current = true;
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      const { order } = await ordersApi.create(current.payload);
      if (!order?.id || order.user_id !== userId)
        throw new OrderRequestError('La confirmación quedó incompleta.', 0);
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* Optional storage. */
      }
      if (!live.current) return;
      setUnresolved(null);
      setSubmitted(true);
      // Preserve items added elsewhere while the request was in flight.
      if (useCartStore.getState().ownerId === userId) {
        const purchased = new Map(
          current.payload.items.map((line) => [line.product_id, line.quantity])
        );
        const remaining = useCartStore
          .getState()
          .items.map((line) => ({
            ...line,
            quantity: Math.max(0, line.quantity - (purchased.get(line.product.id) || 0))
          }));
        useCartStore.getState().replaceItems(remaining);
      }
      router.push(`/mis-pedidos/${order.id}`);
    } catch (cause) {
      if (!live.current) return;
      const ambiguous = !(cause instanceof OrderRequestError) || cause.ambiguous;
      if (ambiguous) setUnresolved(current);
      else {
        setUnresolved(null);
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* Optional storage. */
        }
        void quote.refetch();
        void slots.refetch();
      }
      setSubmitError(
        cause instanceof Error ? cause.message : 'No se pudo confirmar la respuesta del pedido.'
      );
    } finally {
      lock.current = false;
      if (live.current) setSubmitting(false);
    }
  }

  if (submitted)
    return (
      <Card className="p-6" role="status">
        Pedido guardado. Abriendo los detalles…
      </Card>
    );
  if (!ready) return <p role="status">Preparando el carrito de tu cuenta…</p>;
  if (!items.length && !unresolved)
    return (
      <Card className="space-y-3 p-6">
        <p>Tu carrito está vacío.</p>
        <Link href="/productos" className="text-primary underline">
          Explorar productos
        </Link>
      </Card>
    );
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <fieldset disabled={submitting || !!unresolved} className="min-w-0 space-y-6">
        <AddressSelector
          userId={userId}
          selectedId={addressId}
          onSelect={(id) => {
            if (id !== addressId) {
              setAddressId(id);
              setSlot(undefined);
            }
          }}
        />
        {addressId ? (
          <TimeSlotPicker
            key={addressId}
            slots={slots.data?.slots ?? []}
            selected={slot}
            onChange={setSlot}
            loading={slots.isPending || slots.isFetching}
            error={slots.error?.message}
            onRetry={() => void slots.refetch()}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Selecciona una dirección para consultar las entregas disponibles.
          </p>
        )}
        {config.isPending && <p role="status">Consultando métodos de pago…</p>}
        {config.error && (
          <div role="alert">
            <p>{config.error.message}</p>
            <Button type="button" variant="outline" onClick={() => void config.refetch()}>
              Reintentar
            </Button>
          </div>
        )}
        {config.data && (
          <PaymentSelector
            methods={config.data.payment_methods}
            selected={payment}
            onSelect={setPayment}
          />
        )}
        <Card className="p-4">
          <label htmlFor="instructions" className="text-sm font-medium">
            Instrucciones de entrega (opcional)
          </label>
          <textarea
            id="instructions"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            maxLength={1000}
            rows={3}
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Card>
      </fieldset>
      <div className="space-y-4">
        <OrderSummary
          quote={quote.data}
          loading={!!addressId && quote.isFetching}
          error={quote.error?.message}
        />
        {quote.error && (
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => void quote.refetch()}
          >
            Actualizar cotización
          </Button>
        )}
        {submitError && (
          <div role="alert" className="space-y-2 text-sm text-destructive">
            <p>{submitError}</p>
            {unresolved && (
              <p>
                Reintenta el mismo pedido: conserva su identificador y no duplica la compra. No
                repitas el pago.
              </p>
            )}
            <Link className="underline" href="/mis-pedidos">
              Consultar mis pedidos
            </Link>
          </div>
        )}
        <Button
          type="button"
          onClick={() => void onSubmit()}
          disabled={submitting || (!canSubmit && !unresolved)}
          className="w-full"
        >
          {submitting
            ? 'Confirmando…'
            : unresolved
              ? 'Recuperar el mismo pedido'
              : 'Confirmar pedido'}
        </Button>
        {!canSubmit && !unresolved && (
          <p className="text-center text-xs text-muted-foreground">
            Completa la dirección, el horario y un método habilitado. La cotización se vuelve a
            verificar al confirmar.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          El pago permanece pendiente hasta la verificación del comercio. No se recopilan datos de
          tarjeta.
        </p>
      </div>
    </div>
  );
}
