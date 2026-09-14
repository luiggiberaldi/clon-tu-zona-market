# Fase 5 — Experiencia Premium del Cliente

> **Duración estimada:** Semanas 9-12 (15 dev-days)
> **Dependencias:** Fase 2 (reviews, wishlist, loyalty), Fase 4 (tracking en tiempo real)
> **Objetivo:** Convertir una app funcional en una experiencia memorable: personalización, notificaciones multi-canal proactivas, cuenta de cliente completa, optimización móvil absoluta y accessibility WCAG 2.1 AA.

---

## Definition of Done

- [ ] Homepage dinámica personalizada por zona (hero, destacados, recién repuesto)
- [ ] Recomendaciones "Comprado anteriormente" + "Otros compraron también"
- [ ] Notificaciones email transaccionales (Resend + React Email)
- [ ] Notificaciones WhatsApp (Meta Cloud API o 360dialog)
- [ ] Push notifications (Firebase Cloud Messaging)
- [ ] Centro de notificaciones in-app (campana con badge)
- [ ] Múltiples direcciones con etiquetas (Casa, Trabajo, Mamá)
- [ ] Tarjetas guardadas (Stripe customer) en cuenta
- [ ] Re-order en 1 click
- [ ] Notas de entrega configurables
- [ ] Recuperación de carrito abandonado (24h, 3 días)
- [ ] Request de review 7 días post-entrega
- [ ] PWA complete: Offline real, Add to Home Screen, push, app shortcuts
- [ ] Skeleton screens en todas las cargas
- [ ] Accessibility WCAG 2.1 AA auditado con axe-core

---

## 5.1 Personalización y Recomendaciones (3 dev-days)

### Tareas

#### 5.1.1 Homepage dinámica por zona
- Componente `<HeroBanner />` se adapta según zona del usuario:
  - "Entregas en Valencia Norte" + imagen de Valencia.
  - "Recíbelo hoy si pides antes de las 2pm".
- Productos destacados por zona (no mostrar agotados en esa zona).
- "Recién repuesto" en la zona del usuario.
- Sección "Ofertas del día" con countdown timer.

#### 5.1.2 Motor de recomendaciones
Tabla pre-calculada:
```sql
CREATE TABLE user_product_affinity (
  user_id uuid NOT NULL REFERENCES users(id),
  product_id uuid NOT NULL REFERENCES products(id),
  score numeric(10,4) NOT NULL DEFAULT 0,    -- peso de afinidad
  last_updated timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
CREATE INDEX idx_affinity_user ON user_product_affinity(user_id, score DESC);
```
- Job diario actualiza afinidad basado en:
  - Comprado anteriormente (+1)
  - Añadido al carrito pero no comprado (+0.3)
  - Visto recientemente (+0.1)
  - En wishlist (+0.5)
  - Review dejada (+1)
- API `GET /api/recomendaciones` retorna top 8 por score.
- Componente `<RecommendationsRow />` renderiza:
  - "Comprado anteriormente" (orders previas).
  - "Otros compraron también" (co-ocurrencia de productos en órdenes).
  - "Basado en tu wishlist".
  - "Más vendidos en tu zona".

#### 5.1.3 Visto recientemente
- Tabla `recently_viewed`:
  ```sql
  CREATE TABLE recently_viewed (
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    product_id uuid REFERENCES products(id) ON DELETE CASCADE,
    viewed_at timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, product_id)
  );
  ```
- Trigger en APIs de detalle de producto → upsert viewed_at = now().
- Sección "Visto recientemente" en homepage y después de un product card.

#### 5.1.4 Comprado anteriormente + re-order
- Página `app/(customer)/perfil/pedidos-anteriores/page.tsx` con lista de productos únicos.
- Botón "Comprar de nuevo" mete items al carrito actual (respetando stock y zona).

