import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Product } from '@/types/database';
import { CART_STORAGE_KEY } from '@/lib/utils/constants';
import { applyOffer } from '@/lib/utils/currency';
import { productPriceUsd } from '@/lib/demo/pricing';

export interface CartLine {
  product: Product;
  quantity: number;
}

interface CartState {
  items: CartLine[];
  ownerId: string | null;
  guestMergePending: boolean;
  syncDirty: boolean;
  isOpen: boolean;
  hydrated: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
  syncError: string | null;
  retrySync: () => void;
  addItem: (product: Product, qty?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, qty: number) => void;
  replaceItems: (items: CartLine[]) => void;
  setOwner: (ownerId: string | null) => void;
  clear: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: (open?: boolean) => void;
  setHydrated: () => void;
}

export function cartQuantity(product: Product, quantity: number): number {
  if (!product?.is_active || !Number.isFinite(product.stock_quantity) || !Number.isFinite(quantity)) return 0;
  return Math.max(0, Math.min(Math.floor(quantity), Math.floor(product.stock_quantity), 99));
}

export function normalizeCart(items: CartLine[]): CartLine[] {
  const lines = new Map<string, CartLine>();
  for (const line of items) {
    const product = line?.product;
    if (!product?.id || !Number.isFinite(product.price_usd) || product.price_usd < 0 ||
        !Number.isFinite(product.price_ves) || product.price_ves < 0 || !Array.isArray(product.images)) continue;
    const quantity = cartQuantity(product, line.quantity);
    if (quantity > 0 && (lines.has(product.id) || lines.size < 100)) lines.set(product.id, { product, quantity });
  }
  return [...lines.values()];
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      ownerId: null,
      guestMergePending: false,
      syncDirty: false,
      isOpen: false,
      hydrated: false,
      syncStatus: 'idle',
      syncError: null,
      retrySync: () => {},
      addItem: (product, qty = 1) => set((state) => {
        const existing = state.items.find((line) => line.product.id === product.id);
        const increment = Number.isFinite(qty) ? Math.max(0, Math.floor(qty)) : 0;
        const quantity = cartQuantity(product, (existing?.quantity ?? 0) + increment);
        const others = state.items.filter((line) => line.product.id !== product.id);
        if (!quantity) return { items: others };
        if (!existing && !increment) return state;
        return { items: normalizeCart([...others, { product, quantity }]) };
      }),
      removeItem: (id) => set((state) => ({ items: state.items.filter((line) => line.product.id !== id) })),
      updateQuantity: (id, qty) => set((state) => ({
        items: normalizeCart(state.items.map((line) => line.product.id === id ? { ...line, quantity: qty } : line))
      })),
      replaceItems: (items) => set({ items: normalizeCart(items) }),
      setOwner: (ownerId) => set((state) => ({
        ownerId,
        items: state.ownerId && state.ownerId !== ownerId ? [] : state.items,
        guestMergePending: state.ownerId === ownerId ? state.guestMergePending : !state.ownerId && !!ownerId && state.items.length > 0,
        syncDirty: state.ownerId === ownerId ? state.syncDirty : false,
        syncStatus: 'idle',
        syncError: null
      })),
      clear: () => set({ items: [] }),
      openDrawer: () => set({ isOpen: true }),
      closeDrawer: () => set({ isOpen: false }),
      toggleDrawer: (open) => set({ isOpen: open ?? !get().isOpen }),
      setHydrated: () => set({ hydrated: true })
    }),
    {
      name: CART_STORAGE_KEY,
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items, ownerId: state.ownerId, guestMergePending: state.guestMergePending, syncDirty: state.syncDirty }),
      // Legacy entries sometimes contain already-discounted prices; they cannot be safely recovered.
      migrate: () => ({ items: [], ownerId: null }),
      merge: (persisted, current) => {
        const saved = persisted as { items?: CartLine[]; ownerId?: string | null; guestMergePending?: boolean; syncDirty?: boolean } | undefined;
        return {
          ...current,
          items: Array.isArray(saved?.items) ? normalizeCart(saved.items) : [],
          ownerId: typeof saved?.ownerId === 'string' ? saved.ownerId : null,
          guestMergePending: saved?.guestMergePending === true,
          syncDirty: saved?.syncDirty === true
        };
      },
      onRehydrateStorage: () => (state) => state?.setHydrated()
    }
  )
);

export function selectCartCount(state: Pick<CartState, 'items'>): number {
  return state.items.reduce((total, line) => total + line.quantity, 0);
}

export function selectCartSubtotalUsd(state: Pick<CartState, 'items'>): number {
  return Math.round(state.items.reduce((total, line) => total +
    productPriceUsd(line.product) * line.quantity, 0) * 100) / 100;
}

export function selectCartSubtotalVes(state: Pick<CartState, 'items'>): number {
  return Math.round(state.items.reduce((total, line) => total +
    applyOffer(line.product.price_ves, line.product.is_offer ? line.product.offer_percentage : null) * line.quantity, 0) * 100) / 100;
}
