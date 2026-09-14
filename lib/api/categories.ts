import type { Category } from '@/types';

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const categoriesApi = {
  list(): Promise<{ data: Category[] }> {
    return http('/api/categorias');
  },
  bySlug(slug: string) {
    return http(`/api/categorias/${slug}`);
  }
};
