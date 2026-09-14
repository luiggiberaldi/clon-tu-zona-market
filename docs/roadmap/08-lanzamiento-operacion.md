# Fase 8 — Lanzamiento y Operación

> **Duración estimada:** Semanas 15-18 (8 dev-days)
> **Dependencias:** Fases 1-7 completadas
> **Objetivo:** Preparar el lanzamiento al público, configurar instrumentación de crecimiento y dejar operativos los runbooks, status page y procesos de soporte. Sin esto, el primer incidente sería caótico.

---

## Definition of Done

- [ ] Runbook completo para incidentes básicos (DB caída, Stripe webhook no procesa, driver offline)
- [ ] Status page pública con uptime histórico
- [ ] Documentación legal completa (Términos, Privacidad, Cookies, Devoluciones)
- [ ] Datos fiscales en checkout (RIF/J/V opcional) en factura
- [ ] Límites anti-fraude activos (nuevo usuario $50 máx, 3 comprobantes/hora)
- [ ] Honeypot fields en todos los forms
- [ ] Cloudflare Turnstile activo en login/registro/checkout
- [ ] Vercel Analytics + PostHog instrumentados con funnels
- [ ] Heatmaps con Microsoft Clarity o Hotjar
- [ ] A/B testing infra (PostHog experiments)
- [ ] Affiliate / referral program (opcional)
- [ ] Channel de soporte customer (chat o WhatsApp Business)
- [ ] On-call rotation + PagerDuty
- [ ] Backup automático + DR plan documentado
- [ ] LOPD check trimestral

---

## 8.1 Pre-Lanzamiento (3 dev-days)

### 8.1.1 Security review final
- Penetration testing con OWASP ZAP automatizado en CI:
  ```bash
  docker run -t owasp/zap2docker-stable zap-baseline.py -t https://staging.tuzonamarket.com
  ```
- Security headers verificados en securityheaders.com (A+ rating).
- Dependency audit:
  ```bash
  npm audit --omit=dev
  npm audit fix --force  # solo deps seguras
  ```
- Verificar https en dominio con HSTS preload list:
  - https://hstspreload.org/
- Stripe production mode setup (cuentas bancarias conectadas).

### 8.1.2 Operations runbook
Documentos en `docs/runbook/` con scripts y pasos para incidentes comunes:
- `01-db-outage.md` — qué hacer si Supabase no responde.
- `02-stripe-webhook-backlog.md` — cómo purgar webhook events pendientes.
- `03-driver-mass-offline.md` — fallback si GPS drivers se pierden masivamente.
- `04-fraud-spike.md` — qué hacer si hay aumento de transacciones sospechosas.
- `05-payment-reconciliation-error.md` — investigar discrepancias en reporte diario.
- `06-pwa-cache-poison.md` — cómo invalidar workbox cache para todos.
- `07-backup-restore.md` — cómo restaurar desde PITR.
- `08-staging-promotion.md` — checklist de MVP de staging a production.

### 8.1.3 Status page
- Usar **BetterStack** (free tier) o **UptimeRobot status page**:
  - URL pública: `status.tuzonamarket.com` (subdomain CNAME).
  - Monitores: website home, /api/productos, /api/zonas, Supabase healthcheck.
  - Subscribers vía email + RSS.
- Integración con Vercel deploy webhooks: cuando deployment de prod falla, marca incidente automáticamente.

### 8.1.4 Datos fiscales en checkout
- Campo opcional "Datos fiscales" en checkout:
  - Tipo: J (Jurídica), V (Persona natural), G (Gubernamental).
  - RIF: regex `\b[JVGVE]-?\d{8,9}\b`.
  - Razón social.
  - Email para recibir factura.
- Generación de factura PDF al pagar con datos fiscales (si emite factura electrónica).
- Reportes de IVA mensuales (si aplica).

### 8.1.5 Límites anti-fraude por usuario
- Settings en tabla `settings`:
  - `new_user_max_order_usd: 50.00` — límite primera compra.
  - `new_user_max_comprobantes_per_hour: 3` — máximo comprobantes PagoMóvil por hora.
  - `zone_default_allow_cod_min_order: 0`.
