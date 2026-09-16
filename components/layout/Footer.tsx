import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { storeConfig } from '@/lib/config';

export function Footer() {
  return <footer className="store-footer"><div className="storefront-container footer-grid"><div className="footer-brand"><span className="flex items-center gap-2.5"><Image src="/images/todo-market-cart-yellow.png" alt="" width={36} height={23} className="h-7 w-auto object-contain" /><strong>{storeConfig.name}</strong></span><p>Tu supermercado en un solo lugar.<br />Lo que necesitas cada día.</p></div><div><h2>Tu supermercado</h2><Link href="/productos">Todos los productos</Link><Link href="/ofertas">Ofertas</Link><Link href="/carrito">Mi carrito</Link></div><div><h2>Estamos para ayudarte</h2><Link href="/ayuda">Cómo comprar</Link><Link href="/mis-pedidos">Mis pedidos</Link><Link href="/perfil">Mi cuenta</Link></div><div><h2>Información de la tienda</h2><Link href="/politicas">Privacidad y condiciones</Link>{storeConfig.email ? <a href={`mailto:${storeConfig.email}`} className="footer-contact">Escríbenos <ArrowUpRight size={14} /></a> : <Link href="/ayuda#contacto">Información de contacto</Link>}{storeConfig.phone && <a href={`tel:${storeConfig.phone.replace(/[^+\d]/g, '')}`}>{storeConfig.phone}</a>}</div></div><div className="footer-bottom storefront-container"><span>© {new Date().getFullYear()} {storeConfig.name}</span><span>Hecho para tus compras de cada día.</span></div></footer>;
}
