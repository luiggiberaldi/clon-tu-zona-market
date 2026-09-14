# 11 — Backlog Técnico Semana a Semana

> Checklist granular para tracking diario. Marca `[x]` al completar cada item. Las dependencias marcadas como `Dep: X` indican el item que debe estar cerrado antes.

---

## Convenciones

- `[ ]` pendiente
- `[x]` completado
- `(~)` opcional
- `Dep: X.Y` requiere item X.Y previo
- `Test: ...` criterio de aceptación técnico

---

## Semana 1 — Fase 1.1 + 1.4 Setup

### Lunes-Martes: Supabase CLI + Migraciones base

- [ ] Instalar `supabase` CLI en dev
- [ ] `npx supabase init` en el repo
- [ ] Renombrar `supabase/schema.sql` a `supabase/migrations/00001_init_schema.sql`
- [ ] Verificar ejecución local: `npx supabase start` + `npx supabase db reset`
- [ ] Si errores, dividir en migraciones lógicas 00001-00004
- [ ] `npx supabase link --project-ref <production-ref>`
- [ ] Variables en `.env.example`: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`, `SUPABASE_PROJECT_REF`
- [ ] **Test:** `npx supabase db push --linked --dry-run` sin errores

### Miércoles: Migración tablas nuevas (Fase 1.1.3)

- [ ] Crear `supabase/migrations/00005_expand_production.sql`
- [ ] Audit logs + indexes + RLS policies
- [ ] warehouses + inventory_items (Fase 2.1.1 pre-funded)
- [ ] stock_movements + stock_reservations (Fase 2.1.3 pre-funded)
- [ ] coupons + coupon_redemptions (Fase 2.4 pre-funded)
- [ ] reviews (Fase 2.3.4 pre-funded)
- [ ] wishlist (Fase 2.3.5 pre-funded)
- [ ] notifications (Fase 5.2 pre-funded)
- [ ] **Test:** `npx supabase db reset && psql < test_data.sql` sin errores

### Jueves: Funciones SQL (Fase 1.1.4)

- [ ] `supabase/migrations/00006_functions.sql`
- [ ] `get_cart_summary(p_cart_uuid, p_zone_id)`
- [ ] `deduct_stock(p_order_id)`
- [ ] `get_admin_kpis(p_date_from, p_date_to)`
- [ ] `cleanup_expired_reservations()`
- [ ] **Test:** desde SQL Editor, ejecutar funciones con datos de prueba

### Viernes: Observabilidad setup (Fase 1.4)

- [ ] Crear cuenta Sentry, obtener `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`
- [ ] `npx @sentry/wizard@latest -i nextjs`
- [ ] Revisar diff antes de commiter (revertir configs innecesarias)
- [ ] Configurar `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- [ ] Instalar `pino` + `pino-pretty`
- [ ] Crear `lib/logger.ts` wrapper
- [ ] Instalar `@vercel/analytics` + `@vercel/speed-insights`
- [ ] En `app/layout.tsx` añadir `<Analytics />` + `<SpeedInsights />`
- [ ] Variables `SENTRY_*` en Vercel + `.env.example`
- [ ] **Test:** Lanzar error en `/api/health` y verificar que aparece en Sentry <30s

---

## Semana 2 — Fase 1.2 Auth Hardening + Fase 1.3 Seguridad

### Lunes: MFA TOTP (Fase 1.2.1)

- [ ] Instalar `otplib` + `@types/otplib` + `qrcode`
- [ ] `lib/auth/mfa.ts` con `generateMFASecret(email)` y `verifyMFAToken(token, secret)`
- [ ] Endpoint `POST /api/auth/mfa/setup` que genera secret + QR otpauth URI
- [ ] Endpoint `POST /api/auth/mfa/verify` que valida token y marca `users.mfa_enabled=true`
- [ ] Componente `<MFASetup />` en `app/(dashboard)/configuracion/mfa/page.tsx`
  - QR display + input 6 dígitos + button verify
- [ ] Login flow: si `mfa_enabled`, mostrar `<MFAChallenge />`
- [ ] Middleware: si rol admin/driver y `mfa_enabled=false` → redirect `/configuracion/mfa`
- [ ] **Test:** Login admin sin MFA me redirige a setup. Tras configurar MFA login pide código TOTP.

### Martes: Rate Limiting Auth (Fase 1.2.2)

