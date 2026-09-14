# Fase 7 — Infraestructura y Performance

> **Duración estimada:** Semanas 13-16 (12 dev-days)
> **Dependencias:** Todas las fases anteriores (todas las rutas creadas tendrán bisogno de cache, optimización y SEO)
> **Objetivo:** Llevar el sitio a Lighthouse >95 en las 4 categorías (Performance, Accessibility, Best Practices, SEO), optimizar DB para soportar 100+ usuarios concurrentes sin degradación, y dejar PWA completo con offline real.

---

## Definition of Done

- [ ] LCP < 2.5s en mobile (Vercel Edge + SSR + ISR)
- [ ] INP < 200ms (code splitting, defer hydration donde aplique)
- [ ] CLS < 0.1 (reservar width/height en todas las imágenes)
- [ ] Lighthouse Performance >=95 en mobile (simulado)
- [ ] ISR en todas las páginas públicas listeleras con `revalidate` apropiado
- [ ] Vercel Edge runtime en middleware y rutas ligeras
- [ ] Read replicas con Supabase Pooler (transaction mode)
- [ ] Conexión pooling + índices en todas las FK y columnas de búsqueda
- [ ] Redis cache con invalidez precisa para catálogo, stock y KPIs
- [ ] Sitemap.xml dinámico + robots.txt
- [ ] Schema.org JSON-LD en productos, breadcrumbs, organization
- [ ] PWA: offline real con IndexedDB, background sync, install banner, app shortcuts
- [ ] Bundle analysis en CI; budget de tamaño

---

## 7.1 Performance Web Vitals (3 dev-days)

### Contexto
Las Core Web Vitals son la métrica de Google para UX y ranking. En Venezuela, conterrćTION 3G y móviles antiguos, optimizar es crítico.

### Tareas

#### 7.1.1 LCP — Largest Contentful Paint
- Identificar el LCP: en homepage suele ser la imagen hero; en /productos es la primera card.
- Estrategias:
  - **`next/image` priority** en hero y primera imagen visible.
  - **Preconnect** a hosts externos (Supabase CDN, Stripe) en layout.
  - **`loading="eager"`** explícito en hero.
  - **AVIF/WebP** conversion automática.
  - **Lazy-load** todas las imágenes fuera del primer viewport.
- Para el hero estático (no imagen producto):
  ```tsx
  <Image src="/hero.jpg" fill sizes="100vw" priority fetchPriority="high" className="object-cover" />
  ```

#### 7.1.2 INP — Interaction to Next Paint
- Reemplazar sitios donde React hidrata para no mejorar interactividad:
  - `useState` con debounce para mejorar typing en inputs.
  - `useTransition` para updates no-blocking:
    ```tsx
    const [isPending, startTransition] = useTransition();
    const onChange = (e) => startTransition(() => setQuery(e.target.value));
    ```
- Code splitting por rutas (Next 14 lo hace por defecto, pero validar con `next/dynamic` en componentes grandes admin).
- `use deferred value` para filtrar listas grandes client-side.

#### 7.1.3 CLS — Cumulative Layout Shift
- Todas `<Image>` con `width/height` (no solo fill).
- Reservas en iframes y embeds.
- Banners promo con `min-h` reserved.
- Font-display swap siempre:
  ```css
  @font-face { font-display: swap; }
  ```
- Self-hosting de fonts (no Google Fonts) para eliminar FOUT:
  - `public/fonts/Inter.woff2` (subset latin + latin-ext).
  - `next/font/local` con preload:
    ```ts
    import localFont from 'next/font/local';
    const inter = localFont({ src: './Inter.woff2', display: 'swap', variable: '--font-inter' });
    ```

#### 7.1.4 Edge runtime en rutas ligeras
- Middleware ya corre en edge. Agregar `runtime = 'edge'` a rutas GET-only:
  ```ts
  // app/api/productos/route.ts GET
  export const runtime = 'edge';
  export async function GET() { ... }  // sin access a Node-only modules
  ```
- No usar edge en POST (Stripe, supabase-js requieren Node APIs). Polimórfico: GET en edge, POST en node.

#### 7.1.5 Peso del bundle
- `@next/bundle-analyzer`:
  ```bash
  npm i -D @next/bundle-analyzer
  ```
- Config:
  ```js
  import bundleAnalyzer from '@next/bundle-analyzer';
  const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });
  export default withBundleAnalyzer(nextConfig);
  ```
