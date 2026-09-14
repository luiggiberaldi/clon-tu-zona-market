# TuZonaMarket — Visión General del Roadmap a Producción v1.0

> Documento maestro. Detalla la arquitectura, el stack, los servicios externos y el alcance de cada fase para llevar el MVP actual a una plataforma production-grade para el mercado venezolano.

---

## 1. Estado de Partida (MVP actual)

| Métrica | Valor |
|---|---|
| Next.js | 14.2.20 (App Router) |
| TypeScript | Estricto, 0 errores |
| ESLint | Limpio (0 warnings) |
| Tests | 36/36 unitarios pasando |
| Build | 35 páginas + PWA (sw.js) compiladas |
| Shared JS | 87.2 kB (First Load) |

### Lo que YA funciona
- Esquema SQL completo con RLS, triggers y `generate_order_number()`.
- Clientes Supabase: server (`getAll`/`setAll`), browser y admin (service role).
- Middleware de auth con guard por rol (customer/driver/admin) y redirect a `/login`.
- Stores Zustand: cart (persist + stock cap), zone, user (persist).
- API Routes: productos, categorías, zonas, ordenes (con Stripe dinámico), webhook Stripe, search, auth callback.
- Componentes: Header, Footer, MobileNav, ZoneSelector, ProductCard/Grid, ProductDetail, CartDrawer, CheckoutForm, admin (StatsCards, ProductTable, OrderTable, CategoryManager, ZoneManager).
- Páginas públicas, auth, customer y dashboard (admin + repartidor) con layouts.
- PWA con next-pwa (sw.js generado).

### Lo que FALTA para producción real
- Credenciales Supabase/Stripe reales (placeholders en `.env`).
- Migraciones versionadas (el `schema.sql` único no escala).
- Seguridad hardening: rate limiting real, Turnstile/CAPTCHA, MFA, audit logs.
- Inventario multi-zona (el stock actual es global por producto).
- Pagos venezolanos reales (PagoMóvil con comprobante + OCR, Zelle, efectivo contra entrega).
- Logística con tracking en tiempo real y asignación inteligente de repartidores.
- Notificaciones transaccionales (email + WhatsApp + push).
- Observabilidad (Sentry, logs estructurados, alertas).
- E2E tests (Playwright) y CI/CD con preview deploys.

---

## 2. Arquitectura Production-Grade Propuesta

```
                            +-------------------------------------------------+
                            |         CDN (Vercel Edge Network)               |
                            |    Cacheo de páginas estáticas + assets         |
                            +-----------------------+-------------------------+
                                                    |
                +-----------------------------------+-----------------------------------+
                |                                   |                                   |
    +-----------v-----------+          +-------------v-------------+         +----------v-----------+
    |   Next.js App         |          |   API Routes (Node)        |         |  Webhooks            |
    |   SSR + ISR + Edge    |          |   Server Actions           |         |  Stripe / Bancos /   |
    |   PWA offline         |          |   Rate Limiting (Redis)     |         |  Supabase DB Hooks   |
    +-------+---------------+          +-------------+---------------+         +----------+-----------+
            |                                        |                                   |
    +-------v----------------+          +-------------v-----------------+         +----------v-----------+
    | Supabase (Postgres)    |          |   Supabase Storage           |         |  Redis (Upstash)      |
    | RLS + Realtime         |          |   Imagenes + PDFs +          |         |  Cache + Rate Limit  |
    | Row-Level Security     |          |   Comprobantes de pago +     |         |  Sessions + Colas    |
    | + PostGIS              |          |   CDN transforms (resize)    |         |                       |
    +------------------------+          +-------------------------------+         +-----------------------+
            |                                                                                   |
    +-------v----------------+                                              +--------------------v----------+
    |      Meilisearch       |                                              |   Resend + WhatsApp API + FCM  |
    |   (Full-text search)   |                                              |   (Transactional + Marketing)  |
    +------------------------+                                              +--------------------------------+
```

