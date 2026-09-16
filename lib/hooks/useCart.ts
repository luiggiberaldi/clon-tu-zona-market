'use client';

import { createElement, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { hasSupabaseConfig, isDemoMode } from '@/lib/config';
import { createCartSync } from '@/lib/cart-sync';
import { useToast } from '@/components/ui/toast';
import { useCartStore, selectCartCount, selectCartSubtotalUsd, selectCartSubtotalVes } from '@/store/cartStore';
import type { Product } from '@/types';

export function CartSync() {
  const hydrated = useCartStore((state) => state.hydrated);
  const error = useCartStore((state) => state.syncError);
  const queryClient = useQueryClient();
  const handleRetry = useCartStore(state => state.retrySync);

  useEffect(() => {
    if (!hydrated) return;
    if (!hasSupabaseConfig() && !isDemoMode()) {
      useCartStore.getState().setOwner(null);
      return;
    }
    const sync = createCartSync();
    useCartStore.setState({ retrySync: sync.retry });
    const supabase = createBrowserSupabase();
    let live = true;
    let eventRevision = 0;
    let currentUser: string | null | undefined;
    const acceptUser = (id: string | null) => {
      if (!live) return;
      if (currentUser !== undefined && currentUser !== id) {
        void queryClient.cancelQueries();
        queryClient.clear();
      }
      currentUser = id;
      sync.setUser(id);
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      eventRevision += 1;
      acceptUser(session?.user.id ?? null);
    });
    const initialRevision = eventRevision;
    void supabase.auth.getUser().then(({ data: auth, error: authError }) => {
      if (!live || initialRevision !== eventRevision) return;
      if (authError && authError.name !== 'AuthSessionMissingError') {
        useCartStore.setState({ syncStatus: 'error', syncError: 'No se pudo verificar tu sesión. Actualiza antes de confirmar el pedido.' });
        return;
      }
      acceptUser(auth.user?.id ?? null);
    }).catch(() => {
      if (live) useCartStore.setState({ syncStatus: 'error', syncError: 'No se pudo verificar tu sesión. Actualiza antes de confirmar el pedido.' });
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
      sync.stop();
    };
  }, [hydrated, queryClient]);

  if (!error) return null;
  return createElement('div', { role: 'alert', className: 'border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950' },
    error, ' ', createElement('button', { type: 'button', className: 'font-semibold underline', onClick: handleRetry }, 'Reintentar sincronización'));
}

export function useCart() {
  const items = useCartStore((state) => state.items);
  const isOpen = useCartStore((state) => state.isOpen);
  const hydrated = useCartStore((state) => state.hydrated);
  const openDrawer = useCartStore((state) => state.openDrawer);
  const closeDrawer = useCartStore((state) => state.closeDrawer);
  const { toast } = useToast();

  const addItem = useCallback(async (product: Product, qty = 1) => {
    const before = useCartStore.getState().items.find((line) => line.product.id === product.id)?.quantity ?? 0;
    useCartStore.getState().addItem(product, qty);
    const after = useCartStore.getState().items.find((line) => line.product.id === product.id)?.quantity ?? 0;
    if (after > before) {
      openDrawer();
    } else {
      toast({ title: 'No se agregaron unidades', description: 'Revisa el stock disponible y la cantidad solicitada.', variant: 'info' });
    }
  }, [openDrawer, toast]);
  const removeItem = useCallback(async (id: string) => { useCartStore.getState().removeItem(id); }, []);
  const updateQuantity = useCallback(async (id: string, quantity: number) => { useCartStore.getState().updateQuantity(id, quantity); }, []);
  const clear = useCallback(async () => { useCartStore.getState().clear(); }, []);

  return {
    items, isOpen, hydrated,
    count: selectCartCount({ items }),
    subtotalUsd: selectCartSubtotalUsd({ items }),
    subtotalVes: selectCartSubtotalVes({ items }),
    addItem, removeItem, updateQuantity, clear, openDrawer, closeDrawer
  };
}