- Script: `"analyze": "ANALYZE=true next build"`.
- En CI, fallo si First Load JS >150 kB.
- Revisar dinámicamente librerías pesadas (Leaflet, React-PDF, Stripe) con `next/dynamic`:
  ```tsx
  const Map = dynamic(() => import('./Map'), { ssr: false, loading: () => <skeleton /> });
  ```

### Archivos a crear/modificar
```
next.config.mjs                                         [modificar — withBundleAnalyzer, fonts]
app/layout.tsx                                          [modificar — preconnect, font setup]
public/fonts/                                            [nuevo — woff2 files]
app/globals.css                                         [modificar — font-display]
app/(public)/page.tsx                                   [modificar — priority hero]
performance-budget.json                                 [nuevo]
lighthouserc.json                                       [modificar — budgets]
.env.example                                            [modificar — ANALYZE]
```

### Criterios de aceptación
- Lighthouse mobile score >=95 en Performance desde Vercel Preview.
- First Load JS shared <87 kB (mejora del baseline).
- LCP en /productos <2.5s con 100 productos en lista.
- Sin CLS visible al cargar imágenes.

---

## 7.2 Database Optimization (3 dev-days)

### Tareas

#### 7.2.1 Connection pooling
- Migrar URL de Supabase a use **Pooler (transaction mode)**:
  ```
  DATABASE_URL=
  # Obtener la conexión autorizada del panel Supabase y guardarla fuera del repositorio.
  ```
- `Prisma` o `supabase-js` compatible. Configuración de prisma ya no aplica (usamos supabase-js).

#### 7.2.2 Índices estratégicos
Crear `supabase/migrations/00050_optimization_indexes.sql`:
```sql
-- Índices en todas las FK
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_zone_id ON orders(zone_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_uuid ON cart_items(cart_uuid);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_approved ON reviews(product_id, is_approved, created_at DESC);

-- Partial index para is_active true (común)
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active) WHERE is_active = true;

-- Composite indexes para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_orders_user_status_date ON orders(user_id, status, created_at DESC);

-- GIN en metadata jsonb si hay búsquedas
-- (ver Fase 2 full-text search)
```

#### 7.2.3 Partitioning en `orders`
- Particionar por mes para reducir tamaño de tabla:
  ```sql
  CREATE TABLE orders_partitioned (
    LIKE orders INCLUDING ALL
  ) PARTITION BY RANGE (created_at);

  -- Crear particiones mensuales
  CREATE TABLE orders_2025_01 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
  CREATE TABLE orders_2025_02 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
  -- ...
  -- Migrar datos existentes:
  -- INSERT INTO orders_partitioned SELECT * FROM orders;
  -- DROP TABLE orders; ALTER TABLE orders_partitioned RENAME TO orders;
  ```
- Cron genera particiones futuras automáticamente:
  ```sql
  SELECT cron.schedule(
    'create_partitions_monthly',
    '0 0 25 * *',  -- día 25 del mes, crea partición del mes siguiente
    $$ SELECT create_next_month_partition(); $$
  );
  ```

#### 7.2.4 Vacuum tuning y autovacuum
- Verificar `autovacuum` settings. Para tablas write-heavy como `orders`:
  ```sql
  ALTER TABLE orders SET (autovacuum_vacuum_scale_factor = 0.05);  -- vacuum cuando 5% changes (default 20%)
  ALTER TABLE stock_movements SET (autovacuum_vacuum_scale_factor = 0.1);
  ```

#### 7.2.5 Slow query monitoring
- Habilitar `pg_stat_statements`:
  ```sql
  CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
  ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
  -- restart Postgres
  ```
- Query top queries:
  ```sql
  SELECT calls, total_exec_time, mean_exec_time, query
  FROM pg_stat_statements
  ORDER BY total_exec_time DESC LIMIT 20;
  ```
- Identificar y optimizar queries con alta `mean_exec_time` o que se llaman frecuentemente.

#### 7.2.6 Read replicas (Supabase)
- En plan Team: usar replicas para reads del storefront.
- URL pooler para admin (`write` en primary, `read` en replica).
- Logic en `lib/supabase/server.ts`:
  ```ts
  export function createServerSupabase(mode: 'write' | 'read' = 'read') {
    const url = mode === 'read' ? process.env.SUPABASE_POOLER_READ_URL : process.env.SUPABASE_POOLER_WRITE_URL;
    // ...
  }
  ```