### Principios de diseño
1. **Server-first**: lógica sensible en API routes/Server Actions, no en el cliente.
2. **Edge donde aporte**: middleware y rutas ligeras en `runtime = 'edge'`.
3. **Realtime nativo de Supabase**: evitar WebSocket custom salvo necesidad imperiosa.
4. **Cache agresivo con invalidez precisa**: Redis + `revalidateTag` de Next 14.
5. **Multi-zona por diseño**: zonas/bodegas segregan inventario, precios y entrega desde la base.
6. **Mobile-first absoluto**: el 85%+ del tráfico venezolano es móvil.
7. **Observabilidad desde día 1**: si no se mide, no se puede arreglar.

---

## 3. Stack Tecnológico Detallado

### Núcleo (ya en MVP)
| Capa | Tecnología | Versión | Rol |
|---|---|---|---|
| Framework | Next.js | 14.2.20+ | App Router, RSC, ISR, PWA |
| Lenguaje | TypeScript | 5.x estricto | Sin `any` explícito |
| UI | Tailwind CSS + shadcn/ui | 3.x + latest | Sistema de diseño |
| Estado | Zustand + TanStack Query | 4.x + 5.x | Local + server cache |
| Forms | react-hook-form + Zod | 7.x + 3.x | Validación tipada |
| DB + Auth | Supabase (`@supabase/ssr`) | latest | Postgres + Auth + Realtime + Storage |
| Pagos int. | Stripe | 14.x | Tarjetas, 3DS, fraud detection |
| PWA | next-pwa (o `@ducanh2912/next-pwa`) | 10.x | Service worker, offline |
| Tests unit | Vitest + Testing Library | 1.x | Tests rápidos |
| Container | Docker + docker-compose | latest | Reproducibilidad |

### Servicios externos a integrar (por fase)
| Propósito | Servicio | Por qué | Fase |
|---|---|---|---|
| Hosting | **Vercel Pro** | Edge network, ISR, preview deploys, Next.js nativo | 1 |
| DB extendida | **Supabase Team** ($25/mo) | PITR backups,Pooler,Realtime 2024,branches | 1 |
| Cache + Rate Limit | **Upstash Redis** ($10/mo) | Serverless edge, integración perfecta con Vercel | 1 |
| Errores + Perf | **Sentry** ($26/mo) | Next.js, source maps, session replay, performance | 1 |
| Logs | **Axiom** o **Logtail** | Logs estructurados, query SQL, alertas | 1 |
| Uptime monitoring | **UptimeRobot** (free/$7) | Ping cada 30s, status page | 1 |
| Búsqueda | **Meilisearch Cloud** ($30/mo) | Open source, typo-tolerant, español, facets | 2 |
| Emails transac. | **Resend** ($20/mo) | React Email, DKIM, bounce handling | 5 |
| WhatsApp | **Meta Cloud API** o **360dialog** | Mensajes transaccionales + plantillas | 5 |
| Push notifications | **Firebase Cloud Messaging** | Gratuito, maduro, multiplataforma | 5 |
| Analytics web | **Vercel Analytics** + **PostHog** | Web Vitals + funnels + heatmaps + A/B | 8 |
| Geocoding | **Nominatim (OSM)** gratis o **Google Places** | Validación de direcciones, autocomplete | 4 |
| Mapas | **Leaflet + OpenStreetMap** | Gratis, sin API key | 4 |
| Routing | **OR-Tools** (Google, npm) | Optimización de rutas TSP/VRP | 4 |
| OCR (comprobantes) | **Tesseract.js** (gratis) o **Google Vision** | Extraer datos de comprobante PagoMóvil | 3 |
| CAPTCHA | **Cloudflare Turnstile** (gratis) o reCAPTCHA v3 | Anti-bot, gratis y privados | 1 |
| Image opt. | **Supabase Storage transforms** (incluido) | Resize, webp, AVIF al vuelo | 7 |

---

## 4. Resumen de Fases