- En `POST /api/ordenes`:
  - Si `orders.count(userId) === 0` y `cart_total > new_user_max_order_usd` → rechazar.
  - Si `payment_confirmations.count` para user en última hora > max → revisión manual.
- En `lib/utils/fraud-rules.ts`:
  - Blacklist de IPs persistentes (después de N fraud).
  - Honeypot field "company_name2" en checkout form; si contiene data → spam bot.
  - Behavioral: nuevo usuario con tarjeta nueva comprando producto caro inusual → requiere verificación.

### 8.1.6 Honeypot fields
- En formularios login/registro/checkout/reset, añadir input oculto con `aria-hidden`, `tabindex=-1`:
  ```html
  <input type="text" name="company_name2" tabindex="-1" autocomplete="off" aria-hidden="true" />
  ```
- En submit server-side, si ese campo no está vacío → retornar success (honeypot triggered, no molestar al bot) pero no procesar.

### Archivos a crear/modificar
```
docs/runbook/                                            [carpeta nueva]
  01-db-outage.md                                         [nuevo]
  02-stripe-webhook-backlog.md                            [nuevo]
  03-driver-mass-offline.md                              [nuevo]
  04-fraud-spike.md                                       [nuevo]
  05-payment-reconciliation-error.md                     [nuevo]
  06-pwa-cache-poison.md                                  [nuevo]
  07-backup-restore.md                                    [nuevo]
  08-staging-promotion.md                                 [nuevo]
app/(customer)/checkout/page.tsx                         [modificar — datos fiscales]
components/checkout/FiscalDataField.tsx                   [nuevo]
lib/utils/fraud-rules.ts                                 [nuevo]
scripts/penetration-test.sh                               [nuevo]
supabase/migrations/00060_fraud_limits_settings.sql       [nuevo]
```

### Criterios de aceptación
- Runbook completo cubre los 8 escenarios más comunes.
- Status page muestra uptime histórico y permite subscribirse.
- Security headers rating A+.
- Penetration test automated no encuentra vulnerabilidades críticas.

---

## 8.2 Crecimiento e Instrumentación (3 dev-days)

### 8.2.1 Vercel Analytics + Speed Insights
- Ya configurado en Fase 1; verificar captura de Web Vitals reales.

### 8.2.2 PostHog (analytics avanzado)
- Crear proyecto en PostHog Cloud (self-host opcional).
- Instalar:
  ```bash
  npm i posthog-js posthog-node
  ```
- Provider en `app/providers.tsx`:
  ```tsx
  'use client';
  import posthog from 'posthog-js';
  import { PostHogProvider } from 'posthog-js/react';
  if (typeof window !== 'undefined') {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, { api_host: 'https://app.posthog.com', capture_pageviews: true });
  }
  export function Providers({ children }) {
    return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
  }
  ```
- Event tracking:
  - `product_viewed` con `{ product_id, slug, category, price }`.
  - `add_to_cart` con `{ product_id, qty, source: 'home' | 'category' | 'search' }`.
  - `checkout_started` con `{ cart_value, items_count }`.
  - `order_completed` con `{ order_id, total, payment_method, first_purchase }`.
  - `search_performed` con `{ query, results_count }`.
- Funnels:
  - Browse (visit home/category) → Product view → Add to cart → Checkout → Paid.