### Archivos a crear/modificar
```
supabase/migrations/00030_personalization.sql            [nuevo]
supabase/migrations/00031_affinity_job.sql              [nuevo]
lib/api/recommendations.ts                              [nuevo]
lib/api/recently-viewed.ts                              [nuevo]
app/(public)/page.tsx                                  [modificar — hero zona]
components/home/HeroBanner.tsx                           [nuevo]
components/home/RecentlyViewedRow.tsx                    [nuevo]
components/product/RecommendationsRow.tsx                [nuevo]
app/(customer)/perfil/pedidos-anteriores/page.tsx       [nuevo]
```

### Criterios de aceptación
- Usuario en Valencia Norte ve hero específico + productos con stock en esa zona.
- Sección "Recomendado para ti" muestra 8 productos basados en su historial.
- "Comprar de nuevo" mete items al carrito con validación de stock/zona.

---

## 5.2 Notificaciones Multi-Canal (5 dev-days)

### Contexto
Las notificaciones reducen tickets de soporte, aumentan conversión y fidelizan. Tres canales complementarios: email, push y WhatsApp.

### Tareas

#### 5.2.1 Email transaccional con Resend
- Instalar Resend SDK + React Email:
  ```bash
  npm i resend @react-email/components
  ```
- Templates en `components/emails/`:
  - `OrderConfirmationEmail.tsx`
  - `OrderStatusUpdateEmail.tsx`
  - `CartAbandonedEmail.tsx`
  - `ReviewRequestEmail.tsx`
  - `WelcomeEmail.tsx`
  - `PasswordResetEmail.tsx`
- Wrapper `lib/notifications/email.ts`:
  ```ts
  import { Resend } from 'resend';
  import { render } from '@react-email/render';
  import OrderConfirmationEmail from '@/components/emails/OrderConfirmationEmail';

  const resend = new Resend(process.env.RESEND_API_KEY!);

  export async function sendOrderConfirmation(to: string, order: Order) {
    const html = await render(OrderConfirmationEmail({ order }));
    await resend.emails.send({
      from: 'TuZonaMarket <no-reply@tuzonamarket.com>',
      to,
      subject: `Confirmación de orden ${order.order_number}`,
      html
    });
  }
  ```
- DKIM/SPF setup en dominio.

#### 5.2.2 WhatsApp Business API
- Registrar en Meta Business o 360dialog.
- Variables: `WHATSAPP_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAMESPACE`.
- Templates (requieren aprobación Meta):
  - `order_confirmation`: "Hola {{1}}, tu orden {{2}} fue confirmada. Total: {{3}}."
  - `order_shipped`: "Tu orden {{1}} va en camino. ETA: {{2}}."
  - `order_delivered`: "Tu orden {{1}} fue entregada. ¡Gracias!"
  - `payment_received`: "Recibimos tu pago de {{1}} para la orden {{2}}."
- Wrapper `lib/notifications/whatsapp.ts`:
  ```ts
  export async function sendWhatsAppTemplate(phone: string, template: string, params: string[]) {
    const res = await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: { name: template, language: { code: 'es' }, components: [{
          type: 'body', parameters: params.map(p => ({ type: 'text', text: p }))
        }] }
      })
    });
    return res.json();
  }
  ```

#### 5.2.3 Push Notifications con FCM
- Configurar Firebase Cloud Messaging en proyecto.
- Cliente con `firebase` SDK + Service Worker para push:
  ```ts
  // app/sw-push.ts (se usa en service worker)
  import { initializeApp } from 'firebase/app';
  import { getMessaging, onMessage } from 'firebase/messaging';
  const app = initializeApp({ messagingSenderId: '...' });
  const messaging = getMessaging(app);
  ```
- Suscripción del usuario:
  - En `/perfil/notificaciones`, botón "Activar notificaciones".
  - Setting up Service Worker en `public/firebase-messaging-sw.js`.
