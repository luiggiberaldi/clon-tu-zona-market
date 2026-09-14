# Fase 3 — Pagos Venezolanos Reales

> **Duración estimada:** Semanas 6-8 (12 dev-days)
> **Dependencias:** Fase 1 (rate limiting, Turnstile, audit logs), Fase 2 (deduct_stock en confirmación)
> **Objetivo:** Implementar los métodos de pago específicos del mercado venezolano con validación de comprobantes, reconciliación y anti-fraude, manteniendo Stripe para tarjetas internacionales.

---

## Definition of Done

- [ ] PagoMóvil: subida de comprobante + OCR automático + revisión manual de fallback
- [ ] Transferencia bancaria: igual flujo que PagoMóvil con info de cuenta destino
- [ ] Zelle: instrucciones claras + comprobante + conversión USD/VES automática
- [ ] Efectivo contra entrega (COD) en zonas habilitadas con límites anti-fraude
- [ ] Stripe en modo Connect (si se factura multi-vendor futuro) o modo directo
- [ ] Renderizadores de PDF de factura con datos fiscales (RIF/J/V opcional)
- [ ] Sistema de reconciliación diario (expected vs received)
- [ ] Detección de comprobantes duplicados (pHash)
- [ ] Anti-fraude: límites nuevos usuarios, blacklist de referencias usadas
- [ ] Logs de auditoría por cada transacción

---

## 3.1 PagoMóvil con OCR (4 dev-days)

### Contexto
Venezuela no tiene APIs bancarias públicas estables para confirmar PagoMóvil automáticamente. La solución híbrida es:
1. Cliente hace PagoMóvil desde su banco con datos que el sistema le da.
2. Cliente sube foto del comprobante.
3. OCR extrae banco origen, referencia, monto, cédula, fecha.
4. Match automático vs datos esperados de la orden.
5. Si match alto → auto-confirmar; si bajo → admin revisa manualmente.

### Tareas

#### 3.1.1 Datos de pago del sistema al cliente
La app debe mostrar al cliente los datos para hacer el PagoMóvil:
- Banco destino: tu cuenta (ej: BNC 0102).
- Cédula: tu cédula.
- Teléfono: tu número PagoMóvil.
- Concepto: número de orden (ej: `TUM-0000123`).
- Monto exacto en VES (convertido con exchange_rate actual).

Tabla de cuentas:
```sql
CREATE TABLE payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method text NOT NULL CHECK (method IN ('pagomovil','transferencia','zelle')),
  bank_name text NOT NULL,                -- 'BNC', 'Banesco', 'Mercantil', 'Bank of America'
  bank_code text,                          -- código bancario '0102' para PagoMóvil
  account_number text NOT NULL,
  holder_name text NOT NULL,
  holder_id text,                          -- cédula o RIF
  phone text,                              -- para PagoMóvil (teléfono a pagar)
  email text,                              -- para Zelle
  currency text DEFAULT 'VES',             -- 'VES' o 'USD'
  is_active boolean DEFAULT true,
  zone_id uuid REFERENCES zones(id),      -- NULL = todas las zonas
  display_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
```

#### 3.1.2 Subida de comprobante
- Componente `<PaymentProofUpload />` en `components/checkout/PaymentProofUpload.tsx`:
  - Drag-and-drop + click para subir.
  - Acepta imágenes JPG/PNG/HEIC y PDF.
  - Máximo 5MB.
  - Preview de la imagen subida.
  - Compresión client-side con `browser-image-compression` antes de subir.
- Endpoint `POST /api/ordenes/[id]/comprobante`:
  - Recibe `multipart/form-data` con archivo + `method` + `reference` + `amount_paid` + `payment_date` (cliente rellena los datos manuales).
  - Sube a Supabase Storage path `comprobantes/<order_id>/<uuid>.<ext>`.
  - Crea fila en tabla `payment_confirmations` (ver 3.1.3).
  - Dispara proceso OCR async (queue o fetch directo de Vision API).