- [ ] Crear cuenta Upstash Redis, obtener `UPSTASH_REDIS_URL` + `UPSTASH_REDIS_TOKEN`
- [ ] Instalar `@upstash/ratelimit` + `@upstash/redis`
- [ ] `lib/rate-limit.ts` con `ratelimiters.{auth,api,payment,admin}`
- [ ] Aplicar en `/login`, `/registro`, `/recuperar`, `/api/ordenes POST`, `/api/admin/*`
- [ ] Respuesta 429 con `Retry-After` header
- [ ] **Test:** 6 intentos login fallidos consecutivos → 429 con Retry-After.

### Miércoles: Email Verification + Reset (Fase 1.2.3-4)

- [ ] Supabase Dashboard: Email confirmations ON
- [ ] Custom email templates (supabasedefaults editables)
- [ ] Middleware: si user activo sin `email_confirmed_at` → redirect `/verificar-email`
- [ ] Página `app/(auth)/verificar-email/page.tsx` con botón "Reenviar"
- [ ] Endpoint `/api/auth/recuperar` con token JWT firmado (HMAC) 15 min
- [ ] Email con link `/recuperar?token=<jwt>`
- [ ] `app/(auth)/recuperar/page.tsx` valida token server-side antes de form
- [ ] **Test:** Registro → email verificación recibido → click → redirige al home autenticado.

### Jueves: Audit Logs Auth + Sessions (Fase 1.2.6-7)

- [ ] Migración `00007_rls_roles.sql` con roles granulares (manager, super_admin)
- [ ] Helper SQL `is_admin()` function
- [ ] RLS policies factorizadas por rol
- [ ] API route `/api/webhooks/supabase-auth` recibe auth events
- [ ] Insert en `audit_logs` por cada evento (login, signup, reset)
- [ ] Instalar `otplib` + revisar refresh tokens en middleware (cada 5min si cercano a expiración)
- [ ] Logout revoca sesión en Supabase (no solo cookie)
- [ ] Opcional: tabla `sessions` para `/perfil/sesiones`
- [ ] **Test:** Login → ver entrada en `audit_logs` con ip + user-agent. Logout → sesión inutilizable.

### Viernes: Security headers + Turnstile (Fase 1.3)

- [ ] `next.config.mjs` `headers()` con CSP, HSTS, X-Frame-Options, etc.
- [ ] Verificar rating en securityheaders.com → A+
- [ ] Cloudflare Turnstile: crear cuenta, obtener siteKey + secretKey
- [ ] Variables `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`
- [ ] `lib/turnstile.ts` con `verifyTurnstile(token)`
- [ ] Componente `<TurnstileWidget />` en `components/auth/TurnstileWidget.tsx`
- [ ] Aplicar en login, registro, checkout
- [ ] `lib/csrf.ts` con `assertCsrf(req)` (comparar Origin vs dominio)
- [ ] Páginas `/privacidad`, `/terminos`, `/cookies` conteúdo legal
- [ ] `<CookieConsent />` que guarda preferencia y solo carga analytics si consents
- [ ] **Test:** Sin Turnstile válido login retorna 403. Sin header Origin válido POST retorna 403.

---

## Semana 3 — Fase 1.5 Testing + Fase 1.6 CI/CD

### Lunes: Expandir Unit tests

- [ ] Tests: `lib/auth/mfa.test.ts` (generate/verify TOTP)
- [ ] Tests: `lib/rate-limit.test.ts` (mock Redis, sliding window)
- [ ] Tests: `lib/csrf.test.ts`
- [ ] Tests: `lib/turnstile.test.ts` (mock fetch)
- [ ] Tests: `lib/utils/validation.test.ts` expandir (cupones, dirección, MFA token)
- [ ] `store/zoneStore.test.ts`
- [ ] Coverage >80% en `lib/`
- [ ] **Test:** `npm run test:coverage` muestra >=80%.

### Martes: Integration tests setup

- [ ] `vitest.config.integ.ts` con setup que espera a Supabase local healthcheck
- [ ] `tests/integration/auth.test.ts` — signup, login, MFA, logout (DB real)
- [ ] `tests/integration/cart.test.ts` — add/update/remove con DB real
- [ ] `tests/integration/checkout.test.ts` — checkout end-to-end con Stripe mock
- [ ] `tests/integration/inventory.test.ts` — deduct_stock trigger SQL
- [ ] Script `package.json`: `"test:integration": "vitest run --config vitest.config.integ.ts"`
- [ ] **Test:** `npm run test:integration` pasa con `npx supabase start` running.

