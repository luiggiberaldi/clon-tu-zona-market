# Fase 6 — Panel Admin Profesional

> **Duración estimada:** Semanas 11-14 (20 dev-days)
> **Dependencias:** Fase 1 (`get_admin_kpis`, audit_logs), Fase 2 (inventory, coupons, reviews), Fase 3 (payment_confirmations), Fase 4 (delivery_routes)
> **Objetivo:** Transformar las páginas admin estáticas del MVP en un panel de control profesional con dashboard de KPIs en tiempo real, gestión avanzada de productos y órdenes, CRM de clientes y reportes exportables.

---

## Definition of Done

- [ ] Dashboard con KPIs en tiempo real (ventas, pedidos, inventario, OTD, NPS)
- [ ] Gráficos interactivos con Recharts (ventas por día, comparativa YoY)
- [ ] Admin 商品 CRUD con bulk operations (CSV import, inline edit, drag-drop imágenes)
- [ ] WYSIWYG editor para descripciones
- [ ] Categorías jerárquicas con drag-and-drop (árbol)
- [ ] Pedidos Kanban con drag-and-drop entre estados
- [ ] Bulk actions: imprimir etiquetas, marcar enviadas, generar picking list
- [ ] Reembolsos parciales/totales con reason code
- [ ] Generación de PDFs (factura, picking list, etiquetas)
- [ ] CRM de clientes con perfil 360° y segmentación
- [ ] Reportes configurables por fecha/zona/categoría con export CSV/Excel/PDF
- [ ] Sistema de tickets de soporte (opcional)
- [ ] Multi-vendor panel (opcional, si Stripe Connect activo)

---

## 6.1 Dashboard de KPIs en Tiempo Real (4 dev-days)

### Tareas

#### 6.1.1 Widgets de métricas
- API `/api/admin/kpis` que llama `get_admin_kpis(p_date_from, p_date_to)` y agrega:
  - Total ventas USD/VES.
  - Pedidos count + comparativa con período anterior.
  - Ticket promedio.
  - Clientes nuevos.
  - OTD (On-Time Delivery) %.
  - NPS estimado via reviews estrellas.
- Componentes:
  - `<KpiCard />` (single metric con trend arrow vs período previo).
  - `<SalesChart />` (line chart con Recharts).
  - `<OrdersByStatusChart />` (donut chart).
  - `<TopProductsChart />` (horizontal bar).
  - `<CustomerGrowthChart />` (stacked area new vs returning).
- Realtime: suscripción a `orders` insert/update refresca widgets.

#### 6.1.2 Filtros de período
- Selector de rango predefinido (hoy, 7d, 30d, 90d, año) + custom range picker.
- Filtro por zona (multi-select).
- Persistencia de última selección en localStorage.

#### 6.1.3 Comparativa YoY
- Mismo rango de fechas del año anterior, lado a lado + delta %.
- Calendario fiscal venezolano (no usa ISO calendario estricto).

#### 6.1.4 Exportar dashboard
- Botón "Exportar PDF" genera snapshot de widgets con `@react-pdf/renderer`.
- Botón "Descargar datos CSV" para análisis externo.

### Archivos a crear/modificar
```
app/api/admin/kpis/route.ts                             [nuevo]
app/(dashboard)/admin/page.tsx                         [modificar — dashboard real]
components/admin/dashboard/                              [carpeta nueva]
  KpiCard.tsx                                            [nuevo]
  SalesChart.tsx                                         [nuevo]
  OrdersByStatusChart.tsx                              [nuevo]
  TopProductsChart.tsx                                  [nuevo]
  CustomerGrowthChart.tsx                                [nuevo]
  DateRangePicker.tsx                                    [nuevo]
  ZoneFilter.tsx                                         [nuevo]
lib/api/admin-kpis.ts                                   [nuevo]
lib/pdf/dashboard-snapshot.tsx                          [nuevo]
```

### Criterios de aceptación
- Dashboard carga en <2s con 1 año de datos.
- Cambiar período actualiza todos los widgets en tiempo real.
- Comparativa YoY muestra delta visible.
- Export PDF bien formateado.

---

## 6.2 Gestión Avanzada de Productos (5 dev-days)

### Tareas

#### 6.2.1 Bulk operations
- Importar productos via CSV:
  ```bash
  npm i papaparse @types/papaparse
  ```
  - Template descargable.
  - Columnas: name, sku, price_usd, sale_price_usd, category, brand, description, stock_per_zone.
  - Validación client-side, preview table, errores por fila.
  - Endpoint `POST /api/productos/bulk-import` recibe JSON con array y hace `upsert` masivo.
- Export productos a CSV.
- Edición inline de precio y stock en `<ProductTable />`.