- Backend FCM v1 con JWT service account:
  ```ts
  import admin from 'firebase-admin';
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  await admin.messaging().send({
    token: userFcmToken,
    notification: { title: 'Orden en camino', body: 'Tu repartidor está a 5 min' },
    webpush: { fcmOptions: { link: '/mis-pedidos/123' } }
  });
  ```
- Tabla `push_subscriptions`:
  ```sql
  CREATE TABLE push_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fcm_token text NOT NULL,
    platform text DEFAULT 'web',
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, fcm_token)
  );
  ```

#### 5.2.4 Centro de notificaciones in-app
- Tabla `notifications` ya existe (Fase 1).
- Campana con badge en header contando no leídas.
- Suscripción Realtime para actualizar badge:
  ```ts
  supabase.channel(`notifications:${userId}`)
    .on('postgres_changes', { event: 'INSERT', table: 'notifications', filter: `user_id=eq.${userId}` }, () => refetchUnread())
    .subscribe();
  ```
- Página `/notificaciones` con lista completa (leídas + no leídas) y CTAs.

#### 5.2.5 Orquestador de canales
- Patrón strategy en `lib/notifications/dispatcher.ts`:
  ```ts
  interface NotificationContext {
    userId: string;
    template: string;
    data: Record<string, unknown>;
    channels: ('email' | 'whatsapp' | 'push' | 'in_app')[];
  }

  export async function dispatchNotification(ctx: NotificationContext) {
    if (ctx.channels.includes('in_app')) await createInAppNotification(ctx);
    if (ctx.channels.includes('email')) await sendEmailNotification(ctx);
    if (ctx.channels.includes('whatsapp')) await sendWhatsAppNotification(ctx);
    if (ctx.channels.includes('push')) await sendPushNotification(ctx);
  }
  ```
- Preferencias del usuario en `users.notification_preferences jsonb`:
  - `{"order_status": ["email","whatsapp"], "promos": ["email"], "reviews": ["email"]}`.
- Respetar preferencias al enviar.

#### 5.2.6 Recuperación de carrito abandonado
- Cron cada hora busca carts sin checkout en últimas 24h + 72h:
  - 24h: email "Olvidaste algo en tu carrito" + mini catálogo reducido.
  - 72h: email "Tu carrito está esperando" + cupón 5% si first-time buyer.
- Limits: 1 email por carrito; nunca enviar si ya checkouteó.

#### 5.2.7 Request de review
- 7 días post-delivered, enviar:
  - Email "¿Qué te pareció tu compra?" con link directo a `/productos/[slug]?review=1&order=<id>`.
  - Push "Tómate 30 segundos para calificar tu orden".

### Archivos a crear/modificar
```
lib/notifications/                                       [carpeta nueva]
  email.ts                                                [nuevo]
  whatsapp.ts                                            [nuevo]
  push.ts                                                [nuevo]
  in-app.ts                                              [nuevo]
  dispatcher.ts                                          [nuevo]
  templates.ts                                           [nuevo — registro de templates]
components/emails/                                        [carpeta nueva]
  OrderConfirmationEmail.tsx                              [nuevo]
  OrderStatusUpdateEmail.tsx                            [nuevo]
  CartAbandonedEmail.tsx                                 [nuevo]
  ReviewRequestEmail.tsx                                 [nuevo]
  WelcomeEmail.tsx                                       [nuevo]
  PasswordResetEmail.tsx                                 [nuevo]
app/api/notifications/subscribe/route.ts                 [nuevo — FCM token]
app/api/notifications/unsubscribe/route.ts               [nuevo]
supabase/migrations/00032_push_subscriptions.sql        [nuevo]
components/layout/NotificationBell.tsx                    [nuevo]
app/(customer)/notificaciones/page.tsx                  [nuevo]
components/customer/NotificationCenter.tsx              [nuevo]
.types/notification.ts                                   [nuevo]
.env.example                                             [modificar — RESEND, WHATSAPP, FCM vars]
```