#### 3.1.3 Tabla de confirmaciones
```sql
CREATE TABLE payment_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method text NOT NULL,                    -- 'pagomovil','transferencia','zelle','stripe','cash'
  reference text,                           -- número de referencia del comprobante
  amount_paid numeric(12,2) NOT NULL,
  currency text DEFAULT 'VES',
  payment_date timestamptz,
  proof_file_url text,                     -- URL Supabase Storage
  proof_file_path text,                    -- path interno para delete
  ocr_data jsonb,                          -- datos extraídos por OCR
  ocr_confidence numeric(5,2),             -- 0-100
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','auto_confirmed','manual_review','rejected','confirmed')),
  reviewed_by uuid REFERENCES users(id),  -- admin si manual
  review_note text,
  phash text,                              -- hash perceptual para detectar duplicados
  confirmation_match_score numeric(5,2),   -- 0-100, qué tan bien matchea con la orden
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX idx_payment_conf_order ON payment_confirmations(order_id);
CREATE INDEX idx_payment_conf_status ON payment_confirmations(status, created_at);
CREATE INDEX idx_payment_conf_reference ON payment_confirmations(reference);
```
- RLS: solo el user_dueño de la orden ve su confirmación; admin ve todo.

#### 3.1.4 OCR con Tesseract.js (gratis) o Google Vision (mejor precisión)
- **Tesseract.js** (gratis, no requiere API key):
  ```bash
  npm i tesseract.js
  ```
  ```ts
  // lib/payments/ocr.ts
  import Tesseract from 'tesseract.js';
  import sharp from 'sharp';

  export async function extractProofData(imagePath: string) {
    // Pre-procesamiento: aumentar contraste y sharpness
    const processed = await sharp(imagePath)
      .resize(1200, null, { withoutEnlargement: true })
      .sharpen()
      .modulate({ brightness: 1.1, contrast: 1.2 })
      .toBuffer();

    const { data } = await Tesseract.recognize(processed, 'spa+eng');
    const text = data.text;

    // Regex patterns para PagoMóvil venezolano
    const patterns = {
      bank: /(?:banco|bank)[:\s]+([A-Za-z\s]+)/i,
      reference: /(?:referencia|ref)[:\s.]+(\d{6,8})/i,
      cedula: /(?:c\.?i|cédula|cedula)[:\s]+([V|E|J]-?\d{6,8})/i,
      phone: /(?:tel|teléfono|telefono)[:\s]+(\+?[\d\s-]{8,})/i,
      amount: /(?:monto|amount|bs)[:\s]+([\d.,]+)/i,
      date: /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i
    };

    const result: Record<string, string | undefined> = {};
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      result[key] = match ? match[1].trim() : undefined;
    }
    return { ...result, rawText: text, confidence: data.confidence };
  }
  ```
- **Google Vision API** (mejor precisión, ~$1.50/1000 imágenes):
  ```bash
  npm i @google-cloud/vision
  ```
  ```ts
  import vision from '@google-cloud/vision';
  const client = new vision.ImageAnnotatorClient();
  const [result] = await client.documentTextDetection(imagePath);
  const text = result.fullTextAnnotation?.text ?? '';
  ```

#### 3.1.5 Match automático
- Función `lib/payments/match-confirmations.ts`:
  ```ts
  interface MatchInput {
    ocrData: ProofData;
    order: { total_usd: number; exchange_rate: number; order_number: string; };
    expectedAccount: { bank_code: string; holder_id: string; phone: string; };
  }
  export function calculateMatchScore(input: MatchInput): { score: number; checks: MatchCheck[] } {
    const checks: MatchCheck[] = [];
    let score = 0;
    const expectedVes = input.order.total_usd * input.order.exchange_rate;

    // 1. Banco destino == banco origen (algunos bancos cross)
    if (input.ocrData.bank === input.expectedAccount.bank_code) { score += 20; checks.push({ field: 'banco', ok: true }); }

    // 2. Referencia única (no usada en otra confirmation)
    // (check async aquí o pre-validado)

    // 3. Cédula del pagador matchea holder (opcional)
    // 4. Monto close to expected (±2%)
    if (input.ocrData.amount) {
      const paid = parseFloat(input.ocrData.amount.replace(/\./g,'').replace(',','.'));
      if (Math.abs(paid - expectedVes) / expectedVes < 0.02) { score += 30; checks.push({ field: 'monto', ok: true }); }
    }

    // 5. Fecha en últimos 24h
    // 6. Concepto menciona order_number
    if (input.ocrData.rawText?.includes(input.order.order_number)) { score += 25; checks.push({ field: 'concepto', ok: true }); }

    return { score, checks };
  }
  ```
- Lógica:
  - Score >=80 → `status = 'auto_confirmed'`, la orden pasa a `paid` automáticamente.
  - Score 50-79 → `status = 'manual_review'`, notificación al admin.
  - Score <50 → `status = 'manual_review'` con flag `low_confidence`.

