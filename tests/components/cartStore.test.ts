import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore, selectCartCount, selectCartSubtotalUsd } from '@/store/cartStore';
import type { Product } from '@/types';

const SAMPLE: Product = {
  id: 'p1',
  name: 'Producto Test',
  slug: 'producto-test',
  description: null,
  category_id: null,
  price_usd: 10,
  price_ves: 365,
  stock_quantity: 5,
  min_stock: 1,
  sku: 'SKU-1',
  barcode: null,
  images: [],
  is_prime: false,
  is_offer: false,
  offer_percentage: null,
  is_active: true,
  metadata: {},
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z'
};

function reset() {
  useCartStore.setState({ items: [], isOpen: false });
}

describe('cartStore', () => {
  beforeEach(reset);

  it('agrega un item al carrito', () => {
    useCartStore.getState().addItem(SAMPLE, 2);
    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.product.id).toBe('p1');
    expect(state.items[0]?.quantity).toBe(2);
  });

  it('acumula cantidad si el item ya está', () => {
    useCartStore.getState().addItem(SAMPLE, 1);
    useCartStore.getState().addItem(SAMPLE, 2);
    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.quantity).toBe(3);
  });

  it('respeta el límite de stock', () => {
    useCartStore.getState().addItem(SAMPLE, 10);
    const state = useCartStore.getState();
    expect(state.items[0]?.quantity).toBeLessThanOrEqual(5);
  });

  it('actualiza cantidad de un item', () => {
    useCartStore.getState().addItem(SAMPLE, 1);
    useCartStore.getState().updateQuantity('p1', 4);
    expect(useCartStore.getState().items[0]?.quantity).toBe(4);
  });

  it('elimina item con cantidad 0', () => {
    useCartStore.getState().addItem(SAMPLE, 1);
    useCartStore.getState().updateQuantity('p1', 0);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('remueve item explícitamente', () => {
    useCartStore.getState().addItem(SAMPLE, 1);
    useCartStore.getState().removeItem('p1');
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('vacía el carrito', () => {
    useCartStore.getState().addItem(SAMPLE, 3);
    useCartStore.getState().clear();
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('cuenta total de unidades', () => {
    useCartStore.getState().addItem(SAMPLE, 2);
    const state = useCartStore.getState();
    expect(selectCartCount(state)).toBe(2);
  });

  it('calcula subtotal USD', () => {
    useCartStore.getState().addItem(SAMPLE, 3);
    const state = useCartStore.getState();
    expect(selectCartSubtotalUsd(state)).toBe(30);
  });

  it('maneja drawer abierto/cerrado', () => {
    expect(useCartStore.getState().isOpen).toBe(false);
    useCartStore.getState().openDrawer();
    expect(useCartStore.getState().isOpen).toBe(true);
    useCartStore.getState().closeDrawer();
    expect(useCartStore.getState().isOpen).toBe(false);
    useCartStore.getState().toggleDrawer();
    expect(useCartStore.getState().isOpen).toBe(true);
  });
});
