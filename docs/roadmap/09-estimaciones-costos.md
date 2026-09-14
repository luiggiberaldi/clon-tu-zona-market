# 9 — Estimaciones de Esfuerzo y Costos

> Estimaciones detalladas para planificación financiera y de equipo. Cifras basadas en developer senior dev en LATAM USD y precios cloud al cierre de 2024.

---

## 9.1 Esfuerzo por fase (dev-days)

| Fase | Componente | Dev-days | Notas |
|---|---|---|---|
| **1. Fundaciones** | Database & Migraciones | 3 | Supabase CLI, schema expandido, funciones SQL |
| | Auth Hardening | 3 | MFA, rate limiting, sessions, audit |
| | Seguridad & Cumplimiento | 2 | Headers, Turnstile, CSRF, LOPD |
| | Observabilidad | 2 | Sentry, pino, Vercel Analytics |
| | Testing Strategy | 3 | Unit, integration, E2E Pytest + k6 |
| | CI/CD | 2 | GitHub Actions, branch protection, previews |
| | **Subtotal Fase 1** | **15** | |
| **2. E-Commerce Core** | Inventario multi-zona/bodega | 5 | inventory_items, reservas, alertas |
| | Búsqueda avanzada | 3 | Meilisearch o PG FTS + autocomplete |
| | Productos avanzados | 4 | Variantes, bundles, reviews, wishlist |
| | Cupones y promociones | 4 | Validation, apply, admin CRUD |
| | Programa de fidelidad | 4 | Puntos, tiers, canje, expiración |
| | **Subtotal Fase 2** | **20** | |
| **3. Pagos Venezuela** | PagoMóvil + OCR | 4 | Upload, OCR, match auto, review admin |
| | Transferencia | 1 | Reutiliza flujo PagoMóvil |
| | Zelle | 1 | USD, instrucciones claras |
| | Efectivo COD | 2 | Límites por zona, driver app |
| | Stripe hardening | 2 | 3DS, SetupIntent, idempotencia webhooks |
| | Reconciliación | 1 | Function SQL, cron, reporte |
| | Stripe Connect (opc) | 2 | Marketplace multi-vendor |
| | **Subtotal Fase 3** | **12** (sin Connect 10) | |
| **4. Logística** | Cobertura PostGIS | 4 | PostGIS, Nominatim, validations, waitlist |
| | Asignación automática | 5 | Algoritmos, OR-Tools, driver app |
| | Tracking Realtime | 4 | Realtime Supabase, mapas Leaflet |
| | Horarios con capacidad | 3 | Slot table, reservas, Realtime |
| | Geolocalización avanzada | 2 | Adaptive interval, heatmap, health-check |
| | **Subtotal Fase 4** | **18** | |
| **5. UX Premium** | Personalización | 3 | Recommendations, recently viewed |
| | Notificaciones multi-canal | 5 | Resend, WhatsApp, FCM, centro |
| | Cuenta cliente | 3 | Direcciones múltiples, tarjetas, re-order |
| | Móvil absoluto | 3 | PWA completo, bottom sheets, gestures |
| | Accessibility WCAG AA | 2 | axe-core, fixes, screen reader testing |
| | **Subtotal Fase 5** | **15** (2 para perf UX incl) | |
| **6. Admin Pro** | Dashboard KPIs | 4 | Recharts, Realtime, comparativo YoY |
| | Productos avanzados admin | 5 | Bulk, drag images, WYSIWYG, categories tree |
| | Pedidos workflow Kanban | 4 | drag-drop, bulk actions, refunds, PDFs |
| | CRM clientes | 3 | Bulk actions, perfil 360°, segmentos |
| | Reportes y exports | 2 | Builder, scheduled reports |
| | Soporte tickets (opc) | 2 | Tickets CRUD + inbox |
| | **Subtotal Fase 6** | **20** (sin tickets 18) | |
| **7. Infra & Performance** | Web Vitals | 3 | LCP/INP/CLS, edge runtime, bundle budget |
| | DB optimization | 3 | Pooler, indexes, partitioning, replicas |
| | Caching Strategy | 3 | ISR + Redis + tag invalidation |
| | SEO | 2 | Metadata, sitemap, JSON-LD |
| | PWA Pro | 1 | Workbox runtime, shortcuts |
| | Performance Budget CI | 1 | Lighthouse CI |
| | **Subtotal Fase 7** | **12** | |
| **8. Lanzamiento** | Pre-launch security | 1 | OWASP ZAP, audit dependency |
| | Runbook + status page | 1 | Documentación, BetterStack |
| | Datos fiscales + anti-fraude | 1 | RIF/J/V, límites, honeypots |
| | Instrumentación crecimiento | 2 | PostHog, Clarity, A/B testing |
| | Operación (on-call, support) | 1.5 | PagerDuty, WhatsApp, DR plan |
| | Compliance continuo | 1 | Quarterly audits setup |
| | **Subtotal Fase 8** | **8** | |
| **TOTAL** | | **120 dev-days** (~6 meses a 1 dev senior) |

