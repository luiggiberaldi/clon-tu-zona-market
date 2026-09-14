import type { Order, OrderWithItems, CheckoutPayload, CreateOrderResponse } from '@/types';
import type { CartInput, CheckoutConfig, CheckoutQuote, DeliverySlot } from '@/types/commerce';
import { hasSupabaseConfig, isDemoMode } from '@/lib/config';

export class OrderRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
  get ambiguous() { return this.status >= 500 || this.status === 0; }
}

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  if (!hasSupabaseConfig() && !isDemoMode()) throw new OrderRequestError('La tienda no tiene configurado su servicio de pedidos.', 503);
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new OrderRequestError(typeof body?.error === 'string' ? body.error : `La solicitud falló (${response.status}). Inténtalo de nuevo.`, response.status);
  if (body === null) throw new OrderRequestError('La respuesta quedó incompleta. Reintenta sin cambiar el pedido.', 0);
  return body as T;
}

export const ordersApi = {
  create(payload: CheckoutPayload): Promise<CreateOrderResponse> {
    return http('/api/ordenes', { method: 'POST', body: JSON.stringify(payload) });
  },
  list(signal?: AbortSignal): Promise<{ data: Order[] }> {
    return http('/api/ordenes', { signal });
  },
  byId(id: string, signal?: AbortSignal): Promise<OrderWithItems> {
    return http(`/api/ordenes/${encodeURIComponent(id)}`, { signal });
  },
  paymentReference(id: string, reference: string): Promise<{ order: Order }> {
    return http(`/api/ordenes/${encodeURIComponent(id)}/pago`, { method: 'POST', body: JSON.stringify({ reference }) });
  },
  config(signal?: AbortSignal): Promise<CheckoutConfig> {
    return http('/api/checkout/config', { signal });
  },
  slots(addressId: string, signal?: AbortSignal): Promise<{ slots: DeliverySlot[] }> {
    return http(`/api/checkout/slots?address_id=${encodeURIComponent(addressId)}`, { signal });
  },
  quote(payload: { items: CartInput[]; address_id: string; delivery_date?: string; time_slot_start?: string }, signal?: AbortSignal): Promise<CheckoutQuote> {
    return http('/api/checkout/quote', { method: 'POST', body: JSON.stringify(payload), signal });
  }
};
