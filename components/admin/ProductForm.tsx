'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { SelectDropdown } from '@/components/ui/select-dropdown';
import { adminRequest } from '@/lib/admin-client';
import { slugify } from '@/lib/utils/formatters';
import type { Product, Category } from '@/types';
import { isDemoMode } from '@/lib/config';
export function ProductForm({ initial }: { initial?: Product }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [images, setImages] = useState(initial?.images.join('\n') || '');
  const cats = useQuery({
    queryKey: ['categories'],
    queryFn: () => adminRequest<{ data: Category[] }>('/api/categorias')
  });
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      const data = {
        name: String(f.get('name')),
        slug: initial?.slug || slugify(String(f.get('name'))),
        description: String(f.get('description') || ''),
        category_id: String(f.get('category_id') || '') || null,
        price_usd: Number(f.get('price_usd')),
        min_stock: Number(f.get('min_stock')),
        sku: String(f.get('sku') || '') || undefined,
        images: images
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        is_offer: f.get('is_offer') === 'on',
        offer_percentage: Number(f.get('offer_percentage')) || null,
        is_active: f.get('is_active') === 'on',
        ...(!initial ? { stock_quantity: Number(f.get('stock_quantity')) } : {})
      };
      await adminRequest(
        initial ? '/api/productos/' + initial.slug : '/api/productos',
        initial ? 'PATCH' : 'POST',
        data
      );
      router.push('/admin/productos');
      router.refresh();
      setMessage('Producto guardado.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const res = await fetch('/api/admin/imagenes', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo subir.');
      setImages((s) => [s, data.url].filter(Boolean).join('\n'));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error de imagen.');
    } finally {
      setBusy(false);
    }
  }
  async function stock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!initial) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await adminRequest('/api/productos/' + initial.slug + '/stock', 'PATCH', {
        quantity: Number(f.get('quantity')),
        mode: f.get('mode'),
        reason: f.get('reason')
      });
      setMessage('Stock ajustado y auditado.');
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo ajustar.');
    } finally {
      setBusy(false);
    }
  }
  const cls = 'mt-1 block w-full rounded-lg border p-2';
  return (
    <div className="max-w-3xl space-y-4">
      {message && (
        <p role="status" className="rounded border bg-amber-50 p-3 text-sm">
          {message}
        </p>
      )}
      <form onSubmit={(e) => void submit(e)} className="space-y-4 rounded-xl border bg-white p-5">
        <h2 className="text-lg font-bold">{initial ? 'Editar producto' : 'Nuevo producto'}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            Nombre
            <input
              name="name"
              required
              minLength={2}
              maxLength={255}
              defaultValue={initial?.name}
              className={cls}
            />
          </label>
          <label>
            SKU
            <input name="sku" maxLength={100} defaultValue={initial?.sku || ''} className={cls} />
          </label>
        </div>
        <label className="block">
          Descripción
          <textarea
            name="description"
            maxLength={2000}
            defaultValue={initial?.description || ''}
            className={cls}
          />
        </label>
        <label className="block">
          Categoría
          <SelectDropdown name="category_id" defaultValue={initial?.category_id || ''} ariaLabel="Categoría" placeholder="Sin categoría" className={cls} options={[{ value: '', label: 'Sin categoría' }, ...(cats.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            Precio base USD
            <input
              name="price_usd"
              type="number"
              min={0}
              max={99999}
              step="0.01"
              required
              defaultValue={initial?.price_usd || 0}
              className={cls}
            />
          </label>
          <label>
            Alerta stock mínimo
            <input
              name="min_stock"
              type="number"
              min={0}
              defaultValue={initial?.min_stock ?? 10}
              className={cls}
            />
          </label>
          {!initial && (
            <label>
              Stock inicial
              <input
                name="stock_quantity"
                type="number"
                min={0}
                required
                defaultValue={0}
                className={cls}
              />
            </label>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          El precio base debe incluir los impuestos aplicables del comercio. La conversión VES usa
          la tasa vigente; no se almacena un segundo precio independiente.
        </p>
        <label className="block">
          {isDemoMode() ? 'Imágenes (ruta local del demo o URL HTTPS por línea)' : 'Imágenes (una URL HTTPS por línea)'}
          <textarea
            value={images}
            onChange={(e) => setImages(e.target.value)}
            rows={3}
            className={cls}
          />
        </label>
        <label className="block text-sm">
          Subir JPEG, PNG o WebP (máximo 5 MB)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => void upload(e.target.files?.[0])}
            className={cls}
          />
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <label>
            <input type="checkbox" name="is_active" defaultChecked={initial?.is_active ?? true} />{' '}
            Activo
          </label>
          <label>
            <input type="checkbox" name="is_offer" defaultChecked={initial?.is_offer || false} />{' '}
            Oferta
          </label>
          <label>
            Descuento %
            <input
              name="offer_percentage"
              type="number"
              min={0}
              max={100}
              defaultValue={initial?.offer_percentage || 0}
              className="ml-2 w-20 rounded border p-2"
            />
          </label>
        </div>
        <Button disabled={busy}>Guardar producto</Button>
      </form>
      {initial && (
        <form className="space-y-3 rounded-xl border bg-white p-5" onSubmit={(e) => void stock(e)}>
          <h3 className="font-bold">Ajuste de inventario · Disponible: {initial.stock_quantity}</h3>
          <p className="text-xs">
            Usa el ajuste delta para entradas/salidas. El ajuste absoluto reemplaza la
            disponibilidad actual bajo bloqueo transaccional.
          </p>
          <div className="flex flex-wrap gap-3">
            <label>
              Operación
              <SelectDropdown name="mode" defaultValue="delta" ariaLabel="Operación" className={cls} options={[{ value: 'delta', label: 'Sumar / restar' }, { value: 'set', label: 'Fijar disponible' }]} />
            </label>
            <label>
              Cantidad
              <input name="quantity" type="number" required className={cls} />
            </label>
            <label>
              Motivo
              <input name="reason" required minLength={5} maxLength={1000} className={cls} />
            </label>
          </div>
          <Button disabled={busy}>Ajustar stock</Button>
        </form>
      )}
    </div>
  );
}