### Distribución temporal sugerida

| Setup | Tiempo total | Número de dev seniors paralelos | Calendar aprox |
|---|---|---|---|
| Equipo 1 dev (escenario conservador) | 120 dev-days / 5 d/sem = 24 semanas | 1 | ~6 meses calendario |
| Equipo 2 devs (escenario recomendado) | ~60 días = 12 semanas paralelizables | 2 (paralelos en Fases 2-3, 4-5, 6-7) | ~3 meses calendario |
| Equipo 3 devs (escenario agresivo) | ~40 días = 8 semanas | 3 (Fases 4-5-6 en paralelo tras Fase 1) | ~2 meses calendario |

> **Nota:** el calendario real siempre es mayor por overhead de comunicación, code review, dependencias no anticipadas y QA.

### Distribución por rol en equipo de 3 personas

| Fase | Backend dev | Frontend dev | DevOps/QA |
|---|---|---|---|
| 1. Fundaciones | 8 d | 0 d | 7 d (CI/CD + testing) |
| 2. E-Commerce Core | 10 d | 10 d | 0 d (tests ya cubren) |
| 3. Pagos Venezuela | 8 d | 4 d | 0 d |
| 4. Logística | 10 d | 8 d | 0 d |
| 5. UX Premium | 4 d | 11 d | 0 d |
| 6. Admin Pro | 6 d | 14 d | 0 d |
| 7. Infra Perf | 4 d | 2 d | 6 d |
| 8. Lanzamiento | 1 d | 1 d | 6 d |
| **Total** | **51 d** | **50 d** | **19 d** |

---

## 9.2 Costos Cloud por servício (mensuales)

| Servicio | Plan | Costo/mes | Comentario |
|---|---|---|---|
| **Vercel** | Pro | $20 | Edge network, preview deploys, analytics |
| **Supabase** | Team | $25 | Incluye PITR, Pooler, branches, Realtime 2.0 |
| **Upstash Redis** | Pay-as-you-go | $10 | 10k commands/día free tier cubre lo necesario |
| **Resend** | Pro | $20 | 50k emails/mes incluidos |
| **Meilisearch Cloud** | Starter | $30 | Hasta 50k documents, 1M searches/mes |
| **PostHog Cloud** | Free → Growth | $0–$80 | Free hasta 1M events/mes; growth escala |
| **Sentry** | Team | $26 | 50k errors/mes, performance, replay |
| **PagerDuty** | Small Team | $21/mes por user (×3 devs) | $63 |
| **BetterStack** | Status Page + Monitoring | $15 | Status page pública, logs, APM |
| **Cloudflare Turnstile** | Free | $0 | CAPTCHA sin tracking |
| **Microsoft Clarity** | Free | $0 | Heatmaps y recordings gratis |
| **Stripe** | Variable | 2.9% + $0.30 USD por tx | Tarjetas internacionales |
| **WhatsApp 360dialog** | Pro | $50 + $0.005/msg | Conversational notification costs |
| **LogDNA/Axiom** | Free → Pro | $25 (pro) | Logs estructurados search |
| **GitHub Actions** | Free → Team | $0 (free tier) | Almacén privado + CI minutes |
| **Namecheap/Cloudflare DNS** | Domain | $10/año = $1/mes | Dominio tuzonamarket.com |
| **AWS R2** (backups) | Storage | $5 | S3-compat, 1TB incluido |

