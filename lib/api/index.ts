export { productsApi } from './products';
export { ordersApi } from './orders';
export { zonesApi } from './zones';
export { categoriesApi } from './categories';

// Buscador — wrapper directo
export const searchApi = {
  async search(q: string): Promise<{ data: import('@/types').ProductWithCategory[] }> {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
};
