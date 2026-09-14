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
  return <div className="storefront-container py-10"><Link href="/carabobo" className="text-sm text-primary">Volver al supermercado</Link><h1 className="mt-5 text-3xl font-bold">Entrega en {city.name}</h1><p className="mt-3 text-sm text-muted-foreground">Costo de entrega: ${city.delivery_fee_usd.toFixed(2)} USD · Pedido mínimo: ${city.min_order_usd.toFixed(2)} USD.</p><h2 className="mb-4 mt-8 text-xl font-semibold">Sectores con cobertura publicada</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{areas.map((area) => <div key={area.id} className="rounded-xl border p-5"><h3 className="font-medium">{area.name}</h3></div>)}</div>{!areas.length && <p className="rounded-xl bg-secondary p-4 text-sm">No hay sectores disponibles en esta ciudad por ahora.</p>}<div className="mt-6 flex flex-wrap gap-5"><ZoneSelector /><Link className="store-button" href="/productos">Explorar productos</Link></div></div>;
}