#### 3.1.6 Detección de comprobantes duplicados (pHash)
- Hash perceptual con `image-hash` o `sharp-blockhash`:
  ```ts
  import sharp from 'sharp';
  import imageHash from 'image-hash';

  export async function computePHash(imagePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      imageHash(imagePath, 16, true, (err, hash) => err ? reject(err) : resolve(hash));
    });
  }
  ```
- Al subir comprobante, calcular phash y comparar con `payment_confirmations.phash` existentes.
- Hamming distance <5 = sospechoso duplicado → `status='manual_review'` con note "Posible comprobante duplicado (similar a #ID)".

#### 3.1.7 Panel de revisión admin
- Página `app/(dashboard)/admin/cobros/page.tsx`:
  - Filtros por estado, fecha, método.
  - Tabla con orden_id, cliente, monto, score OCR/confianza, thumbnail de comprobante.
  - Click en fila abre `<ConfirmationReviewModal />`:
    - Imagen comprobante grande.
    - Datos OCR extraídos (editable si el admin ve mal).
    - Datos esperados de la orden (total VES, cuenta origen esperada).
    - Botones: "Aprobar" (status='confirmed', orden pasa 'paid'), "Rechazar" (status='rejected', nota), "Pedir reenvío" (notifica cliente).
- WebSocket Realtime en `payment_confirmations` para que el admin vea nuevos sin refresh.

#### 3.1.8 Notificación al cliente
- Cuando admin aproueba/rechaza, crear `notifications` row.
- Email transaccional (Resend) con motivo.
- Toast en el dashboard del cliente al recargar.

### Archivos a crear/modificar
```
supabase/migrations/00017_payment_accounts.sql           [nuevo]
supabase/migrations/00018_payment_confirmations.sql      [nuevo]
lib/payments/ocr.ts                                      [nuevo]
lib/payments/match-confirmations.ts                      [nuevo]
lib/payments/phash.ts                                    [nuevo]
lib/api/payments.ts                                      [nuevo]
app/api/ordenes/[id]/comprobante/route.ts               [nuevo]
app/api/admin/cobros/route.ts                            [nuevo — listado]
app/api/admin/cobros/[id]/approve/route.ts              [nuevo]
app/api/admin/cobros/[id]/reject/route.ts               [nuevo]
app/(dashboard)/admin/cobros/page.tsx                   [nuevo]
components/admin/ConfirmationReviewModal.tsx            [nuevo]
components/checkout/PaymentProofUpload.tsx               [nuevo]
components/checkout/PagoMovilInstructions.tsx            [nuevo]
types/payment.ts                                         [nuevo]
.env.example                                             [modificar — GOOGLE_VISION_* opcional]
```

### Criterios de aceptación
- Cliente sube comprobante de PagoMóvil → estado orden cambia a `confirming`.
- OCR extrae monto y referencia con >70% de confianza promedio.
- Match score >=80 auto-confirma en <30s.
- Score <80 entra en cola manual para admin.
- Comprobante duplicado es detectado y flagged.

---

## 3.2 Transferencia Bancaria Nacional (1 dev-day)

### Contexto
Similar a PagoMóvil pero requiere:
- Cuenta destino (número de cuenta, banco, titular).
- Método de transferencia (web móvil, app, casa de cambio).
- CUIT/RIF del titular.

### Tareas
- Reutilizar `payment_accounts` con `method='transferencia'`.
- API `POST /api/ordenes/[id]/comprobante` es el mismo (con `method='transferencia'`).
- Visualmente, la pantalla de instrucciones al cliente (`<TransferInstructions />`) muestra:
  - Banco
  - Número cuenta
  - Titular
  - RIF
  - Email/WhatsApp para enviar notificación (opcional)
- OCR con patterns para transferencias (suelen mencionar "Transferencia", "TXPR-").

### Archivos a crear/modificar
```
components/checkout/TransferInstructions.tsx             [nuevo]
```

### Criterios de aceptación
- Cliente puede subir comprobante de transferencia con mismo flujo.
- Cuentas destino pre-configuradas en admin permiten mostrar instrucciones claras.

---

## 3.3 Zelle (1 dev-day)

### Contexto
Zelle es pago internacional usado por venezolanos con cuentas USD en EE.UU. Similar a PagoMóvil pero:
- Monto en USD (no VES).
- Email/telefono destino (no cuenta bancaria).
- Cliente paga desde su banco/tarjeta americana.