### Miércoles: Playwright E2E setup + 5 specs

- [ ] Instalar `@playwright/test`, run `npx playwright install --with-deps chromium`
- [ ] `playwright.config.ts` con webServer + trace on first retry
- [ ] `tests/e2e/browse-add-cart.spec.ts` — browse → add cart
- [ ] `tests/e2e/checkout-flow.spec.ts` — Stripe test card complete
- [ ] `tests/e2e/auth.spec.ts` — registro + login + logout
- [ ] `tests/e2e/admin-product-crud.spec.ts` — crear/editar/eliminar producto
- [ ] `tests/e2e/mobile-viewport.spec.ts` — mismo flujo en 375x812
- [ ] **Test:** `npm run test:e2e` pasa los 5 specs.

### Jueves: CI/CD .github/workflows/ci.yml

- [ ] Workflow en `.github/workflows/ci.yml`
- [ ] Job `quality` con steps: checkout, setup node 20, npm ci, lint, typecheck, coverage, build, upload artifact, Lighthouse CI
- [ ] Variables `NEXT_PUBLIC_SUPABASE_*`, `SENTRY_*` en secrets GitHub
- [ ] Job `e2e` dependiente de `quality` con Playwright install + run
- [ ] Push a `main` y `staging` branches
- [ ] PR trigger automáticamente
- [ ] **Test:** Abrir PR con cambio trivial → todos los checks verdes en <10 min.

### Viernes: Branch Protection + Preview Deploys

- [ ] GitHub: branch protection `main`, require PR + 1 approval + status checks (quality, e2e)
- [ ] Vercel: conectar repo, configurar 3 env (dev, staging, production)
- [ ] Cada PR genera preview URL automática
- [ ] Coment en PR con link al preview + Lighthouse diff
- [ ] Environment promotion: `main` → manual approval to production
- [ ] DB migrations en CI: job separado aplica `supabase db push --linked` antes de deploy
- [ ] Settings Vercel: enable speed insights + monitoring
- [ ] **Test:** Merge a `main` requiere review + checks. Deploy automático a staging.

---

## Semana 4-5 — Fase 2.1 Inventario Multi-Zona + Stock (Top 10 #4 + #5)

### Semana 4: Migración inventory_items + lógica cart

- [ ] Script `scripts/migrate-inventory.ts` (migrar `stock_quantity` por zona)
- [ ] Migración `00008_inventory_views.sql` con `products_with_stock` view
- [ ] API `/api/productos/[slug]/stock` modificado: GET con `?zone_id=` retorna `{available, reserved, low_stock}`
- [ ] `store/cartStore.ts` modificado: addItem verifica stock API
- [ ] Cart UI: si no stock en zona → toast "No disponible en tu zona", no añadir
- [ ] Cart UI: si stock < quantity → limitar + banner "Stock limitado: quedan N"
- [ ] **Test:** Cart en zona sin stock bloquea añadir. En zona con stock parcial limita.

### Semana 5: Reservas + Alertas stock bajo

- [ ] API `POST /api/checkout/reserve` crea `stock_reservations` con TTL 15min
- [ ] Increase `inventory_items.reserved_quantity`
- [ ] Vercel Cron cada minuto: `POST /api/checkout/cleanup` (ejecuta `cleanup_expired_reservations()`)
- [ ] En webhook Stripe (o confirm PagoMóvil): llamar `deduct_stock(order_id)`
- [ ] `deduct_stock`: decrementa quantity, decrementa reserved_quantity, crea stock_movements, elimina reservations
- [ ] Migración `00009_low_stock_trigger.sql` con trigger + funcion `check_low_stock()`
- [ ] Página `app/(dashboard)/admin/inventario/page.tsx` con `<InventoryTable />` editable
- [ ] Componente `<LowStockWidget />` en dashboard admin
- [ ] Ajustar stock manual: dialog "Ajustar" + creación `stock_movements` con reason
- [ ] Transferencia entre bodegas: dialog con origen+destino+cantidad
- [ ] **Test:** Checkout abandono 15min → reservas cleanup → stock disponible. Stock bajo → admin recibe notificación.

---

## Semana 6 — Fase 3.1 PagoMóvil + OCR (Top 10 #3)

