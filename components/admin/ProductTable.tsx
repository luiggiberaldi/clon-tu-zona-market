'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2, Pencil, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/utils/formatters';
import type { Product } from '@/types';

export function ProductTable({ products }: { products: Product[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onDelete(p: Product) {
    if (!confirm(p.is_active ? `¿Eliminar producto "${p.name}"? Esta acción lo desactiva.` : `¿Activar de nuevo "${p.name}"?`)) return;
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/productos/${p.slug}`, p.is_active ? { method: 'DELETE' } : { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: true }) });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        throw new Error(result.error || 'No se pudo desactivar');
      }
      toast({ title: p.is_active ? 'Producto desactivado' : 'Producto activado', variant: 'success' });
      startTransition(router.refresh);
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'No se pudo desactivar', variant: 'error' });
    } finally { setBusyId(null); }
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Nombre</th>
            <th className="px-3 py-2">SKU</th>
            <th className="px-3 py-2">Stock</th>
            <th className="px-3 py-2 text-right">USD</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {products.map((p) => (
            <tr key={p.id} className="hover:bg-secondary/30">
              <td className="px-3 py-2">
                <Link href={p.is_active ? `/productos/${p.slug}` : `/admin/productos?edit=${p.slug}`} className="font-medium hover:underline">
                  {p.name}
                </Link>
                {p.is_offer && (
                  <span className="ml-2 rounded-full bg-destructive/10 px-1.5 text-xs text-destructive">
                    -{p.offer_percentage ?? 0}%
                  </span>
                )}
                {!p.is_active && (
                  <span className="ml-2 rounded-full bg-muted px-1.5 text-xs">Inactivo</span>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{p.sku ?? '—'}</td>
              <td className="px-3 py-2">
                <span className={p.stock_quantity < p.min_stock ? 'text-destructive' : ''}>
                  {p.stock_quantity}
                </span>
              </td>
              <td className="px-3 py-2 text-right">{formatMoney(p.price_usd, 'USD')}</td>
              <td className="px-3 py-2">{p.is_active ? 'Activo' : 'Inactivo'}</td>
              <td className="px-3 py-2 text-right">
                <div className="inline-flex gap-1">
                  <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                    <Link href={`/admin/productos?edit=${p.slug}`} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={() => onDelete(p)}
                    disabled={busyId === p.id || pending}
                    aria-label={p.is_active ? 'Eliminar' : 'Activar'}
                  >
                    {p.is_active ? <Trash2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {!products.length && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                No hay productos.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