| # | Fase | Semanas | Dev-days | Complejidad | Documento |
|---|---|---|---|---|---|
| 1 | Fundaciones de Producción | 1-3 | 15 | Media | [01-fundaciones.md](./01-fundaciones.md) |
| 2 | E-Commerce Core | 4-7 | 20 | Media-Alta | [02-ecommerce-core.md](./02-ecommerce-core.md) |
| 3 | Pagos Venezolanos Reales | 6-8 | 12 | Alta | [03-pagos-venezuela.md](./03-pagos-venezuela.md) |
| 4 | Logística y Delivery Inteligente | 7-10 | 18 | Alta | [04-logistica-delivery.md](./04-logistica-delivery.md) |
| 5 | Experiencia Premium del Cliente | 9-12 | 15 | Media | [05-ux-premium.md](./05-ux-premium.md) |
| 6 | Panel Admin Profesional | 11-14 | 20 | Media | [06-admin-pro.md](./06-admin-pro.md) |
| 7 | Infraestructura y Performance | 13-16 | 12 | Media | [07-infra-performance.md](./07-infra-performance.md) |
| 8 | Lanzamiento y Operación | 15-18 | 8 | Baja | [08-lanzamiento-operacion.md](./08-lanzamiento-operacion.md) |

### Overlaps intencionales
Las fases 2-3, 4-5 y 6-7 se solapan en semanas para reflejar que多个 streams pueden avanzar en paralelo una vez sentadas las fundaciones de la Fase 1.

### Documentos complementarios
- [09-estimaciones-costos.md](./09-estimaciones-costos.md) — Tabla de dev-days, costos cloud y de terceros.
- [10-priorizacion-top10.md](./10-priorizacion-top10.md) — Top 10 imprescindible para versión mínima production-ready.
- [11-backlog-tecnico.md](./11-backlog-tecnico.md) — Checklist semana a semana con dependencias.

---

## 5. Cómo leer este roadmap

Cada documento de fase sigue esta estructura:

1. **Objetivos** — qué se logra al cerrar la fase (Definition of Done).
2. **Tareas** — desglose técnico fino (carpetas,archivos, endpoints, migraciones).
3. **Archivos a crear/modificar** — rutas concretas dentro del repo.
4. **Dependencias** — qué requiere de fases anteriores.
5. **Criterios de aceptación** — cómo se verifica que está completo.
6. **Riesgos y mitigaciones** — escenarios que pueden romper la fase.

Los archivos viven en `tuzonamarket/docs/roadmap/` y son la fuente de verdad durante el desarrollo. Actualizarlos conforme avanza cada fase (marcar ✅ al cerrar una tarea).

---

## 6. Decisiones de arquitectura tomadas

| Decisión | Justificación |
|---|---|
| Sin GraphQL | REST + Server Actions es suficiente para el scope; GraphQL añadiría una capa sin ganancia clara |
| PostGIS en Supabase | Para geocobertura poligonal sin necesidad de servicios externos de pago |
| Meilisearch Cloud vs Postgres FTS | Recomendado Meilisearch; Postgres FTS como fallback zero-cost si el catálogo es <10k producto |
| Resend + React Email vs SendGrid | Resend moderno, DX superior, React Email componentizable |
| Upstash Redis vs Vercel KV | Upstash más barato y mejor integración con edge runtime |
| Cloudflare Turnstile vs reCAPTCHA v3 | Turnstile gratis y privados (sin cookies de Google) |
| Stripe Connect sólo si marketplace | Para versión single-vendor, Stripe normal es suficiente |
| Realtime Supabase vs WebSockets custom | Supabase Realtime cubre el caso de tracking y estado de órden sin infra propia |
| Vitest + Playwright vs Jest + Cypress | Vitest ya en proyecto (rápido); Playwright más moderno que Cypress y mejor con Next 14 |
| next-pwa (actual) vs `@ducanh2912/next-pwa` | Migrar a `@ducanh2912/next-pwa` para mejor compat Next 14 (si next-pwa da problemas) |

---

## 7. Próximo paso

Iniciar la **Fase 1 — Fundaciones de Producción**. Ver detalle en [01-fundaciones.md](./01-fundaciones.md).
