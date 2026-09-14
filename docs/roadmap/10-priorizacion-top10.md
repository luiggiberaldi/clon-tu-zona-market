# 10 — Top 10: Producción Mínima Viable

> Si tienes presupuesto/tiempo limitado, este es el Top 10 imprescindible para producción real. Aproximadamente 40 dev-days (~8 semanas con 1 dev), y convierte el MVP en una plataforma usable con menores riesgos.

---

## 10.1 Criterios de selección

Elegimos estos 10 basándonos en:
1. **Riesgo legal/financiero** — sin estos, primer incidente = desastre.
2. **Diferenciador mercado Venezolano** — sin esto, no vendes.
3. **Operación diaria viable** — sin esto, pierdes 80% del tiempo en soporte.

---

## Top 10 Items

### #1 — Auth Hardening + MFA para admin/driver
**Por qué:** Una cuenta admin comprometida = robos de data, fraude masivo. Venezuela es high-fraud.

**Qué hacer (mínimo):**
- MFA TOTP obligatorio para `admin`, `super_admin` y `driver`.
- Rate limiting 5 intentos/15min en login.
- Email verification obligatoria.
- Sessions revocables.
- Audit log de auth (login, logout, password reset).

**Dev-days:** 3
**Fase:** 1.2
**Costo cloud:** $0 (librerias open source)

---

### #2 — Rate Limiting + Cloudflare Turnstile
**Por qué:** Sin esto, bots venezolanos comproban credenciales 24/7. Stripe fraud detection no es suficiente.

**Qué hacer (mínimo):**
- `@upstash/ratelimit` aplicado a todos los endpoints:
  - Auth: 5/min por IP.
  - API pública: 100/min.
  - Pagos: 10/min.
  - Admin: 60/min.
- Turnstile en `/login`, `/registro`, `/checkout/pago`.
- Honeypot fields en formularios.

**Dev-days:** 2
**Fase:** 1.3
**Costo cloud:** Upstash $10/mes, Turnstile $0.

---

### #3 — PagoMóvil con OCR + revisión manual
**Por qué:** 70%+ de venezolanos usan PagoMóvil. Sin esto, no vendes. Tarjetas internacionales son para diáspora.

**Qué hacer (mínimo):**
- Cliente sube foto comprobante (Supabase Storage).
- OCR con Tesseract.js (gratis) extrae: banco, monto, referencia, fecha.
- Match score automático vs datos esperados.
- Score >=80 → auto-confirm; score <80 → admin review queue.
- Detección de comprobantes duplicados con pHash.
- Panel admin para aprobar/rechazar.

**Dev-days:** 4
**Fase:** 3.1
**Costo cloud:** Supabase Storage ~$5/mes (storage 5GB incluido).

---

### #4 — Stock por zona + reservas en checkout
**Por qué:** Prometer stock que no hay → cliente molesto → 70% no vuelve. TuZonaMarket es multi-zona.

**Qué hacer (mínimo):**
- Tabla `inventory_items` (product × zone × warehouse).
- Cart bloquea añadir si no hay stock en la zona del usuario.
- Reserva con TTL 15 min durante checkout.
- Decremento transaccional al confirmar pago.
- `stock_movements` para auditar.

**Dev-days:** 5
**Fase:** 2.1
**Costo cloud:** $0 (Postgres existente).

---