### Lunes: Tablas + Storage setup

- [ ] Migración `00017_payment_accounts.sql` (cuentas PagoMóvil/Transferencia/Zelle)
- [ ] Migración `00018_payment_confirmations.sql` con todos los campos
- [ ] Crear bucket en Supabase Storage `comprobantes`
- [ ] Policies Storage: público read de comprobantes propios, write solo owner
- [ ] Seed 1-2 cuentas de prueba: PagoMóvil BNC, Zelle email
- [ ] **Test:** Subir archivo a `comprobantes` vía API + URL pública funciona.

### Martes: Subida de comprobante UI

- [ ] Componente `<PaymentProofUpload />` con drag-drop + preview
- [ ] Compresión client-side con `browser-image-compression`
- [ ] Acepta JPG/PNG/HEIC/PDF, máximo 5MB
- [ ] Endpoint `POST /api/ordenes/[id]/comprobante` con `multipart/form-data`
- [ ] Subir a Storage path `comprobantes/<order_id>/<uuid>.<ext>`
- [ ] Crear fila en `payment_confirmations` con `status='pending'`
- [ ] Disparar async: POST a `/api/ordenes/[id]/ocr` (o procesar inline en route worker)
- [ ] **Test:** Cliente sube comprobante → estado orden cambia a `confirming`.

### Miércoles: OCR con Tesseract.js

- [ ] Instalar `tesseract.js`
- [ ] `lib/payments/ocr.ts` con `extractProofData(imagePath)`:
  - Pre-procesamiento con `sharp` (resize, sharpen, modulate)
  - Tesseract.recognize con 'spa+eng'
  - Regex patterns para PagoMóvil venezolano (banco, referencia, cédula, monto, fecha)
- [ ] Llamar OCR desde endpoint comprobante, actualizar `payment_confirmations.ocr_data`, `ocr_confidence`
- [ ] **Test:** Comprobante sample → OCR extrae referencia + monto con >70% confidence.

### Jueves: Match score + auto-confirm

- [ ] `lib/payments/match-confirmations.ts` con `calculateMatchScore(input)`
- [ ] Validations: banco, monto ±2%, fecha ≤24h, concepto contiene order_number
- [ ] Score >=80 → `status='auto_confirmed'`, orden pasa a `paid` automáticamente
- [ ] Score 50-79 → `status='manual_review'`, notification al admin
- [ ] Score <50 → `status='manual_review'` con flag `low_confidence`
- [ ] Trigger en orden status='paid' → deduct_stock + send_order_confirmation (notificación)
- [ ] **Test:** Comprobante correcto auto-confirma en <30s. Erróneo entra cola manual.

### Viernes: pHash + Panel admin review + Zelle + Transferencia

- [ ] Instalar `image-hash` o `sharp-blockhash`
- [ ] `lib/payments/phash.ts` con `computePHash(imagePath)`
- [ ] Al subir comprobante, calcular pHash. Comparar con `payment_confirmations.phash` existentes.
- [ ] Hamming distance <5 → flagged manual review con note "Posible duplicado #ID"
- [ ] Página `app/(dashboard)/admin/cobros/page.tsx` con `<ConfirmationReviewModal />`
- [ ] Modal: imagen grande + datos OCR (editable) + datos esperados + botones Aprobar/Rechazar
- [ ] Realtime en `payment_confirmations` para updates admin sin refresh
- [ ] Componente `<TransferInstructions />` para transferencia bancaria
- [ ] Componente `<ZelleInstructions />` para Zelle (USD directo)
- [ ] **Test:** Duplicado de comprobante detectado. Admin aprueba → orden paga.

---

## Semana 7 — Fase 4.3 Tracking Realtime (Top 10 #7)

### Lunes: Tabla driver_locations + Realtime

- [ ] Migración `00027_driver_locations.sql`
- [ ] `CREATE TABLE driver_locations` + `driver_location_history`
- [ ] `ALTER PUBLICATION supabase_realtime ADD TABLE driver_locations`
- [ ] Index en `(driver_id, last_seen)` para health checks
- [ ] **Test:** Desde SQL editor, update driver_locations → cliente subscripto recibe change.

### Martes: Hook useDriverTracking en driver app

