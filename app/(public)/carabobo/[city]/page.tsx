import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getZones } from '@/lib/catalog';
import { ZoneSelector } from '@/components/layout/ZoneSelector';
import type { Metadata } from 'next';

type Props = { params: Promise<{ city: string }> };
const slugify = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '-');
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city } = await params;
  return { title: `Zonas de entrega: ${city.replace(/-/g, ' ')}` };
}
export default async function CityPage({ params }: Props) {
  const { city: slug } = await params;
  const zones = await getZones();
  const state = zones.states.find((item) => item.name.toLowerCase() === 'carabobo');
  const city = zones.cities.find((item) => item.state_id === state?.id && slugify(item.name) === slug);
  if (!city) notFound();
  const areas = zones.areas.filter((item) => item.city_id === city.id);
  return (
    <div className="storefront-container py-10">
      <Link href="/carabobo" className="text-sm text-primary hover:underline">
        ← Volver al supermercado
      </Link>
      <div className="mt-4 flex flex-wrap items-baseline gap-3">
        <h1 className="text-3xl font-bold">Entrega en {city.name}</h1>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {areas.length} sectores con cobertura
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <div className="rounded-lg border bg-card px-3.5 py-2">
          <span className="text-xs text-muted-foreground">Costo base de entrega</span>
          <p className="font-semibold text-foreground">${city.delivery_fee_usd.toFixed(2)} USD</p>
        </div>
        <div className="rounded-lg border bg-card px-3.5 py-2">
          <span className="text-xs text-muted-foreground">Pedido mínimo</span>
          <p className="font-semibold text-foreground">{city.min_order_usd > 0 ? `$${city.min_order_usd.toFixed(2)} USD` : 'Sin mínimo'}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Promoción especial</span>
          <p className="font-semibold text-emerald-800 dark:text-emerald-300">¡Envío GRATIS en compras desde $40 USD!</p>
        </div>
      </div>
      <h2 className="mb-4 mt-8 text-xl font-semibold">Sectores y urbanizaciones atendidas</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((area) => (
          <div key={area.id} className="rounded-xl border bg-card p-4 shadow-sm hover:border-primary/50 transition-colors">
            <h3 className="font-medium text-foreground">{area.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">Cobertura directa activa</p>
          </div>
        ))}
      </div>
      {!areas.length && (
        <p className="rounded-xl bg-secondary p-4 text-sm">No hay sectores disponibles en esta ciudad por ahora.</p>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <ZoneSelector />
        <Link className="store-button" href="/productos">
          Explorar productos
        </Link>
      </div>
    </div>
  );
}