### Criterios de aceptación
- Cliente recibe email + WhatsApp + push al confirmar orden.
- Carrito abandonado recibe recovery email 24h y 72h.
- Usuario puede configurar preferencias (desactivar promos por ej.).
- Campana con badge muestra notificaciones no leídas en tiempo real.

---

## 5.3 Cuenta del Cliente Avanzada (3 dev-days)

### Tareas

#### 5.3.1 Múltiples direcciones con etiquetas
- Tabla `addresses` ya existe. Ampliar:
  ```sql
  ALTER TABLE addresses
    ADD COLUMN label text DEFAULT 'Casa',
    ADD COLUMN delivery_notes text,         -- "dejar con el portero"
    ADD COLUMN is_default_shipping boolean DEFAULT false;
  ```
- CRUD en `app/(customer)/perfil/direcciones/page.tsx` ya existe; ampliar UI con etiquetas predefinidas (Casa, Trabajo, Mamá, Otro) y notes configurable.

#### 5.3.2 Tarjetas guardadas
- Fase 3 ya implementó Stripe customer con setup_future_usage.
- Página `app/(customer)/perfil/pagos/page.tsx`:
  - Lista tarjetas (Stripe `payment_methods.list(customer=...)`).
  - Botón "Eliminar tarjeta" + "Marcar como predeterminada".
  - Botón "Añadir nueva tarjeta" via Stripe Elements.
- En checkout, permitir seleccionar tarjeta guardada como Default.

#### 5.3.3 Re-order
- Botón "Volver a comprar" en cada orden de `/mis-pedidos`.
- Mismo flujo que 5.1.4, pero desde la orden específica.

#### 5.3.4 Notas de entrega
- En `addresses.delivery_notes` o como override por orden en `orders.delivery_notes`.

#### 5.3.5 Perfil completo
- `app/(customer)/perfil/page.tsx` ampliar:
  - Avatar (Suba deStorage).
  - Datos fiscales (RIF/J/V) para facturas.
  - Suscripción a newsletter (opt-in).
  - Preferencias de notificaciones (ver 5.2.5).
  - Actividad reciente (órdenes, reviews, puntos).

#### 5.3.6 Suscripción recurrente (opcional)
- Para productos comprados regularmente (leche, pan, huevos):
  - Flag `is_subscription_eligible` en `products`.
  - Componente `<SubscribeOptions />` con frecuencia (semanal, cada 2 semanas, mensual).
  - Stripe `subscriptions` con períodos configurables.
  - Job cron genera orders automática en cada fecha.

### Archivos a crear/modificar
```
supabase/migrations/00033_addresses_enhanced.sql          [nuevo]
supabase/migrations/00034_subscription_eligible.sql      [nuevo opcional]
app/(customer)/perfil/pagos/page.tsx                    [modificar — Stripe Elements]
app/(customer)/perfil/direcciones/page.tsx              [modificar — labels + notes]
app/(customer)/perfil/page.tsx                          [modificar — avatar + fiscal + preferencias]
components/customer/ProfileCompletePrompt.tsx            [nuevo]
```

### Criterios de aceptación
- Usuario puede tener 3+ direcciones con etiquetas.
- Añadir/eliminar tarjetas funciona sin salir de perfil.
- Re-order en 1 click respeta stock/zona con mensaje si cambia.

---

## 5.4 Optimización Móvil Absoluta (3 dev-days)

### Tareas

#### 5.4.1 PWA completo
- `public/manifest.json` ya existe; ampliar:
  - `shortcuts`: Carrito, Mis Pedidos, Buscar.
  - `categories`: shopping.
  - `screenshots` nativas iOS y Android.
  - `display: 'standalone'` con `display_override: ['window-controls-overlay', 'standalone']`.
- Offline support:
  - Catálogo cacheado en IndexedDB con `idb-keyval` (TTL 24h).
  - Carrito persiste (ya lo hace con Zustand persist).
  - Página `/offline` mostrada con retry.
