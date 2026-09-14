import Link from 'next/link';
import { ShoppingBasket } from 'lucide-react';

export default function NotFound() {
  return <div className="storefront-container py-8"><div className="catalog-empty"><ShoppingBasket size={40} strokeWidth={1.3} /><p className="store-eyebrow">404 · NO ENCONTRADO</p><h1 className="text-2xl font-bold text-foreground">No encontramos lo que buscas</h1><p>El producto o la categoría no está disponible. Puedes seguir explorando el supermercado.</p><Link href="/productos" className="store-button">Volver al catálogo</Link></div></div>;
}
