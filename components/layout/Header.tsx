'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { ShoppingBasket, UserRound, ChevronDown, LayoutGrid, Tag, ArrowRight } from 'lucide-react';
import { SearchBar } from '@/components/shared/SearchBar';
import { ZoneSelector } from '@/components/layout/ZoneSelector';
import { MobileNav } from '@/components/layout/MobileNav';
import { useCart } from '@/lib/hooks/useCart';
import { useUserStore } from '@/store/userStore';
import { storeConfig } from '@/lib/config';
import type { Category } from '@/types';

export function Header({ categories = [] }: { categories?: Category[] }) {
  const cart = useCart();
  const { currency, setCurrency, hydrated } = useUserStore();
  const parents = categories.filter((c) => !c.parent_id);
  const pathname = usePathname();
  const categoryMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (categoryMenu.current) categoryMenu.current.open = false; }, [pathname]);

  return (
    <>
      <a href="#main-content" className="skip-link">Saltar al contenido</a>
      <header className="store-header">
        <div className="store-header-main storefront-container">
          <Link href="/carabobo" className="store-brand" aria-label={`${storeConfig.name}, inicio`}>
            <span className="brand-symbol" aria-hidden="true"><ShoppingBasket size={30} strokeWidth={1.8} /><span /></span>
            <span><strong>{storeConfig.name}</strong><small>Tu supermercado, más cerca.</small></span>
          </Link>
          <div className="store-header-search"><Suspense fallback={<div className="store-search h-11" />}><SearchBar /></Suspense></div>
          <div className="store-header-tools">
            <div className="header-zone"><ZoneSelector variant="header" /></div>
            <label className="header-currency"><span>Moneda</span><select aria-label="Moneda de precios" value={hydrated ? currency : 'USD'} onChange={(e) => setCurrency(e.target.value as 'USD' | 'VES')}><option value="USD">USD $</option><option value="VES">VES Bs.</option></select></label>
            <Link href="/perfil" className="header-account"><UserRound size={23} /><span><small>Bienvenido</small><strong>Mi cuenta</strong></span></Link>
            <button onClick={cart.openDrawer} className="header-cart" aria-label={`Abrir carrito, ${cart.hydrated ? cart.count : 0} productos`}><ShoppingBasket size={27} /><span className="cart-count">{cart.hydrated ? cart.count : 0}</span></button>
          </div>
        </div>
        <div className="store-navigation">
          <nav className="storefront-container store-navigation-inner" aria-label="Navegación principal">
            <details ref={categoryMenu} className="category-menu" onKeyDown={event => { if (event.key === 'Escape' && categoryMenu.current) { categoryMenu.current.open = false; categoryMenu.current.querySelector('summary')?.focus(); } }}><summary><LayoutGrid size={17} /> Compra por categorías <ChevronDown size={14} /></summary><div className="category-dropdown"><Link href="/productos">Todo el supermercado <ArrowRight size={15} /></Link>{parents.map((category) => <div key={category.id}><Link href={`/categorias/${category.slug}`}>{category.name}<ArrowRight size={14} /></Link>{categories.filter((c) => c.parent_id === category.id).map((child) => <Link className="category-child" key={child.id} href={`/categorias/${child.slug}`}>{child.name}</Link>)}</div>)}</div></details>
            <Link href="/ofertas" className="nav-offers"><Tag size={15} /> Ofertas</Link>
            {parents.slice(0, 4).map((category) => <Link className="nav-category" key={category.id} href={`/categorias/${category.slug}`}>{category.name}</Link>)}
            <Link href="/productos" className="nav-all">Todo el catálogo <ArrowRight size={14} /></Link>
            <Link href="/ayuda" className="nav-help">¿Cómo comprar?</Link>
          </nav>
        </div>
      </header>
      <MobileNav categories={categories} />
    </>
  );
}