#### 6.2.2 Drag-and-drop de imágenes
- Componente `<ImageDropzone />` (usando `react-dropzone`):
  - Múltiples imágenes por producto.
  - Reordenar por drag.
  - Eliminar individual.
  - Set prima (primera imagen = hero).
- Subimos a Supabase Storage en `/productos/<product_id>/<uuid>.<ext>`.
- Generación automática de blur placeholder con sharp (ver Fase 5).

#### 6.2.3 WYSIWYG editor para descripción
- Instalar `@tiptap/react` + extensions:
  ```bash
  npm i @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-image
  ```
- Componente `<RichTextEditor />` con toolbar bold/italic/list/link/image.
- Stored como HTML en `products.description` (sanitizar server-side con `sanitize-html`).

#### 6.2.4 Categorías jerárquicas
- Tabla `categories` ampliar con `parent_id`:
  ```sql
  ALTER TABLE categories ADD COLUMN parent_id uuid REFERENCES categories(id) ON DELETE SET NULL;
  ALTER TABLE categories ADD COLUMN sort_order int DEFAULT 0;
  CREATE INDEX idx_categories_parent ON categories(parent_id);
  ```
- Componente `<CategoryTree />` con dnd-kit drag-and-drop:
  - Mover categoría a sub-categoría de otra.
  - Reordenar siblings.
- API `PATCH /api/categorias/[slug]` actualiza parent_id y sort_order.

#### 6.2.5 Brands como entidad
```sql
CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  logo_url text,
  country text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE products ADD COLUMN brand_id uuid REFERENCES brands(id);
```
- CRUD en `admin/marcas/page.tsx`.
- Filter por marca en storefront.

#### 6.2.6 Programar publicaciones
- `products.published_at timestamptz`: si null → no visible en storefront; si future → programada.
- Cron Supabase cada minuto actualiza visibilidad:
  ```sql
  UPDATE products SET is_active = true WHERE published_at <= now() AND is_active = false;
  ```

### Archivos a crear/modificar
```
supabase/migrations/00035_categories_tree.sql            [nuevo]
supabase/migrations/00036_brands.sql                     [nuevo]
supabase/migrations/00037_published_at.sql               [nuevo]
app/api/productos/bulk-import/route.ts                   [nuevo]
app/api/productos/bulk-export/route.ts                   [nuevo]
app/api/categorias/[slug]/reorder/route.ts               [nuevo]
app/api/marcas/route.ts                                  [nuevo]
app/(dashboard)/admin/marcas/page.tsx                  [nuevo]
components/admin/ProductTable.tsx                       [modificar — inline edit]
components/admin/ImageDropzone.tsx                       [nuevo]
components/admin/RichTextEditor.tsx                      [nuevo]
components/admin/CategoryTree.tsx                        [nuevo]
components/admin/BrandForm.tsx                           [nuevo]
lib/csv/products-template.ts                            [nuevo]
```

### Criterios de aceptación
- Importar 100 productos via CSV en <10s.
- Drag-and-drop imágenes reordena y guarda orden.
- Categoría arrastrada se vuelve sub-categoría en árbol.
- Producto programado para 3pm se muestra en storefront automáticamente a las 3pm.

---

## 6.3 Pedidos Workflow (4 dev-days)

### Tareas

#### 6.3.1 Vista Kanban con drag-and-drop
- Página `app/(dashboard)/admin/ordenes/page.tsx`:
  - Columnas: `pending`, `confirmed`, `preparing`, `ready`, `out_for_delivery`, `delivered`, `cancelled`.
  - Cada tarjeta muestra: order_number, cliente, total, zona, ETA, método pago.
  - Drag tarjeta entre columnas actualiza status server-side (`PATCH /api/ordenes/[id]`).
  - Color coding por antigüedad (verde <24h, amarillo 24-48h, rojo >48h).
- Componente usando `@dnd-kit/core`:
  ```tsx
  import { DndContext, Draggable, Droppable } from '@dnd-kit/core';
  ```

#### 6.3.2 Detalle de orden drawer
- Click en tarjeta abre drawer lateral con:
  - Datos cliente + dirección (mapa mini).
  - Lista de items con subtotal/total.
  - Estado de pago (comprobante si método manual).
  - Historial de cambios de estado con timestamp + actor.
  - Chat interno con cliente (mensajes textuales inline).
  - Acciones: imprimir etiqueta, reembolso, cancelar, asignar driver, marcar enviado.

#### 6.3.3 Reembolsos
- Tabla `refunds`:
  ```sql
  CREATE TABLE refunds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id),
    amount numeric(12,2) NOT NULL,
    reason text NOT NULL CHECK (reason IN ('customer_request','damaged','out_of_stock','fraud','other')),
    reason_note text,
    refunded_by uuid REFERENCES users(id),
    stripe_refund_id text,
    status text DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
    created_at timestamptz DEFAULT now()
  );
  ```
