import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { ArrowRight, Tag, ShoppingBasket, MapPin, ClipboardList, Leaf } from 'lucide-react';
import { getCatalog, getCategories, getStorefrontSettings } from '@/lib/catalog';
import { storeConfig } from '@/lib/config';
import { CategoryNav } from '@/components/shared/CategoryNav';
import { ProductGrid } from '@/components/product/ProductCard';
import { CatalogUnavailable } from '@/components/product/CatalogView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tu supermercado en Carabobo', description: 'Encuentra los básicos de tu despensa y los productos para tu hogar. Consulta nuestra cobertura en Carabobo.' };

export default async function CaraboboStorefront() {
  const [categories, featured, offers, settings] = await Promise.all([getCategories(), getCatalog({ pageSize: 6, sort: 'newest' }), getCatalog({ isOffer: true, pageSize: 6 }), getStorefrontSettings()]);
  const categoryLink = (slug: string) => { const aliases: Record<string, string[]> = { despensa: ['despensa','alimentos'], 'frutas-y-vegetales': ['frutas-y-vegetales','frutas-y-verduras'] }; const category = categories.find(entry => (aliases[slug] || [slug]).includes(entry.slug)); return category ? `/categorias/${category.slug}` : '/productos'; };
  const pantry = categories.find((category) => ['despensa','alimentos'].includes(category.slug));
  const pantryProducts = pantry ? await getCatalog({ category: pantry.id, pageSize: 6 }) : null;
  return (
    <div className="storefront-home">
      <div className="store-notice"><ShoppingBasket size={14} /><span>Lo que necesitas para cada día, en un solo lugar.</span><Link href="/ayuda">Así de fácil <ArrowRight size={13} /></Link></div>
      <div className="storefront-container">
        <section className="store-hero" aria-labelledby="hero-title">
          <div className="hero-copy"><p className="hero-eyebrow"><span /> EL MERCADO DE TODOS LOS DÍAS</p><h1 id="hero-title">Tu compra de siempre,<br /><em>ahora más cerca.</em></h1><p>Los básicos de tu cocina y todo para tu hogar.<br className="hidden sm:block" /> Haz tu lista. Nosotros te ayudamos con el resto.</p><Link href="/productos" className="store-button">Empieza tu compra <ArrowRight size={17} /></Link></div>
          <div className="hero-art" aria-hidden="true"><span className="hero-orbit" /><span className="hero-leaf"><Leaf size={28} strokeWidth={1.5} /></span><div className="hero-groceries"><Image className="hero-milk" src="/storefront/milk.svg" alt="" width={160} height={210} priority /><Image className="hero-corn" src="/storefront/corn.svg" alt="" width={180} height={210} priority /><Image className="hero-banana" src="/storefront/banana.svg" alt="" width={185} height={190} priority /><Image className="hero-tomato" src="/storefront/tomato.svg" alt="" width={155} height={155} priority /><div className="hero-bag"><span className="bag-handle" /><ShoppingBasket size={35} strokeWidth={1.3} /><strong>{storeConfig.shortName}</strong><small>tu mercado de cada día</small></div></div><span className="hero-caption">UNA LISTA.<br /><strong>MUCHAS POSIBILIDADES.</strong></span></div>
        </section>

        <section className="merch-grid" aria-label="Explora nuestro supermercado">
          <Link href={categoryLink('despensa')} className="merch-card merch-pantry"><div><span>QUE NO FALTE NADA</span><h2>Lo esencial<br />en tu despensa</h2><p>Encuentra tus básicos <ArrowRight size={14} /></p></div><Image src="/storefront/coffee.svg" alt="" width={106} height={135} className="merch-pack merch-back" /><Image src="/storefront/rice.svg" alt="" width={112} height={145} className="merch-pack" /></Link>
          <Link href={categoryLink('frutas-y-vegetales')} className="merch-card merch-fresh"><div><span>DALE COLOR A TU MESA</span><h2>Ideas frescas<br />para cocinar</h2><p>Frutas y vegetales <ArrowRight size={14} /></p></div><Image src="/storefront/avocado.svg" alt="" width={134} height={149} className="merch-pack merch-back" /><Image src="/storefront/tomato.svg" alt="" width={132} height={144} className="merch-pack" /></Link>
          <Link href={categoryLink('limpieza-y-hogar')} className="merch-card merch-home"><div><span>BIENESTAR EN CADA RINCÓN</span><h2>Tu casa,<br />como te gusta</h2><p>Cuida tu hogar <ArrowRight size={14} /></p></div><Image src="/storefront/detergent.svg" alt="" width={111} height={148} className="merch-pack merch-back" /><Image src="/storefront/cleaner.svg" alt="" width={98} height={137} className="merch-pack" /></Link>
          <Link href="/ofertas" className="merch-card merch-offers"><div><span>COMPRA CON BUENA IDEA</span><h2>Una selección<br />para ahorrar</h2><p>Explora las ofertas <ArrowRight size={14} /></p></div><Tag className="merch-tag" size={84} strokeWidth={1.2} /></Link>
        </section>

        {categories.length > 0 && <section className="home-categories" aria-label="Compra por categoría"><CategoryNav categories={categories} tiles /></section>}

        {featured.error ? <CatalogUnavailable message={featured.error} /> : <>
          {offers.data.length > 0 && <section className="store-product-section"><div className="section-heading"><div><p className="store-eyebrow">MÁS PARA TU COMPRA</p><h2>Precios que te van a gustar <Tag size={23} strokeWidth={1.6} /></h2></div><Link href="/ofertas">Ver ofertas <ArrowRight size={17} /></Link></div><ProductGrid products={offers.data} shelf rate={settings.exchange_rate} rateUpdatedAt={settings.rate_updated_at} /></section>}
          {pantryProducts && pantryProducts.data.length > 0 && <section className="store-product-section"><div className="section-heading"><div><p className="store-eyebrow">LOS IMPRESCINDIBLES</p><h2>Esenciales en tu despensa</h2></div><Link href={categoryLink('despensa')}>Ver más <ArrowRight size={17} /></Link></div><ProductGrid products={pantryProducts.data} shelf rate={settings.exchange_rate} rateUpdatedAt={settings.rate_updated_at} /></section>}
          <div className="market-ribbon"><div className="ribbon-symbol"><ShoppingBasket size={38} strokeWidth={1.3} /></div><div><p>Menos vueltas. Más tiempo para ti.</p><span>Arma tu carrito y consulta las opciones de entrega para tu zona.</span></div><Link href="/productos">Haz tu lista <ArrowRight size={17} /></Link></div>
          <section className="store-product-section"><div className="section-heading"><div><p className="store-eyebrow">DESCUBRE EL CATÁLOGO</p><h2>Algo para cada día</h2></div><Link href="/productos">Ver todo <ArrowRight size={17} /></Link></div>{featured.data.length > 0 ? <ProductGrid products={featured.data} shelf rate={settings.exchange_rate} rateUpdatedAt={settings.rate_updated_at} /> : <div className="catalog-empty"><ShoppingBasket size={35} /><h2>Estamos preparando nuestro catálogo</h2><p>Los productos publicados aparecerán aquí.</p></div>}</section>
        </>}

        <section className="store-service-strip" aria-label="Cómo funciona"><div><ShoppingBasket size={26} strokeWidth={1.5} /><span><strong>Tu compra, a tu ritmo</strong><small>Explora y arma tu carrito.</small></span></div><div><MapPin size={26} strokeWidth={1.5} /><span><strong>Selecciona tu zona</strong><small>Consulta cobertura y entrega.</small></span></div><div><ClipboardList size={26} strokeWidth={1.5} /><span><strong>Todo en tu cuenta</strong><small>Revisa el estado de tus pedidos.</small></span></div><Link href="/ayuda">¿Primera compra? <ArrowRight size={17} /></Link></section>
      </div>
    </div>
  );
}
