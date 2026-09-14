'use client';

import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';

export default function StorefrontError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="storefront-container py-8"><div className="catalog-empty" role="alert"><TriangleAlert size={35} strokeWidth={1.4} /><h1 className="text-2xl font-bold text-foreground">No pudimos cargar esta página</h1><p>El servicio puede estar temporalmente no disponible o pendiente de configuración. Intenta nuevamente.</p><button onClick={reset} className="store-button">Reintentar</button><Link href="/carabobo" className="text-xs underline">Volver al inicio</Link></div></div>;
}