### #5 — Inventario + alertas de stock bajo
**Por qué:** No quedarte sin """. Si quedas sin leche un lunes, pierdes $500 en ventas esposa.

**Qué hacer (mínimo):**
- `inventory_items.low_stock_threshold` configurable por producto-zona.
- Trigger SQL cuando `quantity <= threshold` → insert `notifications` para admins.
- Widget en admin dashboard "Productos con stock bajo".
- Ajustes manuales + transferencias entre bodegas.

**Dev-days:** 3
**Fase:** 2.1
**Costo cloud:** $0.

---

### #6 — Notificaciones transaccionales email + WhatsApp
**Por qué:** "¿Dónde está mi orden?" es el #1 ticket de soporte. Notificaciones proactivas reducen 80%.

**Qué hacer (mínimo):**
- Resend + React Email templates:
  - Confirmación orden, estado actualizado, password reset.
- WhatsApp Business (Meta Cloud API):
  - Confirma pago, en camino, entregado.
- Centro de notificaciones in-app con badge Realtime.

**Dev-days:** 5
**Fase:** 5.2
**Costo cloud:** Resend $20/mes, WhatsApp $50 + $0.005/msg.

---

### #7 — Tracking en tiempo real básico
**Por qué:** Reducir MPS anxious customers. Con mapa, convierto "¿dónde está?" en satisfacción.

**Qué hacer (mínimo):**
- Tabla `driver_locations` con Realtime Supabase publicando.
- Driver app envía ubicación cada 30s (Geolocation API del browser).
- Cliente ve mapa Leaflet con marcador del driver + ETA (OSRM).
- Botones: "Llegué", "Entregado", "Cliente no estaba".

**Dev-days:** 4
**Fase:** 4.3
**Costo cloud:** $0 (Supabase Realtime incluido).
**Requisito previo:** Fase 1 (PostGIS opcional para este subset).

---

### #8 — Sentry + Logs estructurados
**Por qué:** Sin visibilidad, no puedes arreglar lo que no ves. Errores en producción sin Sentry = el cliente te reporta en email después de 3 días.

**Qué hacer (mínimo):**
- Sentry con source maps, performance monitoring.
- `pino` logs estructurados nivel info/error.
- Vercel Analytics Web Vitals.
- Alerta email si error rate >3% en 5 min.

**Dev-days:** 2
**Fase:** 1.4
**Costo cloud:** Sentry Team $26/mes.

---

### #9 — E2E Tests + CI/CD verde
**Por qué:** No romper producción en cada deploy. Manual testing no escala.

**Qué hacer (mínimo):**
- Playwright E2E: 5 specs cubriendo flujo crítico (browse → cart → checkout → paid).
- GitHub Actions: lint + typecheck + unit + e2e + build.
- Vercel preview deploys automático por PR.
- Branch protection `main` requiere 1 approval + checks verdes.

**Dev-days:** 3
**Fase:** 1.5 + 1.6
**Costo cloud:** GitHub Actions free tier, Vercel Pro $20/mes.

---

### #10 — SEO + Web Vitals
**Por qué:** Sin SEO no llegas a clientes online. Foto OSCAR: si no te búscan Google, existes solo por word-of-mouth.

**Qué hacer (mínimo):**
- Metadata API Next.js por cada página (title, description, OG, Twitter).
- `next/sitemap.ts` dinámico.
- `next/robots.ts`.
- JSON-LD ProductSchema en páginas de producto.
- `next/image` con `priority` en hero + sizes responsive.
- Self-host fonts con `next/font/local` para LCP hero.
- Lighthouse CI fail si LCP >2.5s.

**Dev-days:** 3
**Fase:** 7.4 + 7.1
**Costo cloud:** $0.

---

## 10.2 Resumen del Top 10

| # | Item | Dev-days | Fase |
|---|---|---|---|
| 1 | Auth + MFA + audit | 3 | 1.2 |
| 2 | Rate limit + Turnstile | 2 | 1.3 |
| 3 | PagoMóvil + OCR + admin review | 4 | 3.1 |
| 4 | Stock por zona + reservas | 5 | 2.1 |
| 5 | Inventario + alertas stock bajo | 3 | 2.1 |
| 6 | Email + WhatsApp transaccional | 5 | 5.2 |
| 7 | Tracking Realtime básico | 4 | 4.3 |
| 8 | Sentry + logs | 2 | 1.4 |
| 9 | Playwright + CI/CD | 3 | 1.5 + 1.6 |
| 10 | SEO + Web Vitals | 3 | 7.4 + 7.1 |
| | **Total Top 10** | **34 dev-days** | |

---

## 10.3 Plan de ejecución Top 10 (8 semanas)

| Semana | Items | Output |
|---|---|---|
| **Semana 1** | #1 Auth + MFA, #8 Sentry + logs | Admin con MFA, errores visibles |
| **Semana 2** | #2 Rate limiting + Turnstile | Anti-fraude básico |
| **Semana 3** | #9 CI/CD + Playwright setup + 5 specs | Branch protection + safe deploy |
| **Semana 4** | #4 Stock por zona (migración + cart logic) | Cart respeta stock |
| **Semana 5** | #4 Reservas checkout + #5 Alertas stock bajo | Checkout con TTL + alerts admin |
| **Semana 6** | #3 PagoMóvil OCR + admin review | Cupones venezolanos reales |
| **Semana 7** | #7 Tracking Realtime + #6 email/WhatsApp setup | Notificaciones proactivas y tracking |
| **Semana 8** | #6 Fine-tuning templates + #10 SEO + Web Vitals | Polish final + SEO launch ready |

---

## 10.4 Costo cloud Top 10 (mensual)

| Servicio | Costo/mes |
|---|---|
| Vercel Pro | $20 |
| Supabase Team | $25 |
| Upstash Redis | $10 |
| Sentry Team | $26 |
| Resend Pro | $20 |
| WhatsApp Business (Meta Cloud) | $50 + $0.005/msg |
| Cloudflare Turnstile | $0 |
| Microsoft Clarity | $0 |
| PostHog (free tier) | $0 |
| GitHub Actions (free) | $0 |
| **Subtotal** | **~$150/mes** + variables WhatsApp/Stripe |

---

## 10.5 ¿Qué no está en el Top 10 y por qué?

| Feature | Fase completa | Por qué postergar |
|---|---|---|
| Cupones avanzados | 2.4 | Markdown simple en MVP; komplejo rules post-launch |
| Programa fidelidad | 2.5 | Premium-first; añadir cuando LTV lo justifique |
| Bundles/variants | 2.3 | MVP funciona con productos simples |
| Cobertura polígonos PostGIS | 4.1 | En MVP, dropdown de ciudades/zonas Nationwide suficienta |
| Asignación automática rutas | 4.2 | Manualmente con 10-50 órdenes/día es viable |
| Reviews + fotos | 2.3.4 | Post-launch cuando hay volumen |
| Q&A | 2.3.6 | Post-launch |
| Comparador | 2.3.7 | Nice-to-have |
| PWA offline completo | 7.5 | MVP va por online siempre |
| Multi-vendor Stripe Connect | 3.6 | Prematuro sin proveedores |
| CRM admin con segmentos | 6.4 | CRM básico con tablas DB suficiente |
| Custom dashboards komplejos | 6.1 | Setup PostHog + raw SQL al inicio basta |
| Web Vitals perfectos | 7.1 | Top 10 cubre lo esencial |
| Heatmaps | 8.2.3 | Microsoft Clarity con banner de consent ya es bueno |
| A/B testing | 8.2.4 | Post-launch con suficiente tracción |

---

## 10.6 Riesgos críticos cubiertos por el Top 10

| Riesgo | Top 10 Item | Mitigación |
|---|---|---|
| Cuenta admin hackeada | #1 | MFA + audit |
| Bots prueban credenciales | #2 | Rate limit + Turnstile |
| Fraude PagoMóvil | #3 | OCR + admin review + pHash |
| Vendemos stock que no hay | #4 | Reservas + decremento transaccional |
| Quédamos sin producto clave | #5 | Alertas + dashboard |
| Customer ticket "¿dónde está?" | #6 + #7 | Notificaciones + tracking |
| Error en producción invisible | #8 | Sentry + logs |
| Deploy rompe producción | #9 | CI/CD + branch protection |
| Clientes no nos encuentran | #10 | SEO + Web Vitals |

---

## 10.7 Cómo usar este documento

- **Decisión ejecutiva:** APRUEBA el Top 10 para prioritizar. Fases 2-7 completas se pueden hacer post-launch del Top 10.
- **Plan incremental:** Tras 8 semanas (Top 10), lanzas v1.0-beta. Luego, iteras cada 2 semanas añadiendo features de fases completas según feedback/analytics.
- **Reserva de capacity:** Tras v1.0-beta, mantén 30% del dev time para bugs y observación en producción.
- **Costo:** ~$150/mes + $34 dev-days en infraestructura y desarrollo.

---

## Siguiente

[11-backlog-tecnico.md](./11-backlog-tecnico.md) — Checklist semana a semana.