- Para storefront (GET productos, lista categorías): usar read.
- Para admin POST: usar write.

### Archivos a crear/modificar
```
supabase/migrations/00050_optimization_indexes.sql        [nuevo]
supabase/migrations/00051_partitioning.sql                 [nuevo opcional]
supabase/migrations/00052_vacuum_tuning.sql                [nuevo]
lib/supabase/server.ts                                    [modificar — read/write clients]
.env.example                                             [modificar — SUPABASE_POOLER_*]
```

### Criterios de aceptación
- Lista de 100 productos con filtros en <500ms (p95).
- Dashboard con 100k órdenes carga en <2s.
- `pg_stat_statements` sin queries con mean >100ms.
- Vacuum corre con apropiada frecuencia.

---

## 7.3 Caching Strategy (3 dev-days)

### Contexto
Cache invalidation es el problema difícil. Estrategia multi-capa: Next cache (full + data), Redis (app-level), Supabase (via query plan cache).

### Tareas

#### 7.3.1 Next.js ISR和数据 cache
- En pages list:
  ```ts
  // app/(public)/productos/page.tsx
  export const revalidate = 60;  // 60 segundos
  // Server component fetch:
  const res = await fetch('/api/productos?...', { next: { tags: ['products'], revalidate: 60 } });
  ```
- En rutas dinámicas:
  ```ts
  // app/(public)/productos/[slug]/page.tsx
  export async function generateStaticParams() {
    // Pre-renderiza todos los productos activos (limit 1000)
    const products = await getProducts();
    return products.map(p => ({ slug: p.slug }));
  }
  export const revalidate = 300;  // 5 minutos
  ```

#### 7.3.2 Tag-based invalidation con Supabase webhooks
- En cualquier mutación (admin edit, stock update), llamar:
  ```ts
  revalidateTag('products');
  revalidateTag(`product:${slug}`);
  ```
- Webhook endpoint `POST /api/webhooks/revalidate`:
  - Recibe eventos de Supabase Database Webhooks (cuando products/inventory_examples cambian).
  - Llama `revalidateTag` con nombres apropiados.

#### 7.3.3 Redis cache wrapper
- `lib/cache/redis.ts`:
  ```ts
  import { Redis } from '@upstash/redis';
  const redis = new Redis({ url: process.env.UPSTASH_REDIS_URL!, token: process.env.UPSTASH_REDIS_TOKEN! });

  export async function cacheGet<T>(key: string, fetcher: () => Promise<T>, ttlSeconds = 300): Promise<T> {
    const cached = await redis.get<T>(key).catch(() => null);
    if (cached) return cached;
    const fresh = await fetcher();
    await redis.set(key, fresh, { ex: ttlSeconds }).catch(() => {});
    return fresh;
  }

  export async function cacheInvalidate(key: string) {
    await redis.del(key);
  }
  export async function cacheInvalidatePattern(pattern: string) {
    await redis.eval(`for _,k in ipairs(redis.call('keys', ARGV[1])) do redis.call('del', k) end`, [pattern]);
  }
  ```
- Use cases:
  - Catálogo de productos: `cacheGet('products:zona:<id>', getProductos, 300)` (5 min).
  - Stock por zona: `cacheGet('stock:<product_id>:<zone_id>', getStock, 30)` (30s).
  - Lista de categorías: `cacheGet('categories:tree', getCategories, 3600)` (1h).
  - KPIs admin: `cacheGet('kpis:today', getKpis, 60)` (1 min).
- Invalidar:
  - Al actualizar producto: `cacheInvalidate('products:zona:'+ zonaId) + cacheInvalidate('categories:tree')`.
  - Al actualizar inventory: `cacheInvalidate('stock:'+pid+':'+zid)`.

#### 7.3.4 Stale-While-Revalidate en API
- API routes con cache HTTP:
  ```ts
  export async function GET() {
    const data = await cacheGet('products:all', getProducts, 300);
    return new Response(JSON.stringify(data), {
      headers: {
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
        'Content-Type': 'application/json'
      }
    });
  }
  ```

### Archivos a crear/modificar
```
lib/cache/redis.ts                                      [nuevo]
lib/cache/strategies.ts                                  [nuevo]
app/api/webhooks/revalidate/route.ts                    [nuevo]
app/(public)/productos/page.tsx                         [modificar — ISR + cache tags]
app/(public)/page.tsx                                   [modificar — ISR]
app/(public)/categorias/[slug]/page.tsx                 [modificar — ISR]
lib/api/products.ts                                     [modificar — cacheGet]
lib/api/zones.ts                                        [modificar — cacheGet]
lib/api/categories.ts                                   [modificar — cacheGet]
```