- Background sync:
  - Cuando envía una orden offline, encola en IndexedDB.
  - Al recuperar conexión, envía automáticamente.

#### 5.4.2 Service Worker avanzado
- Migrar a `@ducanh2912/next-pwa` si `next-pwa` da problemas con Next 14:
  ```bash
  npm uninstall next-pwa && npm i @ducanh2912/next-pwa
  ```
- Config `next.config.mjs`:
  ```js
  import withPWA from '@ducanh2912/next-pwa';
  export default withPWA({
    dest: 'public',
    cacheOnFrontEndNav: true,
    aggressiveFrontEndNavCaching: false,
    reloadOnOnline: true,
    disable: process.env.NODE_ENV === 'development',
    workboxOptions: { disableDevLogs: true }
  })(nextConfig);
  ```

#### 5.4.3 Bottom sheets nativos
- Modal en mobile es incómodo. Usar framer-motion con `drag={true}` para abajo:
  ```tsx
  <motion.div
    drag="y"
    dragConstraints={{ top: 0, bottom: 500 }}
    dragElastic={0.2}
    onDragEnd={(_, info) => info.offset.y > 200 && onClose()}
  >
  ```
- Componente `<BottomSheet />` reutilizable para: product detail en móvil, cart drawer, location selector.

#### 5.4.4 Gestos touch
- Swipe-left en CartItem → eliminar con animación.
- Pull-to-refresh en listados.
- Long-press en product card → quick add.

#### 5.4.5 Imágenes responsive
- `next/image` en todo, con `sizes` y `placeholder="blur"`:
  ```tsx
  <Image
    src={product.imgUrl}
    alt={product.name}
    fill
    sizes="(max-width: 768px) 50vw, 200px"
    placeholder="blur"
    blurDataURL={product.blurUrl || DEFAULT_BLUR}
  />
  ```
- Generar blur placeholder en upload (Fase 6) con `sharp`:
  ```ts
  const blur = await sharp(image).resize(8).jpeg({ quality: 30 }).toBuffer();
  const blurDataUrl = `data:image/jpeg;base64,${blur.toString('base64')}`;
  ```

#### 5.4.6 AVIF/WebP
- Supabase Storage transforms:
  ```ts
  const imageUrl = `${supabaseUrl}/storage/v1/render/image/public/products/${path}?width=400&height=400&quality=80&format=webp`;
  ```
- En `<Image>` usar sourceSet con widths 100/200/400/800 and pixel densities 1x/2x/3x.

### Archivos a crear/modificar
```
public/manifest.json                                    [modificar]
public/firebase-messaging-sw.js                          [nuevo]
next.config.mjs                                         [modificar — @ducanh2912/next-pwa]
app/offline/page.tsx                                    [nuevo]
components/ui/BottomSheet.tsx                            [nuevo]
components/ui/SwipeableRow.tsx                           [nuevo]
components/ui/PullToRefresh.tsx                          [nuevo opcional]
lib/offline/queue.ts                                    [nuevo]
lib/offline/catalog-cache.ts                            [nuevo]
package.json                                            [modificar — if migrate]
```

### Criterios de aceptación
- Lighthouse PWA audit pasa (installable, offline, splash screen).
- Bottom sheet permite swipe-down para cerrar.
- Cart drawer se abre como bottom sheet en móvil (no bottom bar tap early).
- Imágenes responsive cargan 200px en móvil en lugar de 1000px en desktop.

---

## 5.5 Accessibility WCAG 2.1 AA (2 dev-days)

### Tareas

#### 5.5.1 Audit con axe-core
- En Playwright E2E:
  ```ts
  import AxeBuilder from '@axe-core/playwright';
  test('home page should not have a11y violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
  ```
- Tests similares en /productos, /checkout, /login.