### Tareas
- Reutilizar `payment_accounts` con `method='zelle'`, `currency='USD'`, `email='...'`.
- Instrucciones claras: "Envía $XX.XX a Zelle: tu-email@dominio.com, titular: TuNombre SA, RIF J-XXXXX".
- Componente `<ZelleInstructions />` con QR opcional contacto + copiar al portapapeles.
- Subida de comprobante con OCR adaptado para inglés:
  ```ts
  const patterns_US = {
    amount: /(?:amount|sent|paid)[:\s$]+([\d.,]+)/i,
    date: /(\d{1,2}[-\/]\w+[-\/]\d{2,4})/i,
    to: /(?:to|recipient)[:\s]+(.+)$/i
  };
  ```
- Conversión: como ya está en USD, `total_usd` se usa directo (no multiplicar exchange_rate).

### Archivos a crear/modificar
```
components/checkout/ZelleInstructions.tsx               [nuevo]
```

### Criterios de aceptación
- Cliente en Venezuela con cuenta Zelle puede pagar en USD directamente.
- OCR de comprobante Zelle funciona (texto en inglés) extrayendo amount, date, recipient.

---

## 3.4 Efectivo Contra Entrega (COD) (2 dev-days)

### Contexto
No todos los clientes usan PagoMóvil. COD tiene riesgo: el cliente puede no estar al recibir, o rechazar la orden. Por eso requiere:
- Limitado a zonas específicas (no todas las zonas admiten COD).
- Límite máximo anti-fraude (~$50 USD primera compra).
- Driver marca pago al entregar.

### Tareas

#### 3.4.1 Configuración por zona
- Columna `zones.allow_cod bool DEFAULT false`:
  ```sql
  ALTER TABLE zones ADD COLUMN allow_cod boolean DEFAULT false;
  ALTER TABLE zones ADD COLUMN cod_max_amount numeric(10,2) DEFAULT 50.00;
  ```
- Admin puede activar COD por zona con límite personalizable.

#### 3.4.2 Validación en checkout
- En `PaymentSelector`, mostrar "Efectivo contra entrega" sólo si:
  - `zones.allow_cod = true`.
  - `cart_total_usd <= zones.cod_max_amount`.
  - Para nuevos usuarios (orders_count = 0), límite más estricto (~$25).
- Al seleccionar COD, la orden salta estados: `pending` → `preparing` → `out_for_delivery` → `delivered` (sin `paid` hasta que driver confirma).

#### 3.4.3 Confirmación del driver
- App del repartidor (`app/(dashboard)/repartidor/[orderId]/page.tsx`):
  - Botón "Cobrar" al finalizar entrega.
  - Input monto recibido (para validar que coincide con total).
  - Botón "Cliente no aceptó" → orden vuelve a `cancelled` con reason 'cod_refused'.
  - Si monto OK: orden pasa a `delivered`, status de pago `cash_collected`.
- Tabla `payment_confirmations` sin `proof_file_url`, status `confirmed` con `method='cash'`, `reviewed_by=driver_id`.

#### 3.4.4 Reporte de efectivo
- Admin dashboard "Reporte COD":
  - Total efectivo esperado vs recolectado por driver.
  - Discrepancias (`paid_amount != order_total`).
  - Cierre de caja diario por driver.

### Archivos a crear/modificar
```
supabase/migrations/00019_cod_zones.sql                  [nuevo]
app/(dashboard)/repartidor/rutas/page.tsx              [modificar — botón cobrar]
components/checkout/CODInstructions.tsx                 [nuevo]
components/driver/CODCollector.tsx                       [nuevo]
app/(dashboard)/admin/cobros/cod/page.tsx               [nuevo — reporte]
```

### Criterios de aceptación
- Zona sin COD habilitado no muestra la opción en checkout.
- COD > $50 USD bloqueado.
- Driver marca cobro y la orden se cierra.
- Reporte admin muestra efectivo esperado vs real con discrepancias.

---

## 3.5 Stripe Modo Directo (tarjetas) (2 dev-days)

### Contexto
El MVP ya integra Stripe básico. Hay que hardening:
- Manejo de 3DS SCA (Strong Customer Authentication).
- SetupIntent para guardar tarjeta y cobrar después (clientes recurrentes).
- Manejar webhooks con idempotencia.
- Logs de cada intent.

### Tareas

#### 3.5.1 3DS SCA
- Al crear PaymentIntent, dejar que Stripe gestione 3DS:
  ```ts
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(totalUsd * 100),
    currency: 'usd',
    payment_method_types: ['card'],
    metadata: { order_id, user_id, cart_uuid },
    statement_descriptor_suffix: orderNumber,
    // Stripe Radar fraud detection
    setup_future_usage: 'off_session'  // permite guardar y cobrar después
  });
  ```