### Criterios de aceptación
- Hit rate Redis >80% en catálogo.
- Invalidación visible en <10s.
- Página `/productos` cacheada en edge tiene TTFB <50ms.

---

## 7.4 SEO (2 dev-days)

### Tareas

#### 7.4.1 Metadata API
- En cada página, generar metadata:
  ```ts
  export async function generateMetadata({ params }): Promise<Metadata> {
    const product = await getProduct(params.slug);
    return {
      title: `${product.name} | TuZonaMarket`,
      description: product.description?.slice(0, 160),
      alternates: { canonical: `/productos/${product.slug}` },
      openGraph: {
        title: product.name,
        type: 'og:product',
        images: [{ url: product.images[0] }],
        url: `https://tuzonamarket.com/productos/${product.slug}`
      },
      twitter: { card: 'summary_large_image' }
    };
  }
  ```
- Layouts root añaden template:
  ```ts
  export const metadata: Metadata = {
    title: { template: '%s | TuZonaMarket', default: 'TuZonaMarket — Supermercado online en Venezuela' },
    description: '...',
    metadataBase: new URL('https://tuzonamarket.com'),
    openGraph: { siteName: 'TuZonaMarket', locale: 'es_VE', images: ['/og-default.jpg'] }
  };
  ```

#### 7.4.2 Sitemap dinámico
- `app/sitemap.ts`:
  ```ts
  import { MetadataRoute } from 'next';
  export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const products = await getProducts();
    return [
      { url: '/', lastModified: new Date(), priority: 1 },
      { url: '/productos', lastModified: new Date(), priority: 0.9 },
      { url: '/categorias', priority: 0.7 },
      ...products.map(p => ({ url: `/productos/${p.slug}`, lastModified: p.updated_at, priority: 0.6, changeFrequency: 'weekly' }))
    ];
  }
  ```

#### 7.4.3 Robots.txt
- `app/robots.ts`:
  ```ts
  import { MetadataRoute } from 'next';
  export default function robots(): MetadataRoute.Robots {
    return {
      rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/admin/', '/repartidor/', '/checkout/', '/carrito/'] }],
      sitemap: 'https://tuzonamarket.com/sitemap.xml',
      host: 'https://tuzonamarket.com'
    };
  }
  ```

#### 7.4.4 Structured data JSON-LD
- Componente `<JsonLd />` que renderiza `<script type="application/ld+json">` server-side.
- En `/productos/[slug]`:
  ```tsx
  <JsonLd data={{
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": product.name,
    "image": product.images,
    "description": product.description,
    "brand": { "@type": "Brand", "name": brand.name },
    "offers": {
      "@type": "AggregateOffer",
      "priceCurrency": "USD",
      "lowPrice": product.price_usd,
      "highPrice": product.sale_price_usd ?? product.price_usd,
      "offerCount": 1
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": avgRating,
      "reviewCount": reviewsCount
    }
  }} />
  ```
- En breadcrumbs:
  ```tsx
  <JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [...] }} />
  ```
- En homepage: Organization + WebSite con SearchAction.

#### 7.4.5 Hreflang (si multi-idioma futuro)
- Si añades soporte portugués (frontera Brasil):
  ```tsx
  alternates: {
    languages: {
      'es-VE': '/productos/leche',
      'pt-BR': '/pt-br/produtos/leite'
    }
  }
  ```

### Archivos a crear/modificar
```
app/sitemap.ts                                          [nuevo]
app/robots.ts                                           [nuevo]
components/JsonLd.tsx                                    [nuevo]
app/layout.tsx                                          [modificar — metadata template]
app/(public)/page.tsx                                   [modificar — metadata + Org JSON-LD]
app/(public)/productos/page.tsx                         [modificar — metadata + WebSite JSON-LD]
app/(public)/productos/[slug]/page.tsx                  [modificar — metadata + Product JSON-LD]
app/(public)/categorias/[slug]/page.tsx                 [modificar — metadata + Breadcrumb JSON-LD]
```

### Criterios de aceptación
- Google Search Console muestra todas las URLs indexables sin errores.
- Schema validator (https://validator.schema.org/) pasa.
- Sitemap.xml modo gzip para sitios grandes (built-in Next).
- Lighthouse SEO score =100.

---

## 7.5 PWA Pro (1 dev-day)

### Tareas

#### 7.5.1 Estrategia cache con Workbox
- Customize workbox config en `next.config.mjs`:
  ```js
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/products\/.*$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'product-images',
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }  // 30 días
        }
      },
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/products.*$/,
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'catalog-api', expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 } }
      },
      {
        urlPattern: /\/_next\/static\/.*/i,
        handler: 'CacheFirst'
      }
    ]
  }
  ```

#### 7.5.2 Background Sync con Workbox
- Plugin para encolar POST fallidos (crear orden cuando hay red):
  ```js
  new workbox.backgroundSync.BackgroundSyncPlugin('orderQueue', { maxRetentionTime: 24 * 60 });
  ```

#### 7.5.3 App Shortcuts
- En manifest:
  ```json
  {
    "shortcuts": [
      { "name": "Mi carrito", "short_name": "Carrito", "url": "/carrito", "icons": [...] },
      { "name": "Mis pedidos", "short_name": "Pedidos", "url": "/mis-pedidos" },
      { "name": "Buscar", "short_name": "Buscar", "url": "/productos" }
    ]
  }
  ```

#### 7.5.4 iOS PWA splash (legacy)
- En `app/layout.tsx head:
  ```html
  <link rel="apple-touch-icon" href="/icons/ios-icon-180.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="TuZonaMarket" />
  ```

