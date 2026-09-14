import { normalizeCart, useCartStore, type CartLine } from '@/store/cartStore';

export function cartInput(items: CartLine[]) {
  return normalizeCart(items).map(({ product, quantity }) => ({ product_id: product.id, quantity }));
}

export function mergeGuestCart(remote: CartLine[], guest: CartLine[]): CartLine[] {
  const result = new Map(remote.map((line) => [line.product.id, line]));
  for (const line of guest) {
    const saved = result.get(line.product.id);
    result.set(line.product.id, { product: saved?.product ?? line.product, quantity: (saved?.quantity ?? 0) + line.quantity });
  }
  return normalizeCart([...result.values()]);
}

function applyLocalChanges(remote: CartLine[], before: CartLine[], after: CartLine[]): CartLine[] {
  const result = new Map(remote.map((line) => [line.product.id, line]));
  for (const id of new Set([...before, ...after].map((line) => line.product.id))) {
    const initial = before.find((line) => line.product.id === id);
    const current = after.find((line) => line.product.id === id);
    if (initial?.quantity === current?.quantity) continue;
    if (!current) result.delete(id);
    else result.set(id, { product: result.get(id)?.product ?? current.product, quantity: current.quantity });
  }
  return normalizeCart([...result.values()]);
}

export function createCartSync(fetcher: typeof fetch = fetch) {
  let owner: string | null | undefined;
  let generation = 0;
  let revision = 0;
  let ready = false;
  let applying = false;
  let disposed = false;
  let queue: Promise<void> = Promise.resolve();
  let controller = new AbortController();
  let initialItems: CartLine[] = [];
  let mergeGuest = false;

  const valid = (version: number) => !disposed && generation === version && owner === useCartStore.getState().ownerId;
  const apply = (items: CartLine[]) => {
    applying = true;
    useCartStore.getState().replaceItems(items);
    applying = false;
  };
  const error = (cause: unknown, version: number) => {
    if (valid(version)) useCartStore.setState({ syncStatus: 'error', syncError: cause instanceof Error ? cause.message : 'No se pudo sincronizar el carrito.' });
  };
  async function request(id: string, signal: AbortSignal, items?: CartLine[]): Promise<CartLine[]> {
    const response = await fetcher('/api/carrito', {
      method: items ? 'PUT' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
      headers: { 'Content-Type': 'application/json', 'X-Cart-Owner': id },
      ...(items ? { body: JSON.stringify({ items: cartInput(items), mode: 'replace' }) } : {})
    });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'No se pudo sincronizar el carrito. Tus cambios locales se conservan.');
    if (!Array.isArray(body.items)) throw new Error('La respuesta del carrito no es válida. Inténtalo de nuevo.');
    return normalizeCart(body.items);
  }
  function save() {
    if (!owner || !ready || disposed) return;
    const version = generation;
    const mutation = revision;
    const id = owner;
    const signal = controller.signal;
    const snapshot = useCartStore.getState().items;
    useCartStore.setState({ syncStatus: 'syncing', syncError: null });
    queue = queue.then(async () => {
      if (!valid(version)) return;
      try {
        const canonical = await request(id, signal, snapshot);
        if (!valid(version)) return;
        if (revision === mutation) {
          apply(canonical);
          useCartStore.setState({ syncStatus: 'idle', syncError: null, syncDirty: false });
        }
      } catch (cause) { error(cause, version); }
    });
  }
  function initialize() {
    if (!owner || disposed) return;
    const version = generation;
    const id = owner;
    const signal = controller.signal;
    useCartStore.setState({ syncStatus: 'syncing', syncError: null });
    queue = queue.then(async () => {
      if (!valid(version)) return;
      try {
        const remote = await request(id, signal);
        if (!valid(version)) return;
        const local = useCartStore.getState().items;
        const combined = mergeGuest ? mergeGuestCart(remote, local) : applyLocalChanges(remote, initialItems, local);
        apply(combined);
        // Once merged, retries always replace this exact final state, never increment it again.
        mergeGuest = false;
        useCartStore.setState({ guestMergePending: false, syncDirty: true });
        ready = true;
        if (JSON.stringify(cartInput(combined)) !== JSON.stringify(cartInput(remote))) save();
        else useCartStore.setState({ syncStatus: 'idle', syncError: null, syncDirty: false });
      } catch (cause) { error(cause, version); }
    });
  }
  const unsubscribe = useCartStore.subscribe((state, previous) => {
    if (applying || state.items === previous.items) return;
    revision += 1;
    if (owner) useCartStore.setState({ syncDirty: true });
    if (ready) save();
  });
  return {
    setUser(id: string | null) {
      if (owner === id || disposed) return;
      controller.abort();
      controller = new AbortController();
      generation += 1;
      ready = false;
      owner = id;
      applying = true;
      useCartStore.getState().setOwner(id);
      applying = false;
      const state = useCartStore.getState();
      initialItems = state.items;
      mergeGuest = state.guestMergePending;
      if (id && state.syncDirty && !mergeGuest) { ready = true; save(); }
      else if (id) initialize();
    },
    retry() { if (ready) save(); else initialize(); },
    stop() {
      disposed = true;
      controller.abort();
      unsubscribe();
    }
  };
}
