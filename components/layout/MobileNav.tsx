'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { House, LayoutGrid, UserRound, Menu, ChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ZoneSelector } from '@/components/layout/ZoneSelector';
import { useUserStore } from '@/store/userStore';
import { storeConfig } from '@/lib/config';
import type { Category } from '@/types';

interface NavLink { label: string; href: string; badge?: number }
const DEFAULT_NAV: NavLink[] = [{ label: 'Todo el supermercado', href: '/productos' }, { label: 'Ofertas', href: '/ofertas' }, { label: 'Mi carrito', href: '/carrito' }, { label: 'Mis pedidos', href: '/mis-pedidos' }, { label: 'Mi cuenta', href: '/perfil' }, { label: 'Ayuda para comprar', href: '/ayuda' }];

export function MobileNav({ categories = [], triggerLabel = 'Más opciones', nav = DEFAULT_NAV, extra }: { categories?: Category[]; triggerLabel?: string; nav?: NavLink[]; extra?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { currency, setCurrency, hydrated } = useUserStore();
  return (
    <nav className="mobile-bottom-nav" aria-label="Navegación móvil">
      <Link href="/carabobo" aria-current={pathname === '/carabobo' ? 'page' : undefined}><House size={21} /><span>Inicio</span></Link>
      <Link href="/productos" aria-current={pathname.startsWith('/productos') || pathname.startsWith('/categorias') ? 'page' : undefined}><LayoutGrid size={21} /><span>Productos</span></Link>
      <ZoneSelector variant="mobile" />
      <Link href="/perfil" aria-current={pathname === '/perfil' ? 'page' : undefined}><UserRound size={21} /><span>Mi cuenta</span></Link>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><button aria-label={triggerLabel}><Menu size={21} /><span>Más</span></button></DialogTrigger>
        <DialogContent className="mobile-menu-dialog max-h-[90dvh] overflow-y-auto rounded-t-2xl">
          <DialogTitle>{storeConfig.name}</DialogTitle><DialogDescription>Tu supermercado en un solo lugar.</DialogDescription>
          <div className="rounded-xl bg-[#edf5ee] p-3"><ZoneSelector /></div>
          <label className="flex min-w-0 flex-wrap items-center justify-between gap-3 text-sm font-medium">Ver precios en<select className="min-w-0 max-w-full rounded-lg border bg-white px-3 py-2" aria-label="Moneda" value={hydrated ? currency : 'USD'} onChange={(e) => setCurrency(e.target.value as 'USD' | 'VES')}><option value="USD">Dólares · USD</option><option value="VES">Bolívares · VES</option></select></label>
          <div className="grid gap-1">{nav.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex items-center justify-between rounded-lg px-2 py-3 text-sm hover:bg-secondary">{item.label}<ChevronRight size={16} /></Link>)}</div>
          {categories.length > 0 && <div className="border-t pt-4"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Categorías</p>{categories.filter((c) => !c.parent_id).map((category) => <div key={category.id}><Link className="block py-2 text-sm font-medium" href={`/categorias/${category.slug}`} onClick={() => setOpen(false)}>{category.name}</Link>{categories.filter((c) => c.parent_id === category.id).map((child) => <Link key={child.id} className="block py-2 pl-4 text-sm text-muted-foreground" href={`/categorias/${child.slug}`} onClick={() => setOpen(false)}>{child.name}</Link>)}</div>)}</div>}
          {extra}
        </DialogContent>
      </Dialog>
    </nav>
  );
}