- [ ] `lib/hooks/useDriverTracking.ts`
- [ ] `navigator.geolocation.watchPosition` con `enableHighAccuracy:true`
- [ ] Upsert cada update a `driver_locations`
- [ ] Guardar histórico cada 30s
- [ ] Adaptive interval: si speed <5km/h (detenido) → 60s; si speed >20km/h y movement → 10s
- [ ] Battery level detection: si <20% → 90s interval
- [ ] Hook `is_online` heartbeat (si no envía en 90s, marked offline)
- [ ] Integrar en `app/(dashboard)/repartidor/rutas/[routeId]/page.tsx`
- [ ] **Test:** Driver abre ruta → location actualizada cada ~30s. Cerrar app → heartbeat check a 90s marca offline.

### Miércoles: Tracking UI en cliente

- [ ] Página `app/(customer)/mis-pedidos/[id]/rastrear/page.tsx`
- [ ] Instalar `react-leaflet` + `leaflet`
- [ ] Mapa Leaflet centrado en dir cliente
- [ ] Marcador driver con icon custom + rotación según heading
- [ ] Polylinea de `driver_location_history` (últimos 30 min)
- [ ] Suscripción Realtime `driver_locations` → updateMarkerPosition(payload.new)
- [ ] **Test:** Driver se mueve → cliente ve marcador moverse en tiempo real (<5s delay).

### Jueves: ETA con OSRM + Botones driver

- [ ] `lib/geo/osrm.ts` con `getETA(from, to)` usando `router.project-osrm.org`
- [ ] ETA recalculado cada 60s en cliente
- [ ] Display ETA + distancia en página tracking
- [ ] API `PATCH /api/ordenes/[id]/status` con `{ status: 'arrived' | 'delivered' | 'failed' }`
- [ ] Componente `<StopCard />` con botones "Llegué", "Entregado", "Cliente no estaba"
- [ ] Cada change crea `notifications` row + envía email/WhatsApp (ver semana 8)
- [ ] **Test:** Driver click "Llegué" → cliente recibe notificación. ETA displayed y actualiza.

### Viernes: Driver health check + notification alerts

- [ ] API `POST /api/admin/drivers/health-check` (cron cada 5min Vercel)
- [ ] Si driver no update location en 5min → push "¿Sigues en ruta?"
- [ ] Si 10min sin respuesta → mark driver inactivo, notificar admin
- [ ] Reassign stops logic: si driver inactivo, route_stops pasan a cola general
- [ ] **Test:** Driver simula offline 10min → admin recibe notificación + stops reasignadas.

---

## Semana 8 — Fase 5.2 Notificaciones multi-canal (Top 10 #6) + Fase 7.4 SEO (Top 10 #10)

### Lunes: Resend + React Email setup

- [ ] Crear cuenta Resend, obtener `RESEND_API_KEY`
- [ ] Verificar dominio (DKIM, SPF, DMARC)
- [ ] Instalar `resend` + `@react-email/components`
- [ ] `lib/notifications/email.ts` wrapper
- [ ] Templates en `components/emails/`:
  - `OrderConfirmationEmail.tsx`
  - `OrderStatusUpdateEmail.tsx`
  - `WelcomeEmail.tsx`
  - `PasswordResetEmail.tsx`
- [ ] `render(template)` + `resend.emails.send(...)`
- [ ] **Test:** Orden confirmada → email OrderConfirmation llega en <30s con orden细节.

### Martes: WhatsApp Business setup + templates

- [ ] 360dialog signup o Meta Cloud API directo
- [ ] Variables `WHATSAPP_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAMESPACE`
- [ ] Templates Meta approval: `order_confirmation`, `order_shipped`, `order_delivered`
- [ ] `lib/notifications/whatsapp.ts` con `sendWhatsAppTemplate(phone, template, params)`
- [ ] Trigger en orden status changes → send WhatsApp
- [ ] **Test:** Cambio estado orden → WhatsApp llega con datos custom.

### Miércoles: Centro de notificaciones in-app + dispatcher

- [ ] Hook `useNotificationBadge` en header contando unread
- [ ] Suscripción Realtime `notifications` → update badge inmediatamente
- [ ] Página `app/(customer)/notificaciones/page.tsx` lista completa
- [ ] Componente `<NotificationBell />` en `Header.tsx`
- [ ] `lib/notifications/dispatcher.ts` patrón strategy
- [ ] `lib/notifications/in-app.ts` crea row en `notifications`
- [ ] Preferencias en `users.notification_preferences jsonb`
- [ ] Respetar preferencias al dispatch
- [ ] **Test:** Cambio estado → campana badge +1. Marcar leído actualiza badge.