- Reembolso total o parcial (solo Stripe tiene automation; otros requieren acción manual).
- API `POST /api/ordenes/[id]/refund` con `{ amount, reason }`.

#### 6.3.4 Bulk actions
- Checkbox multi-select en Kanban (o vista lista).
- Botón "Acciones" con dropdown:
  - Imprimir etiquetas (PDF con N labels por hoja).
  - Marcar enviadas (masivo).
  - Cambiar zona (masivo).
  - Cancelar (masivo).
  - Generar picking list PDF (resumen por producto con cantidades).

#### 6.3.5 Generación de PDFs
- Instalar `@react-pdf/renderer`:
  ```bash
  npm i @react-pdf/renderer
  ```
- Templates en `components/pdf/`:
  - `InvoicePDF.tsx` (factura con datos fiscales).
  - `PickingListPDF.tsx` (lista de empaque).
  - `ShippingLabelPDF.tsx` (etiqueta dirección cliente).
- API route `GET /api/ordenes/[id]/factura.pdf` retorna `application/pdf`.

### Archivos a crear/modificar
```
supabase/migrations/00038_refunds.sql                   [nuevo]
app/api/ordenes/[id]/refund/route.ts                   [nuevo]
app/api/ordenes/[id]/factura.pdf/route.ts              [nuevo]
app/api/ordenes/bulk-action/route.ts                   [nuevo]
app/(dashboard)/admin/ordenes/page.tsx                 [modificar — Kanban + bulk]
components/admin/OrdersKanban.tsx                       [nuevo]
components/admin/OrderDetailsDrawer.tsx                 [nuevo]
components/admin/OrdersBulkBar.tsx                      [nuevo]
components/pdf/InvoicePDF.tsx                            [nuevo]
components/pdf/PickingListPDF.tsx                       [nuevo]
components/pdf/ShippingLabelPDF.tsx                     [nuevo]
lib/orders/audit-trail.ts                              [nuevo]
```

### Criterios de aceptación
- Drag-drop orden entre estados updatea status persistente.
- Reembolso parcial reduce total vía Stripe; reembolso full pasa orden a `refunded`.
- Print etiquetas genera PDF válido con N ordenes seleccionadas.
- Picking list agrupa items por producto (lista de empaque).

---

## 6.4 CRM de Clientes (3 dev-days)

### Tareas

#### 6.4.1 Listado con filtros
- Página `app/(dashboard)/admin/clientes/page.tsx`:
  - Tabla: nombre, email, tel, ciudad, # pedidos, total gastado, último pedido, tier.
  - Filtro: zona, tier, # pedidos range, riesgo flag.
  - Buscar por email/phone/name.

#### 6.4.2 Perfil 360°
- Página `admin/clientes/[id]/page.tsx` con tabs:
  - **Resumen**: datos contacto, dirección por defecto, tier, KPIs (LTV, AOV, frecuencia).
  - **Pedidos**: paginated history con link a detalle.
  - **Pagos**: tarjetas guardadas (consumer-safe), métodos usados.
  - **Reviews**: reviews escritas con status moderation.
  - **Wishlist**: items favoritos actuales.
  - **Tickets**: si hay soporte tickets (opcional).
  - **Notas internas**: admin notes privadas (CRUD).
  - **Segmento**: etiquetas aplicadas (VIP, riesgo, blacklist).

#### 6.4.3 Segmentación
- Tabla `customer_segments`:
  ```sql
  CREATE TABLE customer_segments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    criteria jsonb,                    -- { orders_count_min: 5, total_spent_min: 500 }
    is_dynamic boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
  );
  CREATE TABLE customer_segment_members (
    segment_id uuid REFERENCES customer_segments(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (segment_id, user_id)
  );
  ```
- Reglas:
  - VIP: total_spent >= 1000.
  - Riesgo: 3+ órdenes canceladas en 30 días.
  - Dormiente: sin orden en 60 días.
  - Backorder difundido.
- Admin can apply manual tags too.

#### 6.4.4 Bloquear/cancelar cuenta
- API `PATCH /api/admin/clientes/[id]` con `{ is_blocked?: bool, reason?: text }`.
- Si `is_blocked=true`: bloquea login, niega checkout, `audit_logs` registra.
- Tabla `blocked_users` (o flag en `users`).

### Archivos a crear/modificar
```
supabase/migrations/00039_customer_segments.sql          [nuevo]
supabase/migrations/00040_blocked_users.sql              [nuevo]
app/api/admin/clientes/route.ts                          [nuevo]
app/api/admin/clientes/[id]/route.ts                    [nuevo]
app/api/admin/clientes/[id]/block/route.ts               [nuevo]
app/(dashboard)/admin/clientes/page.tsx                 [nuevo]
app/(dashboard)/admin/clientes/[id]/page.tsx            [nuevo]
components/admin/CustomerTable.tsx                       [nuevo]
components/admin/CustomerProfile.tsx                      [nuevo]
components/admin/CustomerNotes.tsx                       [nuevo]
```

