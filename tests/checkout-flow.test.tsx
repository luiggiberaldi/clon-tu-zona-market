import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { CheckoutPayload } from '@/types';
import { CheckoutForm } from '@/components/checkout/CheckoutForm';
import { OrderRequestError } from '@/lib/api/orders';
import { useCartStore } from '@/store/cartStore';
import { demoProducts } from '@/lib/demo/catalog';

const mocks = vi.hoisted(() => ({
  create: vi.fn(), quote: vi.fn(), config: vi.fn(), slots: vi.fn(), push: vi.fn()
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/api/orders', async original => {
  const actual = await original<typeof import('@/lib/api/orders')>();
  return { ...actual, ordersApi: mocks };
});
const owner = '11111111-1111-4111-8111-111111111111';
const address = '22222222-2222-4222-8222-222222222222';
vi.mock('@/components/checkout/CustomerGate', () => ({
  CustomerGate: ({ children }: { children: (id: string) => ReactNode }) => children('11111111-1111-4111-8111-111111111111')
}));
vi.mock('@/components/checkout/AddressSelector', () => ({
  AddressSelector: ({ onSelect }: { onSelect: (id: string) => void }) => <button onClick={() => onSelect('22222222-2222-4222-8222-222222222222')}>Use address</button>
}));
const product = { ...demoProducts[0]!, price_usd: 10, stock_quantity: 10, is_offer: false };
const clients: QueryClient[] = [];
let date: string;
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><CheckoutForm /></QueryClientProvider>);
}
async function completeForm() {
  await screen.findByRole('button', { name: 'Use address' });
  fireEvent.click(screen.getByRole('button', { name: 'Use address' }));
  await waitFor(() => expect(document.querySelectorAll('#slot-title + div button, section[aria-labelledby="slot-title"] button[aria-pressed]')).not.toHaveLength(0));
  const day = document.querySelector('section[aria-labelledby="slot-title"] button[aria-pressed]');
  if (!day) throw new Error('Expected an available delivery day');
  fireEvent.click(day);
  fireEvent.click(await screen.findByRole('button', { name: '09:00 – 11:00' }));
  fireEvent.click(await screen.findByRole('button', { name: /Efectivo de prueba/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar pedido' })).toBeEnabled());
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  useCartStore.setState({ ownerId: owner, items: [{ product, quantity: 2 }], hydrated: true, guestMergePending: false, syncDirty: false, syncStatus: 'idle', syncError: null });
  mocks.config.mockResolvedValue({ exchange_rate: 40, rate_updated_at: new Date().toISOString(), payment_methods: [{ id: 'cash', enabled: true, label: 'Efectivo de prueba', currency: 'USD', instructions: 'Pago de prueba' }], delivery_hours: {} });
  mocks.slots.mockResolvedValue({ slots: [{ date, start: '09:00', end: '11:00', available: 2 }] });
  mocks.quote.mockResolvedValue({ items: [{ product_id: product.id, name: product.name, quantity: 2, unit_price_usd: 10, total_usd: 20 }], subtotal_usd: 20, delivery_fee_usd: 2.5, total_usd: 22.5, total_ves: 900, exchange_rate: 40, rate_updated_at: new Date().toISOString(), min_order_usd: 1, time_slot_end: '11:00:00' });
  mocks.create.mockResolvedValue({ order: { id: 'saved-order', user_id: owner } });
});
afterEach(() => { for (const client of clients.splice(0)) client.clear(); });

describe('checkout with enabled auth, quote and payment contracts (mock transport)', () => {
  it('confirms explicit items and authoritative totals, clearing only after durable success', async () => {
    mount(); await completeForm();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pedido' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/mis-pedidos/saved-order'));
    const payload = mocks.create.mock.calls[0]![0] as CheckoutPayload;
    expect(payload.items).toEqual([{ product_id: product.id, quantity: 2 }]);
    expect(payload.expected_total_usd).toBe(22.5);
    expect(payload.expected_rate).toBe(40);
    expect(payload.idempotency_key).toMatch(/^[a-f0-9-]{36}$/);
    expect(useCartStore.getState().items).toHaveLength(0);
  });
  it('retries an ambiguous response with the identical payload and idempotency key', async () => {
    mocks.create.mockRejectedValueOnce(new TypeError('Network interrupted'));
    mount(); await completeForm(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar pedido' }));
    const retry = await screen.findByRole('button', { name: 'Recuperar el mismo pedido' });
    expect(useCartStore.getState().items[0]?.quantity).toBe(2);
    const first = mocks.create.mock.calls[0]![0];
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1]![0]).toEqual(first);
  });
  it('treats a rejected quote as a known failure rather than endlessly retrying old totals', async () => {
    mocks.create.mockRejectedValueOnce(new OrderRequestError('El precio cambió', 409));
    mount(); await completeForm(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar pedido' }));
    await screen.findByText('El precio cambió');
    expect(screen.queryByRole('button', { name: 'Recuperar el mismo pedido' })).not.toBeInTheDocument();
    expect(sessionStorage.getItem('mercado-pending-order:' + owner)).toBeNull();
    expect(useCartStore.getState().items[0]?.quantity).toBe(2);
  });
  it('recovers the same saved request after a remount without requiring a new quote', async () => {
    const payload: CheckoutPayload = { items: [{ product_id: product.id, quantity: 2 }], address_id: address, payment_method: 'cash', delivery_date: date, time_slot_start: '09:00', expected_total_usd: 22.5, expected_rate: 40, idempotency_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
    sessionStorage.setItem('mercado-pending-order:' + owner, JSON.stringify({ payload, intent: '' }));
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'Recuperar el mismo pedido' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(payload));
  });
  it('does not enable confirmation when the authoritative quote fails', async () => {
    mocks.quote.mockRejectedValue(new OrderRequestError('Stock insuficiente', 409));
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'Use address' }));
    await screen.findByText('Stock insuficiente');
    expect(screen.getByRole('button', { name: 'Confirmar pedido' })).toBeDisabled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
