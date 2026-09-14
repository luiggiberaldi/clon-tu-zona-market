import type { ReactNode } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { getCategories } from '@/lib/catalog';
export const dynamic = 'force-dynamic';

export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const categories = await getCategories();
  return (
    <div className="flex min-h-screen flex-col">
      <Header categories={categories} />
      <main className="flex-1 pb-20 lg:pb-0" id="main-content">{children}</main>
      <Footer />
      <CartDrawer />
    </div>
  );
}