### Criterios de aceptación
- Buscar cliente por email funciona; perfil 360° carga en <1s.
- Etiqueta "VIP" aplica automáticamente cuando LTV supera $1000.
- Bloquear usuario impide login y checkout con mensaje claro.

---

## 6.5 Reportes y Exports (2 dev-days)

### Tareas

#### 6.5.1 Generador de reportes
- Página `admin/reportes/page.tsx`:
  - Tipo de reporte (ventas, inventario, clientes, órdenes, devoluciones).
  - Filtros: rango de fecha, zona, categoría, marca.
  - Formato: CSV, Excel (con `xlsx`), PDF.
  - Programación: diario, semanal, mensual email a lista.

#### 6.5.2 Templates principales
- **Ventas por día**: tabla con fecha, # órdenes, total USD, total VES, ticket promedio.
- **Inventario$: tabla por producto con stock por zona, valor unitario, valor total.
- **Top clientes**: clientes con más gasto en el rango.
- **Products con stock bajo**: listar todos bajo threshold.
- **Devoluciones**: tabla con order_id, motivo, monto, refunded_by.
- **Impuestos**: ingresos por mes por IVA (16% en VE?) y reporte de retenciones.

#### 6.5.3 Programación y envío por email
- Tabla `scheduled_reports`:
  ```sql
  CREATE TABLE scheduled_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    type text NOT NULL,
    frequency text NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
    recipients text[] NOT NULL,
    filters jsonb,
    last_sent_at timestamptz,
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES users(id)
  );
  ```
- Cron Supabase diario verifica schedule, genera reporte, envía via Resend.

### Archivos a crear/modificar
```
supabase/migrations/00041_scheduled_reports.sql          [nuevo]
app/api/reportes/generate/route.ts                       [nuevo]
app/api/reportes/schedule/route.ts                       [nuevo]
app/(dashboard)/admin/reportes/page.tsx                 [nuevo]
components/admin/ReportBuilder.tsx                       [nuevo]
lib/reports/                                             [carpeta nueva]
  sales.ts, inventory.ts, customers.ts, refunds.ts, taxes.ts  [nuevos]
lib/xlsx/exporter.ts                                    [nuevo opcional]
```

### Criterios de aceptación
- Reporte de ventas por 30 días exporta a Excel con multi-hoja.
- Reporte programado semanal llega cada lunes 8am.
- Filtros aplican correctamente por zona/categoría.

---

## 6.6 Soporte de Tickets (Opcional, 2 dev-days)

### Tareas
- Tabla `support_tickets`:
  - `subject`, `body`, `user_id`, `status` (open, in_progress, resolved, closed), `priority`, `assigned_to`, `category`.
- Tabla `ticket_messages` con thread.
- Cliente puede abrir ticket desde su cuenta (`/perfil/soporte`).
- Admin responden desde `admin/soporte/page.tsx` con Kanban simple por estado.
- SLA tracking: tiempo de primera respuesta, tiempo de resolución.
- Tags: reembolso, logística, producto, facturación, otro.

### Archivos a crear/modificar
```
supabase/migrations/00042_support_tickets.sql            [nuevo opcional]
app/api/soporte/route.ts                                 [nuevo]
app/(customer)/perfil/soporte/page.tsx                  [nuevo]
app/(dashboard)/admin/soporte/page.tsx                  [nuevo]
components/customer/TicketForm.tsx                      [nuevo]
components/admin/TicketInbox.tsx                         [nuevo]
```

### Criterios de aceptación
- Cliente puede crear y seguir ticket desde su panel.
- Admin puede responder y cambiar estado.
- SLA visible en panel admin para priorización.

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Kanban performance con +500 órdenes/día | Media | Alto | Virtual scroll o paginate (sólo pendientes en vista) |
| Reembolso Stripe falla por fondos insuficientes platform | Baja | Alto | Catch error + notify admin + manual workflow runbook |
| `@dnd-kit` conflict con React 18 Strict Mode | Baja | Medio | Use latest version; verify with E2E tests |
| PDF generation grande en Vercel serverless (tiempo límite 10s) | Media | Medio | Stream response + chunk rendering; generar async en jobs |
| Reportes pesan >50MB y timeout API | Media | Medio | Paginación server-side + s3 generation async + link email |

---

## Dependencias con otras fases

- **Fase 7** (Infra): Admin dashboard cache en Redis para no recalcular KPIs en cada load.
- **Fase 8** (Operación): Runbook de admin (qué hacer cuando hay un pico, fraude, refund storm).

---

## Siguiente

[Fase 7 — Infraestructura y Performance](./07-infra-performance.md)