- En el cliente, usar `@stripe/react-stripe-js` con `PaymentElement` que maneja 3DS automáticamente:
  ```tsx
  import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
  // En submit:
  const { error } = await stripe.confirmPayment({
    elements, redirect: 'if_required'
  });
  // Si requiere 3DS, stripe redirect automaticamente
  ```

#### 3.5.2 Guardar método de pago
- En checkout, checkbox "Guardar tarjeta para futuras compras".
- Tras PaymentIntent exitoso, recuperar `setup_future_usage` y `customer` (crear Stripe customer si no existe, link a user id):
  ```ts
  const customers = await stripe.customers.list({ email: user.email, limit: 1 });
  let customerId = customers.data[0]?.id;
  if (!customerId) {
    const customer = await stripe.customers.create({ email, name, metadata: { user_id } });
    customerId = customer.id;
  }
  // En PaymentIntent: customer: customerId, setup_future_usage: 'off_session'
  ```
- Endpoint `GET /api/pagos/metodos` retorna tarjetas guardadas del Stripe customer.
- Componente `<SavedCards />` permite seleccionar tarjeta guardada para checkout futuro.

#### 3.5.3 Webhook con idempotencia
- Migración tabla `stripe_webhooks`:
  ```sql
  CREATE TABLE stripe_webhook_events (
    id text PRIMARY KEY,                     -- event.id de Stripe
    type text NOT NULL,
    data jsonb NOT NULL,
    processed_at timestamptz,
    created_at timestamptz DEFAULT now()
  );
  ```
- En webhook handler:
  ```ts
  const { data, type, id } = event;
  // Idempotency check
  const { error: exists } = await supabase
    .from('stripe_webhook_events')
    .insert({ id, type, data })
    .single();
  if (exists && exists.code === '23505') return Response.json({ received: true, duplicate: true });

  switch (type) {
    case 'payment_intent.succeeded':
      await markOrderPaid(data.object.metadata.order_id);
      break;
    case 'payment_intent.payment_failed':
      await markOrderFailed(data.object.metadata.order_id);
      break;
  }
  // marcar como processed
  await supabase.from('stripe_webhook_events').update({ processed_at: new Date() }).eq('id', id);
  ```

#### 3.5.4 Logs de intents
- Tabla `stripe_events` (separada de webhooks para depuración):
  ```sql
  CREATE TABLE stripe_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES orders(id),
    event_type text NOT NULL,
    amount int,                              -- en cents
    currency text,
    stripe_payment_intent_id text,
    failure_reason text,
    created_at timestamptz DEFAULT now()
  );
  ```

### Archivos a crear/modificar
```
supabase/migrations/00020_stripe_events.sql              [nuevo]
app/api/webhooks/stripe/route.ts                        [modificar — idempotencia]
app/api/pagos/metodos/route.ts                          [nuevo]
components/checkout/StripeCheckout.tsx                  [modificar — PaymentElement 3DS]
components/checkout/SavedCards.tsx                       [nuevo]
lib/payments/stripe.ts                                  [modificar — customer, setup_intent]
```

### Criterios de aceptación
- 3DS SCA se dispara cuando el banco del cliente lo requiere (con tarjetas européas).
- Webhook duplicado no duplica efectos en la orden.
- Tarjeta guardada aparece en checkout futuro.
- Logs de cada intent permiten depurar fallas.

---

## 3.6 Stripe Connect (Opcional Marketplace) (2 dev-days)

### Contexto
Relevante SOLO si TuZonaMarket evoluciona a marketplace multi-vendor. Para single-vendor, saltar a 3.7.

### Tareas
- Tabla `vendors`:
  ```sql
  CREATE TABLE vendors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    description text,
    logo_url text,
    stripe_account_id text,                 -- acct_xxx
    is_active boolean DEFAULT true,
    commission_percent numeric(5,2) DEFAULT 10,    -- 10% para la plataforma
    payout_enabled boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
  );
  ALTER TABLE products ADD COLUMN vendor_id uuid REFERENCES vendors(id);
  ```
- Stripe Connect Express accounts: cada vendor hace onboarding (KYC) en `app/(dashboard)/vendedor/onboarding/page.tsx`.
- En `POST /api/ordenes`, crear `PaymentIntent` con `transfer_data.destination = vendor.stripe_account_id` y `application_fee_amount = product_price * commission`.
- Post-checkout, transfer ocurre automáticamente tras 24-48h (configurable).
- Panel vendor en `app/(dashboard)/vendedor/page.tsx` con métricas de ventas, órdenes, payout schedule.

