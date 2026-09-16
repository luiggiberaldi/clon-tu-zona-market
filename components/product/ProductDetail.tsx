'use client';

import { useState } from 'react';
import { Minus, Plus, ShoppingBasket, PackageCheck, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ProductImages } from '@/components/product/ProductImages';
import { PriceDisplay, type PriceRateProps } from '@/components/shared/PriceDisplay';
import { ZoneSelector } from '@/components/layout/ZoneSelector';
import { useCart } from '@/lib/hooks/useCart';
import { productPriceUsd } from '@/lib/demo/pricing';
import type { ProductWithCategory } from '@/types';
import { isDemoMode } from '@/lib/config';

export function ProductDetail({ product, rate, rateUpdatedAt }: { product: ProductWithCategory } & PriceRateProps) {
  const { addItem, items } = useCart();
  const [qty, setQty] = useState(1);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const inCart = items.find((item) => item.product.id === product.id)?.quantity ?? 0;
  const available = Math.max(0, Math.min(product.stock_quantity, 99) - inCart);
  const finalPrice = productPriceUsd(product);
  const source = isDemoMode() ? product.metadata?.source as { url?: string; captured_at?: string; stock_at_capture?: number; facts?: string[] } | undefined : undefined;
  async function onAdd() {
    if (qty > available || busy) return;
    setBusy(true);
    try { await addItem(product, qty); setNotice(`${qty} × ${product.name} agregado al carrito.`); setQty(1); }
    catch { setNotice('No se pudo agregar el producto. Intenta nuevamente.'); }
    finally { setBusy(false); }
  }
  return (
    <div className="storefront-container py-7 sm:py-10">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-label="Ruta de navegación"><Link href="/carabobo">Inicio</Link><ChevronRight size={12} /><Link href="/productos">Supermercado</Link>{product.category && <><ChevronRight size={12} /><Link href={`/categorias/${product.category.slug}`}>{product.category.name}</Link></>}</nav>
      <div className="grid min-w-0 grid-cols-1 items-start gap-8 md:grid-cols-2 lg:gap-16">
        <ProductImages images={product.images} alt={product.name} />
        <div className="min-w-0 space-y-5 pt-2">
          {product.category && <p className="text-xs font-bold uppercase tracking-[0.15em] text-amber-900 dark:text-amber-300">{product.category.name}</p>}
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{product.name}</h1>
          {product.sku && <p className="text-xs text-muted-foreground">Código: {product.sku}</p>}
          <div className="flex flex-wrap items-center gap-4"><PriceDisplay usd={finalPrice} rate={rate} rateUpdatedAt={rateUpdatedAt} size="lg" showBoth />{finalPrice < product.price_usd && <><span className="old-price"><PriceDisplay usd={product.price_usd} rate={rate} rateUpdatedAt={rateUpdatedAt} /></span><span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-[#bd422f]">−{product.offer_percentage}%</span></>}</div>
          <p className={`flex items-center gap-2 text-sm font-medium ${product.stock_quantity > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}><PackageCheck size={17} />{product.stock_quantity > 0 ? `${product.stock_quantity} ${isDemoMode() ? 'en la copia local de prueba' : 'disponibles'}` : 'Producto agotado'}</p>
          {product.description && <p className="text-sm leading-7 text-muted-foreground">{product.description}</p>}
          {source && <section className="space-y-2 rounded-lg border bg-amber-50 p-4 text-xs"><h2 className="font-semibold">Datos publicados por la fuente</h2><p>Captura: {source.captured_at ? new Date(source.captured_at).toLocaleString('es-VE', { timeZone: 'America/Caracas' }) : 'No indicada'}. Existencias publicadas entonces: {source.stock_at_capture}. No es disponibilidad en tiempo real.</p>{source.facts?.filter(fact => /^(SKU|Dimensiones|Categoría|Etiquetas)/.test(fact)).map((fact,index)=><p key={index}>{fact}</p>)}{product.metadata?.modified_in_demo === true && <p className="font-semibold">Este registro fue editado en el demo; los cambios no provienen de la fuente.</p>}<a className="inline-block font-semibold text-amber-900 underline dark:text-amber-300" href={source.url} target="_blank" rel="noreferrer">Ver ficha original en TuZonaMarket</a></section>}
          <div className="flex flex-wrap items-center gap-3 border-y py-5"><div className="flex h-12 items-center rounded-full border"><button className="px-4 py-3 disabled:opacity-30" onClick={() => setQty((n) => Math.max(1, n - 1))} disabled={qty <= 1 || !available} aria-label="Reducir cantidad"><Minus size={16} /></button><span className="min-w-8 text-center text-sm font-semibold" aria-live="polite">{qty}</span><button className="px-4 py-3 disabled:opacity-30" onClick={() => setQty((n) => Math.min(available, n + 1))} disabled={qty >= available} aria-label="Aumentar cantidad"><Plus size={16} /></button></div><Button className="h-12 flex-1 rounded-full px-6" onClick={onAdd} disabled={!available || qty > available || busy}><ShoppingBasket size={19} />{busy ? 'Agregando…' : !available ? product.stock_quantity ? 'Máximo en carrito' : 'Agotado' : 'Agregar al carrito'}</Button></div>
          {notice && <p role="status" className="rounded-lg bg-secondary p-3 text-sm">{notice} <Link href="/carrito" className="font-bold text-amber-950 underline dark:text-amber-200">Ver carrito</Link></p>}
          <div className="rounded-xl bg-[#f3f6f0] p-5"><p className="mb-2 text-sm font-semibold">Una compra a tu medida</p><p className="mb-3 text-xs leading-relaxed text-muted-foreground">Selecciona tu sector para consultar la cobertura y el costo. Los horarios disponibles se confirman al finalizar el pedido.</p><ZoneSelector /></div>
        </div>
      </div>
    </div>
  );
}