### 8.2.3 Microsoft Clarity (heatmaps + recordings gratis)
- Script tag en `app/layout.tsx`:
  ```html
  <script dangerouslySetInnerHTML={{ __html: `
    (function(c,l,a,r,i,t,y){
      c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
      t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
      y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window,document,"clarity","script","<your-id>");
  `}} />
  ```
- Recordings automáticos para investigar drop-off en checkout.

### 8.2.4 A/B testing con PostHog
- Componente `<Experiment name="..." />`:
  ```tsx
  import { useExperiment } from 'posthog-js/react';
  export function HeroBanner() {
    const { variant } = useExperiment('hero-banner-cta-button-text');
    const buttonText = variant === 'test' ? 'Pide ya' : 'Comprar ahora';
    return <Button>{buttonText}</Button>;
  }
  ```
- Experiments:
  - CTA text home ("Comprar" vs "Pide ya").
  - Pago method default.
  - Recovery email copy.

### 8.2.5 Referral program (opcional)
- Tabla `referrals`:
  ```sql
  CREATE TABLE referrals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id uuid REFERENCES users(id),
    referee_id uuid REFERENCES users(id),
    code text NOT NULL UNIQUE,
    program_type text DEFAULT 'signup_coupon',
    status text DEFAULT 'pending' CHECK (status IN ('pending','completed','rejected')),
    reward_amount numeric(10,2) DEFAULT 5.00,
    created_at timestamptz DEFAULT now()
  );
  ```
- Cada usuario tiene un código referido único (auto-generado).
- En registro: campo "¿Quién te recommending?" con código.
- Post first-purchase delivered:
  - Referrer recibe cupón $5 para próxima compra.
  - Referee recibe cupón $5 (welcome bonus).

### Archivos a crear/modificar
```
app/providers.tsx                                       [modificar — PostHogProvider]
app/layout.tsx                                          [modificar — Clarity script]
lib/analytics/posthog-events.ts                         [nuevo]
lib/analytics/clarity-setup.ts                          [nuevo opcional]
components/Experiment.tsx                                [nuevo]
supabase/migrations/00061_referrals.sql                 [nuevo opcional]
app/api/referrals/validate/route.ts                     [nuevo opcional]
components/ReferralWidget.tsx                            [nuevo opcional]
.env.example                                            [modificar — POSTHOG_*]
```

### Criterios de aceptación
- PostHog captura automáticamente pageviews.
- Funnels definidos (browse→view→cart→checkout→paid) muestran conversión real.
- Heatmaps en /productos, /checkout muestran movimiento del mouse.

---

## 8.3 Operación (2 dev-days)

### 8.3.1 On-call rotation
- **PagerDuty** o **BetterStack incident response**:
  - Rotación semanal entre 2-3 desarrolladores.
  - Schedule: 24/7 durante primeros 3 meses; después business hours solo.
- Integración con:
  - Sentry error rate >3% → PagerDuty incident.
  - UptimeRobot alert → PagerDuty.
  - Vercel build fail prod → PagerDuty.

### 8.3.2 Customer support channels
- **WhatsApp Business** (número dedicado para soporte):
  - Auto-responder con quick replies ("¿Cuál es el estado de mi orden?", "Soportemos por email").
  - Mensajes fuera de horario laboral → estado "Te responderemos en horario hábil".
- **Chat en vivo**:
  - Microsoft Clarity chat (free) o Crisp/Tawk.to:
    - Online business hours.
    - Offline → captura email y WhatsApp.
- **Centro de ayuda** (FAQ):
  - Página `app/(public)/ayuda/page.tsx` con búsqueda.
  - Artículos: "¿Cómo pago con PagoMóvil?", "Tiempo de entrega", "Cambios y devoluciones", "Zonas de cobertura".
  - Metadata con artículo ID para usar en respuestas automáticas de WhatsApp.

### 8.3.3 Backup automático
- Supabase PITR (Point-In-Time Recovery) en plan Team:
  - Retención 30 días, restauración a cualquier segundo.
- Mensual dump exports a R2:
  - Cron GitHub Action primer día del mes:
    ```yaml
    - run: pg_dump $DATABASE_URL | gzip > backup-$(date +%Y%m%d).sql.gz
    - run: aws s3 cp backup-*.sql.gz s3://tuzonamarket-backups/
    ```
- Test de restauración trimestral: en un Supabase branch, restaurar backup, verificar schema y data completos.

### 8.3.4 DR plan
Documento `docs/operations/dr-plan.md`:
- **Objetivo de Recuperación (RPO)**: 5 min (entre backups PITR).
- **Tiempo de Recuperación (RTO)**: 2h.
- Pasos:
  1. Detectar (Sentry / PagerDuty).
  2. Comunicar (status page + Twitter + WhatsApp).
  3. Rollback (Vercel rollback a release anterior).
  4. Si DB problem → restore from PITR.
  5. Post-mortem en GitHub Discussions.

### Archivos a crear/modificar
```
docs/operations/dr-plan.md                              [nuevo]
docs/operations/on-call.md                               [nuevo]
app/(public)/ayuda/page.tsx                             [nuevo]
components/support/HelpCenter.tsx                        [nuevo]
components/support/WhatsAppWidget.tsx                    [nuevo opcional]
.github/workflows/backup-monthly.yml                     [nuevo]
```

### Criterios de aceptación
- PagerDuty rotación configurada y testada con mock incident.
- WhatsApp soporte responde en horario hábil.
- Mes 1: backup restore test exitoso desde R2.

---

## 8.4 Compliance Continuo (2 dev-days)

### 8.4.1 Trimestrely LOPD check
Script quarterly de Listado de Items:
- [ ] Política de privacidad actualizada (última fecha revisada <3 meses).
- [ ] Banner cookies respeta preferencias.
- [ ] Endpoint `/api/me/delete` funciona correctamente (en 30 días elimina data).
- [ ] Registro de tratamientos (Log de quienes acceden a datos personas).
- [ ] Backups cifrados en R2.

### 8.4.2 Security headers audit quarterly
- securityheaders.com rating A+.
- sslabs.com rating A+.
- CSP sin violaciones en report-uri.
- HSTS preload list verificado.

### 8.4.3 Penetration testing anual
- Auto OWASP ZAP primer día de cada mes + manual anual:
  - External pentester para SW producto.
- Bug bounty program (HackerOne private) desde mes 6.

### 8.4.4 Backup verification
- Cada 3 meses: simulacro DR.
- Restaurar backup PITR en cuenta Supabase branch → verificar modelo y data.

### Archivos a crear/modificar
```
docs/compliance/
  lopd-checklist-trimestral.md                           [nuevo]
  security-audit-quarterly.md                            [nuevo]
  penetration-testing-protocol.md                        [nuevo]
  dr-test-procedure.md                                    [nuevo]
scripts/
  penetration-test.sh                                    [nuevo]
  backup-restore-test.sh                                 [nuevo]
```

### Criterios de aceptación
- Primer DR drill completado en staging sin downtime cliente.
- securityheaders.com siempre A+ (automated monthly check).
- Audit LOPD pasa sin observaciones.

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Fraude masivo en primer mes (Venezuela es high-fraud) | Alta | Alto | Límites new users + manual review + blacklists IP |
| PostHog overload en días peak | Media | Bajo | Sampling en eventos no críticos |
| Backup monthly falla y no detectamos por meses | Baja | Alto | Alert por GitHub Actions si backup job falla + retry |
| Status page vs realidad desincronizado | Media | Medio | Webhook Vercel → status page API |
| Soporte de WhatsApp saturado | Alta | Medio | Quick replies + bot + centro de ayuda self-service |
| Stripe account suspendida por fraud chargeback | Baja | Crítico | Radar rules + communication proactiva con Stripe support |

---

## Siguiente pasos post v1.0

Una vez lanzado v1.0 production:
- VIGILAR (Sentry, uptime, funnels) por 30 días.
- Iterar basado en feedback y analytics.
- Fase 9 (post-launch): features de marketplace, multi-vendor, multi-moneda, etc.

---

## Resumen final

Con las 8 fases completadas (~18 semanas, 120 dev-days), TuZonaMarket pasa a ser una plataforma production-grade completa para el mercado venezolano:
- Multi-zona con coverage geográfica real.
- Inventario por bodega con control de stock.
- Pagos hibridos Venezuela (PagoMóvil + Zelle + Stripe + COD) con OCR.
- Logística inteligente con tracking en tiempo real.
- Notificaciones multi-canal (email + WhatsApp + push).
- Admin panel profesional con KPIs y reportes.
- PWA completa con offline.
- Observabilidad y seguridad production-ready.
