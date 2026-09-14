import type { ReactNode } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { getCategories } from '@/lib/catalog';

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const categories = await getCategories();
  return <div className="storefront-shell flex min-h-screen flex-col"><Header categories={categories} /><main id="main-content" className="flex-1" tabIndex={-1}>{children}</main><Footer /><CartDrawer /></div>;
}