### Subtotal base mensual
- **Mínimo production (Sin scaling):** ~$220/mes
- **Recomendado (con growth analytics, on-call):** ~$300/mes
- **Escalado (50k users activos):** ~$500/mes + variables

### Variables que escalan con tráfico:
- WhatsApp: ~$0.005/mensaje → en peak 10k msgs/día = $1500/mes (limit if needed)
- Stripe: 2.9% + $0.30 per transaction → si vendes $10k/mes, ~$320 comisiones.
- Vercel: si excede 1TB bandwidth, +$40/TB.
- Supabase: si supera 8GB DB or 250GB bandwidth, se escala a $25 adicionales por tramo.

---

## 9.3 Costos de terceros one-time

| Servício | Costo one-time | Comentario |
|---|---|---|
| Onboarding Stripe Connect (si marketplace) | $0 | Pero KYC verifications por vendor: ~$2/vendor |
| Google Maps API Places (si NO Nominatim) | $17/1000 requests | Mejor opción privada; alternativas gratis |
| Google Vision API para OCR (si NO Tesseract) | $1.50/1000 images | Mayor precisión, pagado por uso |
| External penetration testing (anual) | $3000–$5000 | Pentester profesional LATAM |
| Traducción al portugués (si multi-idioma) | $1000 | Frontera Brasil futura |
| D-U-N-S / RIF empresa | $0 | Trámite gratuito en Venezuela |
| SSL wildcard Cloudflare | $0 | Incluido con Vercel y Cloudflare |
| Logo + Branding profesional | $500–$1500 | Opcional, si necesitas desigual branding |
| Setup domain + DNS + email profesional | $50 | Configuración Google Workspace $6/usuario/mes |

### Total setup uno-off: ~$1000–$5500 (depende de scope)

---

## 9.4 TCO Total para 12 meses

| Concepto | Costo |
|---|---|
| Desarrollo (1 dev senior LATAM × 6 meses) | $96,000 USD (dev senior USD80/hr × 240 días útiles) |
| Equipo 3 devs senior × 2 meses | $96,000 USD (paralelo, misma costo total pero más rápido) |
| Cloud + servicios 12 meses | $3,600 USD (~$300/mes × 12) |
| Penetration testing anual | $4,000 USD |
| Miscelaneo (bookings, accounting, hosting extras) | $2,000 USD |

### TCO estimado v1.0 (12 meses)
- **1 dev solo:** ~$105,600 USD
- **3 devs equipo:** ~$105,600 USD (mismo total, más rápido)
- Recomendación: equipo de 2-3 hace más sentido por velocidad + reviewing peers.

### Costos adicionales post-v1.0 (12 meses)
- Staff técnico part-time para operación: $1500/mes = $18,000/año.
- Marketing / Customer success: external, $1000/mes = $12,000/año.
- Mejoras continuas mensuales: dev part-time $4000/mes = $48,000/año.

---

## 9.5 ROI / Breakeven fallback

Asumiendo:
- Product Gross Margin promedio: 25% (típico retail alimentos con compras eficientes).
- Comisiones Stripe (2.9% + $0.30) principalmente para cantidades pequeñas.
- Costo de delivery variable según zona (envío ~$2 USD).

**Escenario conservador:**
- GMV (Gross Merchandise Value) objetivo mes 6: $20,000 USD.
- Revenue plataforma (.margin + delivery fee): $5,000 + $3,000 = $8,000.
- Costos cloud mes: $300.
- Costos operativos mes (logística, producto): $4000.
- Margen contribution: $8,000 - $300 - $4000 = $3,700/mes.

**Breakeven** se alcanza alrededor del mes 10-12 si MARCA y MVP tienen tracción inicial.

> Disclaimer: estas son estimaciones basadas en benchmarks y requieren validación con datos reales de Venezuela (tamaño mercado, поведением consumer, etc.).