#### 5.5.2 Correcciones comunes
- Todos los inputs tienen `<label htmlFor>`.
- Botones con texto o `aria-label` descriptivo.
- Modals con `role="dialog"` `aria-modal="true"` y focus trap.
- Imágenes con `alt` descriptivo (no "image").
- Skip-link al inicio de cada layout:
  ```tsx
  <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50">Saltar al contenido</a>
  ```
- Modo alto contraste con media query:
  ```css
  @media (prefers-contrast: more) {
    :root { --background: white; --foreground: black; --border: black; }
  }
  ```

#### 5.5.3 Keyboard navigation
- Todos los componentes navegables por teclado sin mouse.
- Focus visible (Tailwind `focus-visible:` en lugar de `focus:` donde sea posible).
- Cart drawer con `Escape` para cerrar.

#### 5.5.4 prefers-reduced-motion
- Checkear `matchMedia('(prefers-reduced-motion: reduce)')`.
- Deshabilitar animaciones no esenciales si el usuario lo pide.

#### 5.5.5 Screen reader testing
- Verfico con NVDA (Windows) y VoiceOver (Mac) en /checkout.
- ARIA live region para updates dinámicos (ej: cart count).
  ```tsx
  <span aria-live="polite">{cartCount} items</span>
  ```

### Archivos a crear/modificar
```
app/tests/e2e/accessibility.spec.ts                      [nuevo]
app/globals.css                                         [modificar — high contrast MQ]
components/ui/*                                           [modificar — a11y fixes]
lib/hooks/useReducedMotion.ts                           [nuevo]
lib/hooks/useSkipLink.ts                                 [nuevo opcional]
```

### Criterios de aceptación
- axe report en CI muestra 0 violations.
- Lighthouse Accessibility score >=95.
- Navegación completa posible sin mouse.
- NVDA anuncia correctamente elementos clave.

---

## 5.6 Performance UX (2 dev-days)

### Tareas

#### 5.6.1 Skeleton screens
- Ya existe `<LoadingSkeleton />`; expandir a:
  - ProductCardSkeleton (mock card shimmer).
  - ProductGridSkeleton (array of 8).
  - CheckoutLoading.
  - OrderDetailSkeleton.

#### 5.6.2 Optimistic UI en cart
- Al añadir al carrito, mostrar +1 inmediatamente, ry rollback si API falla.

#### 5.6.3 Toast improvements
- Posición `bottom-center` en móvil (no top que tapa status bar).
- Stack vertical con animate-in.

#### 5.6.4 Preconnect y DNS-prefetch
- En layout.tsx:
  ```tsx
  <link rel="preconnect" href="https://*.supabase.co" />
  <link rel="dns-prefetch" href="https://challenges.cloudflare.com" />
  ```

### Criterios de aceptación
- Tiempo de perceived load baja 30% con skeletons.
- Sin flujos bloqueantes en añadir al carrito.

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| WhatsApp API costos escalan | Alta | Medio | Solo críticas (confirma/cambio estado), no marketing blast |
| FCM no soportado en iOS Safari | Alta | Medio | Fallback a email + app store link a la app móvil nativa |
| Push permissions bloqueados | Media | Medio | UX fricción; mostrar el "Activar notificaciones" en contexto post-orden |
| Recuperación carrito GMC (GDPR) no permite | Baja | Bajo | Opt-out explícito en preferencias; nunca spammear |
| Axe-core misses puntos cualitativos | Alta | Bajo | Manual screen reader testing como complemento |
| next-pwa vs @ducanh2912/next-pwa rompe build | Media | Medio | Migrar con精力 cuidado; docs de migración; rollback fácil |

---

## Dependencias con otras fases

- **Fase 6** (Admin): Admin puede enviar notificaciones broadcast (campañas).
- **Fase 8** (Operación): Disparar notificaciones en runbook incidents (sistema caído → mensaje masivo).

---

## Siguiente

[Fase 6 — Panel Admin Profesional](./06-admin-pro.md)
