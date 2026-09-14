import type { Paginated, ProductFilters, ProductWithCategory } from '@/types';

const BASE = '';

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const productsApi = {
  list(filters: ProductFilters = {}): Promise<Paginated<ProductWithCategory>> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    });
    return http(`/api/productos?${params.toString()}`);
  },
  bySlug(slug: string): Promise<ProductWithCategory> {
    return http(`/api/productos/${slug}`);
  },
  updateStock(id: string, quantity: number): Promise<{ id: string; stock: number }> {
    return http(`/api/productos/${id}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity })
    });
  }
};