### Jueves: SEO Metadata + JSON-LD

- [ ] `app/layout.tsx` `metadata.template` con `%s | TuZonaMarket`
- [ ] `metadataBase: new URL('https://tuzonamarket.com')`
- [ ] `openGraph.{siteName, locale:'es_VE', images}`
- [ ] En cada página: `generateMetadata({params})` con title, description, OG
- [ ] Componente `<JsonLd />` render `<script type="application/ld+json">`
- [ ] En `/`: Organization + WebSite SearchAction JSON-LD
- [ ] En `/productos/[slug]`: Product Schema (offers, aggregateRating)
- [ ] En `/categorias/[slug]`: BreadcrumbList
- [ ] `app/sitemap.ts` dinámico
- [ ] `app/robots.ts`
- [ ] **Test:** https://validator.schema.org/ pasa. Google Search Console sitemap submit.

### Viernes: Web Vitals essentials + Lighthouse CI

- [ ] `next/font/local` self-hosting Inter (latin + latin-ext)
- [ ] `<Image priority fetchPriority="high" sizes="100vw">` en hero home
- [ ] `placeholder="blur"` + `blurDataURL` en todas las imágenes de productos
- [ ] Reservar `width/height` en todos los `<Image fill>`
- [ ] `preconnect` a `https://*.supabase.co` y `https://challenges.cloudflare.com`
- [ ] `lighthouserc.json` con budgets (LCP <2.5s, CLS <0.1, perf >=95)
- [ ] Job Lighthouse CI en workflow
- [ ] **Test:** Lighthouse mobile `/` >=95 en Performance. LCP <2.5s.

---

## Post-Top 10: features complementarias (fases completas)

Las siguientes semanas añaden features que no están en el Top 10 pero que cierran el roadmap completo:

### Semana 9 — Fase 2.2 Búsqueda avanzada

- [ ] Setup Meilisearch Cloud (vía Postgres FTS como opción free si budget=0)
- [ ] Migración `00011_fulltext_search.sql` (fallback Postgres)
- [ ] API `/api/search` actualizada a Meilisearch o `search_products()` RPC
- [ ] Autocomplete en `<SearchBar />` con debounce 300ms
- [ ] Facets dinámicas en `<ProductFilters />`
- [ ] Webhook Supabase DB → endpoint `/api/webhooks/meili-sync` (o trigger pg_net)
- [ ] **Test:** Buscar "lech ent" encuentra "Leche Entera 1L".

### Semana 10 — Fase 2.3 Productos avanzados

- [ ] Migración `00012_variants_bundles.sql`
- [ ] Tabla `product_variants` + API
- [ ] Componente `<VariantSelector />`
- [ ] Tabla `bundles` + `bundle_items` + página `/combos`
- [ ] Migración `00013_reviews_qa_wishlist.sql`
- [ ] Tabla `reviews` (ya creada en Fase 1, aquí ampliamos lógica)
- [ ] Componente `<ReviewForm />` + `<ReviewsList />`
- [ ] Migración wishlist a server + API
- [ ] Q&A tablas + componente `<QASection />`
- [ ] **Test:** Variantes cambian precio al seleccionar. Review se envía solo si order delivered.

### Semana 11 — Fase 2.4 Cupones

- [ ] API `POST /api/cupones/validate` con todas las validaciones
- [ ] Componente `<CouponInput />` en checkout
- [ ] Aplicación en `POST /api/ordenes` (re-validar server-side)
- [ ] Migración `00014_promotions.sql`
- [ ] API + admin CRUD `/admin/cupones`
- [ ] Engine de promociones en `/api/carrito/calcular`
- [ ] **Test:** Cupón SAVE10 (10%) aplica correctamente. Cupón expirado rechazado.

### Semana 12 — Fase 2.5 Fidelidad

- [ ] Migración `00015_loyalty.sql` + `00016_loyalty_triggers.sql`
- [ ] Tabla `loyalty_accounts` + `loyalty_transactions` + Triggers
- [ ] Acumulación automática al entregar
- [ ] Componente `<LoyaltyRedeem />` en checkout
- [ ] Página `app/(customer)/perfil/fidelidad/page.tsx`
- [ ] Cron Supabase `expire_loyalty_points` diario
- [ ] **Test:** Compra delivered → puntos acumulados (1% de total).

