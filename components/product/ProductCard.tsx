'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Plus, Check, ShoppingBasket } from 'lucide-react';
import { PriceDisplay, type PriceRateProps } from '@/components/shared/PriceDisplay';
import { useCart } from '@/lib/hooks/useCart';
import { productPriceUsd } from '@/lib/demo/pricing';
import type { ProductWithCategory } from '@/types';
import { isDemoMode } from '@/lib/config';

export function ProductCard({ product, rate, rateUpdatedAt }: { product: ProductWithCategory } & PriceRateProps) {
  const { addItem, items } = useCart();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const inCart = items.find((item) => item.product.id === product.id)?.quantity ?? 0;
  const outOfStock = product.stock_quantity <= 0;
  const atLimit = inCart >= Math.min(product.stock_quantity, 99);
  const finalPrice = productPriceUsd(product);
  const discounted = finalPrice < product.price_usd;
  async function onAdd() {
    if (atLimit || added) return;
    setError('');
    try { await addItem(product, 1); setAdded(true); setTimeout(() => setAdded(false), 1400); }
    catch { setError('No se pudo agregar. Intenta de nuevo.'); }
  }
  return (
    <article className="product-card">
      <Link href={`/productos/${product.slug}`} className="product-image" aria-label={`Ver ${product.name}`}>
        {product.images[0] && !imageFailed ? <Image src={product.images[0]} alt={product.name} fill sizes="(max-width: 600px) 45vw, (max-width: 1000px) 28vw, 190px" className="object-contain" onError={() => setImageFailed(true)} /> : <div className="product-placeholder"><ShoppingBasket size={38} strokeWidth={1.2} /><span>Imagen no disponible</span></div>}
        {discounted && <span className="offer-badge">−{product.offer_percentage}%</span>}
        {outOfStock && <span className="stock-badge">Agotado</span>}
      </Link>
      <div className="product-info">
        <div className="product-price-row"><PriceDisplay usd={finalPrice} rate={rate} rateUpdatedAt={rateUpdatedAt} size="md" className={discounted ? 'text-destructive font-bold' : undefined} />{discounted && <span className="old-price"><PriceDisplay usd={product.price_usd} rate={rate} rateUpdatedAt={rateUpdatedAt} size="sm" /></span>}</div>
        {product.category && <Link href={`/categorias/${product.category.slug}`} className="product-category">{product.category.name}</Link>}
        <Link href={`/productos/${product.slug}`} className="product-name">{product.name}</Link>
        <p className="product-stock">{outOfStock ? 'Por ahora no disponible' : `${product.stock_quantity} ${isDemoMode() ? 'en la copia local' : 'disponibles'}`}</p>
        <button type="button" className="product-add" disabled={outOfStock || atLimit || added} onClick={onAdd} aria-label={`Agregar ${product.name} al carrito`}>{added ? <Check size={16} /> : <Plus size={16} />}<span>{added ? 'Agregado' : outOfStock ? 'Agotado' : atLimit ? 'Máximo en carrito' : 'Agregar'}</span></button>
        <span className="sr-only" role="status">{added ? `${product.name} agregado al carrito` : ''}</span>
        {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    </article>
  );
}

export function ProductGrid({ products, rate, rateUpdatedAt, shelf = false }: { products: ProductWithCategory[]; shelf?: boolean } & PriceRateProps) {
  return <div className={shelf ? 'product-shelf' : 'product-grid'}>{products.map((product) => <ProductCard key={product.id} product={product} rate={rate} rateUpdatedAt={rateUpdatedAt} />)}</div>;
}
