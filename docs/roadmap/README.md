# TuZonaMarket — Roadmap a Producción v1.0

Roadmap completo y profesional para llevar el MVP actual de TuZonaMarket (mercado online multi-zona para Venezuela) a una plataforma production-grade.

## Documentos

### Visión y arquitectura
- [00-overview.md](./00-overview.md) — Estado del MVP, arquitectura target, stack, servicios externos, decisiones de diseño.

### Fases de implementación (en orden)
- [01-fundaciones.md](./01-fundaciones.md) — Migraciones, Auth hardening, Seguridad, Observabilidad, Testing, CI/CD. *(Semanas 1-3, 15 dev-days)*
- [02-ecommerce-core.md](./02-ecommerce-core.md) — Inventario multi-zona, Búsqueda, Productos avanzados, Cupones, Fidelidad. *(Semanas 4-7, 20 dev-days)*
- [03-pagos-venezuela.md](./03-pagos-venezuela.md) — PagoMóvil con OCR, Transferencia, Zelle, Efectivo COD, Stripe hardening, Reconciliación. *(Semanas 6-8, 12 dev-days)*
- [04-logistica-delivery.md](./04-logistica-delivery.md) — Cobertura PostGIS, Asignación automática, Tracking Realtime, Horarios con capacidad, Geolocalización. *(Semanas 7-10, 18 dev-days)*
- [05-ux-premium.md](./05-ux-premium.md) — Personalización, Notificaciones multi-canal, Cuenta cliente, Móvil absoluto, Accessibility WCAG AA. *(Semanas 9-12, 15 dev-days)*
- [06-admin-pro.md](./06-admin-pro.md) — Dashboard KPIs, Productos avanzados admin, Pedidos Kanban, CRM, Reportes, Tickets. *(Semanas 11-14, 20 dev-days)*
- [07-infra-performance.md](./07-infra-performance.md) — Web Vitals, DB optimization, Caching Redis, SEO, PWA Pro. *(Semanas 13-16, 12 dev-days)*
- [08-lanzamiento-operacion.md](./08-lanzamiento-operacion.md) — Pre-launch security, Runbooks, Status page, Crecimiento, Operación, Compliance. *(Semanas 15-18, 8 dev-days)*

### Complementos
- [09-estimaciones-costos.md](./09-estimaciones-costos.md) — Dev-days por fase, costos cloud mensuales, TCO 12 meses, ROI.
- [10-priorizacion-top10.md](./10-priorizacion-top10.md) — Top 10 imprescindible para producción mínima viable (~8 semanas).
- [11-backlog-tecnico.md](./11-backlog-tecnico.md) — Checklist semana a semana con dependencias y criterios de aceptación.

## Cómo usar este roadmap

1. **Primer paso:** lee `00-overview.md` para tener el contexto global.
2. **Si tienes presupuesto completo:** ejecuta las 8 fases en orden, 18 semanas calendario con 1 dev senior.
3. **Si quieres producción mínima viable:** lee `10-priorizacion-top10.md` y haz solo el Top 10 (34 dev-days, ~8 semanas).
4. **Para tracking diario:** usa `11-backlog-tecnico.md` como checklist; marca items `[x]` al completarlos.

## Métricas globales del roadmap

| Métrica | Valor |
|---|---|
| Fases | 8 |
| Dev-days total | 120 |
| Semanas calendario (1 dev) | 24 (~6 meses) |
| Semanas calendario (3 devs paralelo) | ~10 |
| Costo cloud base mensual | ~$220–$500 |
| TCO 12 meses (incluyendo dev) | ~$105k USD |
| Headers de seguridad target | A+ en securityheaders.com |
| Lighthouse target | >=95 en Performance/SEO/Best Practices |
| WCAG | 2.1 AA |

## Próximo paso sugerido

Iniciar la **Fase 1 — Fundaciones de Producción** ([01-fundaciones.md](./01-fundaciones.md)).

Si quieres ir directo a lo mínimo para producción, ejecuta el **Top 10** — ver [10-priorizacion-top10.md](./10-priorizacion-top10.md).

---

## Mantenimiento de este documento

- Este roadmap es un living document. Marca `✅` en items completados.
- Tras cerrar cada semana, commitea este repo con los items `[x]` actualizados.
- Si una tarea no aplica o se descarta, marca `[~]` y agrega una nota explicativa.
- Si surge una nueva necesidad, añádela al backlog correspondiente.