### Semana 13 — Fase 4.1 Cobertura PostGIS

- [ ] Habilitar PostGIS en Supabase
- [ ] Migración `00023_postgis_zones.sql` con coverage_polygon + center_point
- [ ] Migración `00024_find_zone_function.sql`
- [ ] Componente `<AddressAutocomplete />` con Nominatim
- [ ] API `POST /api/zonas/validar` con ST_Contains
- [ ] Editor admin polígonos en `/admin/zonas/[id]/mapa`
- [ ] Migración `00025_waitlist.sql` + UI lista de espera
- [ ] **Test:** Dirección dentro de Valencia Norte → auto-detecta zona + ETA.

### Semana 14 — Fase 4.2 Asignación Automática

- [ ] Migración `00026_delivery_routes.sql` con delivery_routes + route_stops
- [ ] `lib/logistics/assign.ts` con autoAssign()
- [ ] `lib/logistics/route-optimize.ts` nearest neighbor + Haversine
- [ ] API `POST /api/rutas/asignar`
- [ ] Página `admin/rutas/asignar` con Auto-assign button
- [ ] Drag-drop reassign manual
- [ ] **Test:** 20 órdenes → 4 drivers reciben 5 stops cada uno optimizadas.

### Semana 15 — Fase 4.4 Horarios con capacidad

- [ ] Migración `00028_delivery_slots.sql`
- [ ] Generación programática cron.daily → slots para 14 días futuros
- [ ] API `/api/slots` lista slots disponibles con capacidad
- [ ] `<TimeSlotPicker />` modificado con Realtime
- [ ] Reserva slot al checkout, libera al cancelar
- [ ] Migración `00029_holidays.sql` con feriados venezolanos seed
- [ ] **Test:** Slot lleno (20 órdenes) aparece grisADO Realtime.

### Semana 16 — Fase 6.1-6.2 Dashboard + Productos admin

- [ ] `app/admin/page.tsx` dashboards con widgets Recharts
- [ ] `<KpiCard />`, `<SalesChart />`, `<OrdersByStatusChart />`
- [ ] DateRangePicker + ZoneFilter
- [ ] API `/api/admin/kpis` con RPC `get_admin_kpis`
- [ ] Bulk import productos CSV con `papaparse`
- [ ] Drag-drop imágenes con `react-dropzone`
- [ ] `<RichTextEditor />` con `@tiptap/react`
- [ ] `<CategoryTree />` con `@dnd-kit/core`
- [ ] Migración `00035_categories_tree.sql`, `00036_brands.sql`, `00037_published_at.sql`
- [ ] **Test:** Importar 100 productos CSV <10s. Drag image reordena.

### Semana 17 — Fase 6.3 Pedidos workflow

- [ ] Página admin/ordenes con `<OrdersKanban />` drag-drop @dnd-kit
- [ ] `<OrderDetailsDrawer />` con historial cambios
- [ ] Migración `00038_refunds.sql` + API `/api/ordenes/[id]/refund`
- [ ] Generación PDFs con `@react-pdf/renderer`: Invoice, PickingList, ShippingLabel
- [ ] Bulk actions: imprimir etiquetas, marcar enviadas, generar picking
- [ ] **Test:** Drag orden entre estados actualiza server. Reembolso parcial reduce total.

### Semana 18 — Fase 6.4-6.5 CRM + Reportes

- [ ] Página `admin/clientes` con filtros + `<CustomerTable />`
- [ ] Página `admin/clientes/[id]` perfil 360° con tabs
- [ ] Migración `00039_customer_segments.sql` + segmentación dinámica
- [ ] API + UI bloquear usuario
- [ ] Generador reportes `admin/reportes` con fecha/zona/categoría filtros
- [ ] Export CSV/Excel con `xlsx`
- [ ] Migración `00041_scheduled_reports.sql` + cron envío email programado
- [ ] **Test:** Buscar cliente por email funciona. Reporte programado semanal llega cada lunes 8am.

### Semana 19 — Fase 7.1-7.3 Performance + Cache

- [ ] `@next/bundle-analyzer` + script `npm run analyze`
- [ ] Edge runtime en GET-only API routes
- [ ] ISR `revalidate = 60` en /productos
- [ ] `revalidateTag('products')` en mutaciones admin
- [ ] `lib/cache/redis.ts` con `cacheGet`/`cacheInvalidate`
- [ ] Aplicar cache en catálogo, stock por zona, KPIs admin
- [ ] Performance budget en CI: First Load JS <150 kB
- [ ] **Test:** Lighthouse Analysis mobile >=95.