### Archivos a crear/modificar
```
supabase/migrations/00021_vendors.sql                   [nuevo opcional]
app/(dashboard)/vendedor/page.tsx                       [nuevo opcional]
app/(dashboard)/vendedor/onboarding/page.tsx            [nuevo opcional]
lib/payments/stripe-connect.ts                          [nuevo opcional]
```

---

## 3.7 Reconciliación Diaria (1 dev-day)

### Contexto
Saber si el dinero esperado = dinero recibido. Esencial para detectar:
- Pagos que no llegaron (PagoMóvil/transferencia).
- Cobros duplicados.
- Errores de monto.

### Tareas
- Función SQL:
  ```sql
  CREATE OR REPLACE FUNCTION daily_reconciliation(p_date date)
  RETURNS jsonb AS $$
  DECLARE
    expected numeric(12,2);
    received numeric(12,2);
    delta numeric(12,2);
    discrepancies jsonb[];
  BEGIN
    SELECT COALESCE(SUM(total_usd), 0) INTO expected
    FROM orders
    WHERE DATE(created_at) = p_date AND status NOT IN ('cancelled');

    SELECT COALESCE(SUM(amount_paid / NULLIF(exchange_rate, 0)), 0) INTO received
    FROM payment_confirmations pc
    JOIN orders o ON o.id = pc.order_id
    WHERE DATE(pc.created_at) = p_date AND pc.status = 'confirmed';

    delta := received - expected;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'order_id', o.id,
      'order_number', o.order_number,
      'expected', o.total_usd,
      'received', COALESCE(pc.amount_paid / NULLIF(o.exchange_rate, 0), 0),
      'discrepancy', o.total_usd - COALESCE(pc.amount_paid / NULLIF(o.exchange_rate, 0), 0)
    )), '[]'::jsonb)
    INTO discrepancies
    FROM orders o
    LEFT JOIN payment_confirmations pc ON pc.order_id = o.id
    WHERE DATE(o.created_at) = p_date AND o.status NOT IN ('cancelled')
      AND ((pc.amount_paid IS NOT NULL AND abs(pc.amount_paid / NULLIF(o.exchange_rate, 0) - o.total_usd) > 0.01)
           OR (pc.amount_paid IS NULL));

    RETURN jsonb_build_object(
      'date', p_date,
      'expected', expected,
      'received', received,
      'delta', delta,
      'discrepancies', discrepancies
    );
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;
  ```
- Cron Supabase diario ejecuta reconciliación y crea `notifications` si delta != 0 ±tolerance.
- Página admin `app/(dashboard)/admin/finanzas/reconciliacion/page.tsx` con tabla por día.
- Exportar a CSV.

### Archivos a crear/modificar
```
supabase/migrations/00022_reconciliation.sql             [nuevo]
app/(dashboard)/admin/finanzas/reconciliacion/page.tsx  [nuevo]
components/admin/ReconciliationTable.tsx                  [nuevo]
```

### Criterios de aceptación
- Reporte diario muestra expected vs received con delta.
- Discrepancias detalladas por order_id.
- Notificación admin si delta > $1 USD.

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| OCR con baja precisión en fotos venezolanas | Alta | Medio | Fallback a revisión manual si confidence <70% |
| Cliente sube comprobante de otra persona | Media | Alto | Validar `reference` única en última semana |
| Comprobantes manipulados (Photoshop) | Media | Alto | pHash + metadata EXIF check + visual queue al admin |
| Race condition en confirm PagoMóvil | Baja | Medio | Constraint UNIQUE en (reference, payment_date, payment_account_id) |
| Stripe radix rounding al convertir VES cents | Media | Bajo | Usar `Math.round(total * 100)` y trazar cada conversión |
| Driver marca COD como cobrado para comerse efectivo | Baja | Medio | Reconciliación COD report + random audit |

---

## Dependencias con otras fases

- **Fase 4** (Logística): Driver marca pago COD al entregar; tracking de efectivo por ruta.
- **Fase 5** (UX): Notificaciones al cliente sobre estado de confirmación.
- **Fase 6** (Admin): Panel de cobros depende de `payment_confirmations`, vistas admin de reconciliación.
- **Fase 8** (Operación): Runbook para casos de comprobante fraudulento.

---

## Siguiente

[Fase 4 — Logística y Delivery Inteligente](./04-logistica-delivery.md)