#### 7.5.5 Update flow
- Custom prompt de actualización con Toast:
  - Workbox detecta nueva versión → toast "Nueva versión disponible" + botón "Actualizar".
  - En click: `workbox.messageSkipWaiting()` + `window.location.reload()`.

### Archivos a crear/modificar
```
next.config.mjs                                         [modificar — workboxOptions详细]
public/manifest.json                                    [modificar — shortcuts]
public/icons/                                           [add: android 192/512 + iOS 180 + maskable]
app/layout.tsx                                          [modificar — iOS splash meta]
components/pwa/UpdatePrompt.tsx                          [nuevo]
```

### Criterios de aceptación
- App instalable con icon en home screen Android/iOS.
- Offline: catálogo cacheado (última visita) visible.
- Splash screen iOS correcta sin barra blanca arriba.
- Botones shortcuts en Android abren rutas correctas.

---

## 7.6 Performance Budget en CI (1 dev-day)

### Tareas
- `lighthouserc.json`:
  ```json
  {
    "ci": {
      "assert": {
        "preset": "lighthouse:no-pwa",
        "assertions": {
          "categories:performance": ["warn", { "minScore": 0.95 }],
          "categories:accessibility": ["error", { "minScore": 0.95 }],
          "categories:best-practices": ["error", { "minScore": 0.95 }],
          "categories:seo": ["error", { "minScore": 0.95 }],
          "first-contentful-paint": ["warn", { "maxNumericValue": 1600 }],
          "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
          "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }]
        }
      },
      "collect": {
        "url": ["http://localhost:3000/", "http://localhost:3000/productos"],
        "settings": { "preset": "desktop", "throttling": { "rttMs": 150, "throughputKbps": 1638.4, "cpuSlowdownMultiplier": 4 } }
      }
    }
  }
  ```
- En CI: `npx @lhci/cli autorun`, upload report.

### Criterios de aceptación
- CI falla si LCP >2.5s o CLS >0.1 o score Performance <95.
- PR comments con diff de metrics vs base.

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Edge runtime rompe por uso Node-only libs | Media | Medio | Testear PUT/POST antes de marcar runtime='edge' |
| ISR staleness: stock negate post-compra | Media | Alto | Invalide tag `product:<id>` en checkout |
| PgBouncer mode incompatible con prepared statements | Media | Medio | Config `pgbouncer=true` en DATABASE_URL + use `supabase-js` compatible |
| Partición breaka queries SQL existentes | Baja | Alto | Testear todas las queries admin post-migración |
| Workbox runtime caching policía calienta caches caducos | Baja | Bajo | Settings TTL conservadores + invalidación tags |
| Lighthouse CI flaky | Alta | Bajo | Retry en CI; fail solo en settingsMobile |

---

## Dependencias con otras fases

- **Fase 8** (Operación): Runbook performance — qué hacer si LCP degrada, cuándo reindexar.

---

## Siguiente

[Fase 8 — Lanzamiento y Operación](./08-lanzamiento-operacion.md)