### Semana 20 — Fase 7.2 DB Optimization

- [ ] Migrar URL Supabase a Pooler transaction mode
- [ ] Migración `00050_optimization_indexes.sql` con todos los índices
- [ ] Verificar `pg_stat_statements` extension + reset
- [ ] Tuning autovacuum en orders + stock_movements
- [ ] Migración `00051_partitioning.sql` (particionado orders por mes) (~opcional)
- [ ] Read replicas (Pooler solo URL) en `lib/supabase/server.ts`
- [ ] **Test:** Query top 20 con mean_exec_time >100ms identificada y optimizada.

### Semana 21 — Fase 5.4 PWA + Móvil premium

- [ ] Migrar `next-pwa` a `@ducanh2912/next-pwa` si hace falta
- [ ] Workbox runtime caching en `next.config.mjs`
- [ ] Background sync para POST fallidos (crear orden offline)
- [ ] App shortcuts en manifest
- [ ] Página `/offline`
- [ ] Componente `<BottomSheet />` con framer-motion drag
- [ ] `<SwipeableRow />` para CartItem swipe-left = delete
- [ ] iOS PWA meta tags + splash screens
- [ ] **Test:** Lighthouse PWA audit pasa. Offline: catálogo cacheado visible.

### Semana 22 — Fase 5.5 Accessibility WCAG AA

- [ ] `app/tests/e2e/accessibility.spec.ts` con `@axe-core/playwright`
- [ ] Tests a11y en /, /productos, /checkout, /login
- [ ] Fix issues encontrados (labels, aria, focus visible, etc.)
- [ ] Skip-link al inicio de cada layout
- [ ] Modo alto contraste media query CSS
- [ ] Modo `prefers-reduced-motion` checks
- [ ] Manual screen reader testing NVDA + VoiceOver
- [ ] **Test:** axe 0 violations. Lighthouse Accessibility >=95.

### Semana 23 — Fase 5.1 Personalización + 5.3 Cuenta cliente

- [ ] Migración `00030_personalization.sql` + `00031_affinity_job.sql`
- [ ] Cron diario actualiza `user_product_affinity`
- [ ] Componente `<RecommendationsRow />` 4 secciones
- [ ] Homepage dinámica por zona + hero adaptativo
- [ ] Migración `00033_addresses_enhanced.sql` con label + delivery_notes + is_default
- [ ] Tarjetas guardadas Stripe customer UI
- [ ] Re-order button en mis-pedidos
- [ ] Completrar perfil fiscal (RIF/J/V) para facturas
- [ ] **Test:** Homepage zona Valencia Norte muestra productos con stock en esa zona.

### Semana 24 — Fase 8 Lanzamiento + Operación

- [ ] Runbook `docs/runbook/01-db-outage.md` ... `08-staging-promotion.md`
- [ ] OWASP ZAP automated en staging
- [ ] `npm audit --omit=dev` sin vulnerabilidades críticas
- [ ] HSTS preload list submission
- [ ] Status page setup BetterStack o UptimeRobot
- [ ] Subdomain `status.tuzonamarket.com`
- [ ] PostHog setup events tracking
- [ ] Microsoft Clarity script
- [ ] A/B testing setup con PostHog experiments
- [ ] Datos fiscales en checkout + generación factura PDF
- [ ] Límites anti-fraude new users (settings + admin FraudRules lib)
- [ ] Honeypot fields en forms
- [ ] PagerDuty + on-call rotation
- [ ] DR plan + backup restore test
- [ ] Trimestrely LOPD/security audit setup
- [ ] **Test:** Status page muestra uptime. DR test staging successful.

---

## Total: 24 semanas calendario (~6 meses) a 1 dev senior

Para ejecutar a ritmo más rápido:
- 2 devs paralelos: ~14 semanas
- 3 devs paralelos: ~10 semanas (con cuidado entre dependencias)

---

## Tracking semanal

Usar este archivo como living document:
- Sprint planning meeting al inicio de cada semana
- Daily standup con bloqueo del item en progreso
- Sprint review + retrospectiva al final de cada semana
- Marca `[x]` al cerrar cada item
- Haz commit de este archivo cada viernes
