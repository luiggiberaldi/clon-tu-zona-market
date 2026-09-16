'use client';
import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { SelectDropdown } from '@/components/ui/select-dropdown';
import { adminRequest } from '@/lib/admin-client';
import type { Category } from '@/types';
const subscribeToHydration = () => () => {};
export function CategoryManager({ categories }: { categories: Category[] }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(data: unknown, slug?: string) {
    setBusy(true);
    setMessage('');
    try {
      await adminRequest(
        slug ? '/api/categorias/' + slug : '/api/categorias',
        slug ? 'PATCH' : 'POST',
        data
      );
      setMessage('Categoría guardada.');
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      {!hydrated && <p role="status">Preparando el editor de categorías…</p>}
      {message && <p role="status">{message}</p>}
      <form
        className="flex flex-wrap gap-3 rounded-xl border bg-white p-4"
        method="post"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void save({
            name: f.get('name'),
            parent_id: f.get('parent_id') || null,
            sort_order: Number(f.get('sort_order')) || 0
          });
        }}
      >
        <label>
          Nombre
          <input
            name="name"
            required
            minLength={2}
            maxLength={100}
            className="ml-2 rounded border p-2"
          />
        </label>
        <label>
          Padre
          <SelectDropdown name="parent_id" ariaLabel="Categoría padre" placeholder="Categoría principal" className="ml-2" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
        </label>
        <label>
          Orden
          <input
            name="sort_order"
            type="number"
            min={0}
            defaultValue={0}
            className="ml-2 w-20 rounded border p-2"
          />
        </label>
        <Button disabled={busy || !hydrated}>Crear</Button>
      </form>
      {categories.map((c) => (
        <form
          key={c.id + JSON.stringify(c)}
          className="flex flex-wrap items-center gap-3 rounded border bg-white p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save(
              {
                name: f.get('name'),
                is_active: f.get('active') === 'on',
                sort_order: Number(f.get('order'))
              },
              c.slug
            );
          }}
        >
          <label className="sr-only" htmlFor={'name-' + c.id}>
            Nombre
          </label>
          <input
            id={'name-' + c.id}
            name="name"
            required
            minLength={2}
            defaultValue={c.name}
            className="rounded border p-2"
          />
          <span className="text-xs text-muted-foreground">
            {c.parent_id ? categories.find((p) => p.id === c.parent_id)?.name : 'Principal'} ·{' '}
            {c.slug}
          </span>
          <label>
            Orden
            <input
              name="order"
              type="number"
              min={0}
              defaultValue={c.sort_order}
              className="ml-1 w-20 rounded border p-2"
            />
          </label>
          <label>
            <input name="active" type="checkbox" defaultChecked={c.is_active} /> Activa
          </label>
          <Button size="sm" disabled={busy || !hydrated}>
            Guardar
          </Button>
        </form>
      ))}
    </div>
  );
}
