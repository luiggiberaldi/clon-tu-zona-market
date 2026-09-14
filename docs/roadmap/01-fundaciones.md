# Fase 1 — Fundaciones de Producción

> **Duración estimada:** Semanas 1-3 (15 dev-days)
> **Dependencias:** Ninguna (punto de partida)
> **Objetivo:** Convertir la base técnica del MVP en una plataforma production-ready *antes* de añadir features. Sin esto, cualquier feature nueva se construye sobre arena.

---

## Definition of Done

- [ ] Migraciones versionadas con Supabase CLI funcionando (`supabase db push`)
- [ ] Esquema expandido: `audit_logs`, `warehouses`, `inventory_items`, `stock_movements`, `coupons`, `reviews`, `wishlist`, `notifications`
- [ ] Auth con MFA TOTP para admin/driver, verificación de email obligatoria, rate limiting en auth
- [ ] Roles granulares (`customer`, `driver`, `manager`, `admin`, `super_admin`) con RLS reforzada
- [ ] Rate limiting en todas las API routes (Redis + `@upstash/ratelimit`)
- [ ] Cloudflare Turnstile en login/registro/checkout
- [ ] Security headers completos (CSP, HSTS, X-Frame-Options, Permissions-Policy)
- [ ] Sentry + logs estructurados (pino) + Vercel Analytics operando
- [ ] Playwright instalado + 5 tests E2E del flujo crítico pasando en CI
- [ ] CI/CD con GitHub Actions: lint + typecheck + unit + e2e + build + Lighthouse CI
- [ ] Preview deploys automáticos por PR en Vercel
- [ ] Branch protection en `main` (requiere review + CI verde)

---

## 1.1 Database & Migraciones (3 dev-days)

### Problema actual
El proyecto tiene un único `supabase/schema.sql`. Sin sistema de migraciones, cualquier cambio al esquema en producción rompe entornos existentes o requiere ejecución manual con riesgo de drift.

### Tareas

#### 1.1.1 Instalar y configurar Supabase CLI
- Instalar CLI: `npm i -D supabase` o `brew install supabase/tap/supabase`
- Inicializar en el repo:
  ```bash
  npx supabase init
  ```
  Genera carpeta `supabase/` con `config.toml` y `supabase/migrations/`.
- Enlazar proyecto remoto:
  ```bash
  npx supabase link --project-ref <project-ref>
  ```
- Variables de entorno en `.env`: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`, `SUPABASE_PROJECT_REF`.

#### 1.1.2 Migración inicial desde `schema.sql`
- Renombrar el `schema.sql` actual a `supabase/migrations/00001_init_schema.sql`.
- Verificar que ejecuta limpio contra un Supabase local:
  ```bash
  npx supabase start   # levanta stack local en Docker
  npx supabase db reset
  ```
- Si hay errores, dividir en migraciones lógicas:
  - `00001_init_schema.sql` — extensiones, enums, tablas base
  - `00002_rls_policies.sql` — RLS policies
  - `00003_triggers_functions.sql` — triggers y `generate_order_number()`
  - `00004_indexes.sql` — índices de performance

#### 1.1.3 Migración de expansión (tablas nuevas)
Crear `supabase/migrations/00005_expand_production.sql` con:

```sql
-- ========================================
-- AUDIT LOGS — trazabilidad de acciones sensibles
-- ========================================
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,                    -- 'order.update_status', 'product.delete', 'auth.login'
  entity_type text NOT NULL,               -- 'order', 'product', 'user'
  entity_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- RLS: solo el propio usuario puede ver sus logs; admin todo
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_self_read" ON audit_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "audit_logs_admin_all" ON audit_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- Trigger para poblar audit_logs (ver sección 1.3)

-- ========================================
-- WAREHOUSES — bodegas físicas por zona
-- ========================================
CREATE TABLE warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL UNIQUE,               -- 'BOD-VAL-N1'
  address text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_warehouses_zone ON warehouses(zone_id);

-- ========================================
-- INVENTORY PER ZONE/WAREHOUSE
-- Reemplaza la columna stock_quantity en products
-- ========================================
CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones(id),
  warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL,
  quantity int NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved_quantity int NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  low_stock_threshold int NOT NULL DEFAULT 5,
  UNIQUE(product_id, zone_id, warehouse_id)
);
CREATE INDEX idx_inventory_product_zone ON inventory_items(product_id, zone_id);
CREATE INDEX idx_inventory_low_stock ON inventory_items(quantity, low_stock_threshold);

-- RLS: público lee quantity; admin escribe
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_public_read" ON inventory_items FOR SELECT USING (true);
CREATE POLICY "inventory_admin_write" ON inventory_items FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','manager','super_admin')));

-- ========================================
-- STOCK MOVEMENTS — auditoría de cambios de inventario
-- ========================================
CREATE TABLE stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones(id),
  warehouse_id uuid REFERENCES warehouses(id),
  quantity int NOT NULL,                   -- negativo = salida, positivo = entrada
  reason text NOT NULL CHECK (reason IN ('order','adjustment','return','transfer','initial')),
  reference_id uuid,                       -- order_id si reason='order'
  user_id uuid REFERENCES users(id),
  note text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id, created_at DESC);
CREATE INDEX idx_stock_movements_zone ON stock_movements(zone_id, created_at DESC);

-- RLS: admin full; driver solo lectura de sus rutas
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_movements_admin_all" ON stock_movements FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','manager','super_admin','driver')));

-- ========================================
-- STOCK RESERVATIONS — bloqueo temporal durante checkout
-- ========================================
CREATE TABLE stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_uuid uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id),
  zone_id uuid NOT NULL REFERENCES zones(id),
  quantity int NOT NULL CHECK (quantity > 0),
  expires_at timestamptz NOT NULL,         -- now() + interval '15 minutes'
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_reservations_cart ON stock_reservations(cart_uuid);
CREATE INDEX idx_reservations_expires ON stock_reservations(expires_at);

-- ========================================
-- COUPONS — cupones de descuento
-- ========================================
CREATE TABLE coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('percent','fixed','free_shipping')),
  value numeric(10,2) NOT NULL,             -- porcentaje (0-100) o monto fijo USD
  min_order numeric(10,2) DEFAULT 0,
  max_uses int,                            -- NULL = ilimitado
  used_count int NOT NULL DEFAULT 0,
  valid_from timestamptz,
  valid_until timestamptz,
  zone_id uuid REFERENCES zones(id),       -- NULL = todas las zonas
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_coupons_code ON coupons(code);

CREATE TABLE coupon_redemptions (
  coupon_id uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  redeemed_at timestamptz DEFAULT now(),
  PRIMARY KEY (coupon_id, order_id)
);

-- RLS coupons: público lee (para validar); admin escribe
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupons_public_read" ON coupons FOR SELECT USING (is_active = true);
CREATE POLICY "coupons_admin_write" ON coupons FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','manager','super_admin')));

-- ========================================
-- REVIEWS — reseñas verificadas de compra
-- ========================================
CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id),   -- valida compra real
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text,
  body text,
  images jsonb DEFAULT '[]'::jsonb,        -- array de URLs Supabase Storage
  is_verified boolean DEFAULT false,        -- se marca true cuando se valida order_id
  is_approved boolean DEFAULT false,       -- moderación admin
  created_at timestamptz DEFAULT now(),
  UNIQUE(order_id)                          -- 1 review por order
);
CREATE INDEX idx_reviews_product ON reviews(product_id, is_approved, created_at DESC);

-- RLS: público lee aprobadas; usuario crea/cree propias; admin todo
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_public_approved" ON reviews FOR SELECT USING (is_approved = true);
CREATE POLICY "reviews_self_insert" ON reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reviews_self_update" ON reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "reviews_admin_all" ON reviews FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','manager','super_admin')));

-- ========================================
-- WISHLIST — favoritos (migrar del frontend al server)
-- ========================================
CREATE TABLE wishlist (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
CREATE INDEX idx_wishlist_user ON wishlist(user_id, created_at DESC);

ALTER TABLE wishlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wishlist_self" ON wishlist FOR ALL USING (auth.uid() = user_id);

-- ========================================
-- NOTIFICATIONS — centro de notificaciones in-app
-- ========================================
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,                      -- 'order.status', 'stock.back', 'promo', 'system'
  title text NOT NULL,
  body text,
  link text,                               -- URL interna '/mis-pedidos/123'
  metadata jsonb DEFAULT '{}'::jsonb,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_self" ON notifications FOR ALL USING (auth.uid() = user_id);

-- Realtime: publicar cambios en notifications y orders
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
```

#### 1.1.4 Funciones SQL de lógica de negocio
Archivo `supabase/migrations/00006_functions.sql`:

```sql
-- ========================================
-- get_cart_summary(p_cart_uuid, p_zone_id)
-- Cálculo server-side del carrito para evitar manipulación cliente
-- ========================================
CREATE OR REPLACE FUNCTION get_cart_summary(p_cart_uuid uuid, p_zone_id uuid)
RETURNS jsonb AS $$
DECLARE
  subtotal numeric(10,2) := 0;
  discount numeric(10,2) := 0;
  delivery_fee numeric(10,2) := 0;
  total numeric(10,2) := 0;
  items_count int := 0;
  delivery_fee_zone numeric(10,2);
BEGIN
  SELECT COALESCE(d.delivery_fee_usd, 0) INTO delivery_fee_zone
  FROM zones z
  LEFT JOIN delivery_fees d ON d.zone_id = z.id  -- asumiendo tabla delivery_fees
  WHERE z.id = p_zone_id;

  SELECT
    COALESCE(SUM(c.quantity * COALESCE(p.sale_price_usd, p.price_usd)), 0),
    COUNT(*)
  INTO subtotal, items_count
  FROM cart_items c
  JOIN products p ON p.id = c.product_id
  WHERE c.cart_uuid = p_cart_uuid;

  total := subtotal + delivery_fee_zone - discount;
  RETURN jsonb_build_object(
    'subtotal', subtotal,
    'discount', discount,
    'delivery_fee', delivery_fee_zone,
    'total', total,
    'items_count', items_count,
    'min_order_met', subtotal >= (SELECT min_order_usd FROM settings WHERE id = 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- deduct_stock(p_order_id)
-- Descuenta stock transaccionalmente al confirmar pago
-- ========================================
CREATE OR REPLACE FUNCTION deduct_stock(p_order_id uuid)
RETURNS void AS $$
DECLARE
  item RECORD;
BEGIN
  FOR item IN
    SELECT oi.product_id, oi.quantity, o.zone_id
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.order_id = p_order_id
  LOOP
    -- Decrementar inventory_items, crear stock_movement
    UPDATE inventory_items
    SET quantity = quantity - item.quantity
    WHERE product_id = item.product_id AND zone_id = item.zone_id;

    INSERT INTO stock_movements (product_id, zone_id, quantity, reason, reference_id)
    VALUES (item.product_id, item.zone_id, -item.quantity, 'order', p_order_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- get_admin_kpis(p_date_from, p_date_to)
-- KPIs pre-calculados para el dashboard admin
-- ========================================
CREATE OR REPLACE FUNCTION get_admin_kpis(p_date_from timestamptz, p_date_to timestamptz)
RETURNS jsonb AS $$
DECLARE
  total_sales numeric(12,2);
  orders_count int;
  avg_ticket numeric(10,2);
  new_customers int;
  pending_orders int;
BEGIN
  SELECT COALESCE(SUM(total_usd), 0) INTO total_sales
  FROM orders WHERE created_at BETWEEN p_date_from AND p_date_to AND status NOT IN ('cancelled');

  SELECT COUNT(*) INTO orders_count
  FROM orders WHERE created_at BETWEEN p_date_from AND p_date_to;

  SELECT COALESCE(AVG(total_usd), 0) INTO avg_ticket
  FROM orders WHERE created_at BETWEEN p_date_from AND p_date_to AND status NOT IN ('cancelled');

  SELECT COUNT(DISTINCT user_id) INTO new_customers
  FROM users WHERE created_at BETWEEN p_date_from AND p_date_to;

  SELECT COUNT(*) INTO pending_orders
  FROM orders WHERE status IN ('pending','confirming','preparing') AND created_at >= p_date_from;

  RETURN jsonb_build_object(
    'total_sales', total_sales,
    'orders_count', orders_count,
    'avg_ticket', avg_ticket,
    'new_customers', new_customers,
    'pending_orders', pending_orders,
    'date_from', p_date_from,
    'date_to', p_date_to
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- cleanup_expired_reservations()
-- Limpia reservas de stock expiradas (ejecutar en cron Supabase)
-- ========================================
CREATE OR REPLACE FUNCTION cleanup_expired_reservations()
RETURNS int AS $$
DECLARE
  deleted_count int;
BEGIN
  DELETE FROM stock_reservations WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### 1.1.5 Backups y recuperación
- Activar **Point-in-Time Recovery (PITR)** en Supabase (plan Team).
- Configurar retención de 30 días.
- Backup mensual adicional exportado a S3/R2 (script en `scripts/backup.ts`):
  ```bash
  npx tsx scripts/backup.ts  # descarga dump y sube a R2
  ```
- Documentar DR (Disaster Recovery) en `docs/runbook/02-disaster-recovery.md`.

#### 1.1.6 Tipos TypeScript actualizados
Regenerar `lib/supabase/types.ts` con todas las tablas nuevas:
```bash
npx supabase gen types typescript --linked > lib/supabase/types.ts
```

### Archivos a crear/modificar
```
supabase/
  config.toml                          [nuevo — generado por supabase init]
  migrations/
    00001_init_schema.sql              [renombrar de schema.sql]
    00002_rls_policies.sql             [extraído de 00001]
    00003_triggers_functions.sql       [extraído de 00001]
    00004_indexes.sql                  [extraído de 00001]
    00005_expand_production.sql        [nuevo — tablas nuevas]
    00006_functions.sql                [nuevo — funciones SQL]
scripts/
  backup.ts                            [nuevo]
lib/supabase/
  types.ts                             [regenerado]
```

### Criterios de aceptación
- `npx supabase db reset` ejecuta limpio en local.
- `npx supabase db push --linked` despliega a remoto sin drifts.
- Todas las tablas nuevas tienen RLS activada.
- Desde el SQL Editor de Supabase, `SELECT get_admin_kpis(now() - interval '7 days', now())` retorna JSON válido.

---

## 1.2 Auth Hardening (3 dev-days)

### Problema actual
- Email/password + Google OAuth básico.
- Sin MFA, sin rate limiting en intentos de login, sin audit de auth.
- Sesiones se borran sólo en cookie (no se revocan en Supabase).

### Tareas

#### 1.2.1 MFA TOTP para admin y driver
- Instalar `otplib`:
  ```bash
  npm i otplib @types/otplib
  ```
- Endpoint `/api/auth/mfa/setup`: genera secret TOTP, devuelve QR (libreria `qrcode`).
- Endpoint `/api/auth/mfa/verify`: valida token TOTP, marca `mfa_enabled=true` en tabla `users`.
- En el middleware, redirigir a `/setup-mfa` si el usuario es `admin`/`driver` y `mfa_enabled=false`.
- Componente `<MFASetup />` en `app/(dashboard)/configuracion/mfa/page.tsx` con QR y input de 6 dígitos.
- En login: si `mfa_enabled`, segundo paso pidiendo código TOTP:
  - `app/(auth)/login/page.tsx` añadir estado `mfaPending` → mostrar `<MFAChallenge />` cuando aplique.

```ts
// lib/auth/mfa.ts (nuevo)
import { authenticator } from 'otplib';

export function generateMFASecret(email: string): { secret: string; qr: string } {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(email, 'TuZonaMarket', secret);
  return { secret, qr: otpauth };
}

export function verifyMFAToken(token: string, secret: string): boolean {
  return authenticator.verify({ token, secret });
}
```

#### 1.2.2 Rate limiting en auth
- Usar `@upstash/ratelimit` + `@upstash/redis` (sliding window).
- Endpoint `/api/auth/login`: 5 intentos / 15 min por IP.
- Endpoint `/api/auth/registro`: 3 intentos / hora por IP.
- Endpoint `/api/auth/recuperar`: 3 intentos / hora por IP.
- Respuesta 429 con `Retry-After` header.

```ts
// lib/rate-limit.ts (nuevo — se mueve de rateLimit.ts actual)
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({ url: process.env.UPSTASH_REDIS_URL!, token: process.env.UPSTASH_REDIS_TOKEN! });

export const ratelimiters = {
  auth: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(15, '15 m'), prefix: 'auth' }),
  api: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, '1 m'), prefix: 'api' }),
  payment: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m'), prefix: 'payment' }),
  admin: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, '1 m'), prefix: 'admin' })
};

export async function checkRateLimit(identifier: string, limiter: Ratelimit) {
  const { success, limit, remaining, reset } = await limiter.limit(identifier);
  if (!success) {
    return new Response(JSON.stringify({ error: 'Demasiadas solicitudes' }), {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)) }
    });
  }
  return null;
}
```

- Aplicar en cada API route:
  ```ts
  // app/(auth)/login/route.ts (si mueves la auth a Server Action o ruta)
  import { ratelimiters, checkRateLimit } from '@/lib/rate-limit';
  const blocked = await checkRateLimit(req.headers.get('x-forwarded-for') ?? 'anon', ratelimiters.auth);
  if (blocked) return blocked;
  ```

#### 1.2.3 Email verification obligatoria
- En Supabase Dashboard: Auth > Email confirmations = ON.
- Custom email templates con dominio propio (Resend SMTP o Supabase Inbound).
- En middleware: si user activo pero `email_confirmed_at` null → redirect a `/verificar-email`.
- Página `app/(auth)/verificar-email/page.tsx` con botón "Reenviar email".

#### 1.2.4 Password reset reforzado
- Endpoint `/api/auth/recuperar` genera token JWT firmado (HMAC) con expiración 15 min.
- Email con link `https://tuzonamarket.com/recuperar?token=<jwt>`.
- En `app/(auth)/recuperar/page.tsx`, validar token server-side antes de mostrar formulario de nueva password.

#### 1.2.5 Session management
- Refresh tokens con `supabase.auth.refreshSession()` en middleware cada 5 min si está próximo a expirar.
- Logout revoca la sesión en Supabase:
  ```ts
  await supabase.auth.signOut();  // revoke + delete cookie
  ```
- Tabla `sessions` (opcional, para visualizar sesiones activas en `/perfil/sesiones`):
  ```sql
  CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jti text NOT NULL UNIQUE,           -- JWT ID de la sesión
    device text,
    ip_address inet,
    last_seen timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
  );
  ```

#### 1.2.6 Roles granulares + RLS reforzada
- Columna `users.role` ya existe con `enum('customer','driver','admin')`. Ampliar:
  ```sql
  ALTER TYPE user_role ADD VALUE 'manager';
  ALTER TYPE user_role ADD VALUE 'super_admin';
  ```
- RLS policías factorizadas por rol (ver `00007_rls_roles.sql`):
  - `customer`: solo sus propias órdenes, direcciones, carrito, reviews, wishlist, notificaciones.
  - `driver`: órdenes asignadas a él, zonas de su ruta, stock_movements solo lectura.
  - `manager`: CRUD productos/ordenes/cupones/zonas; NO users ni settings críticos.
  - `admin`: todo menos `super_admin`-only (borrar db, settings críticos).
  - `super_admin`: todo.
- Helper SQL:
  ```sql
  CREATE OR REPLACE FUNCTION is_admin()
  RETURNS boolean AS $$ SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin','manager')); $$ LANGUAGE sql SECURITY DEFINER;
  ```

#### 1.2.7 Audit log de eventos auth
- Trigger en `auth.users` de Supabase (no directamente modificable; usar webhook).
- API route `/api/webhooks/supabase-auth` que recibe `user.sign_up`, `user.sign_in`, `user.password_reset` y escribe `audit_logs`.
- Endpoint `/api/auth/audit` para que el usuario vea su historial de login en `/perfil/seguridad`.

### Archivos a crear/modificar
```
lib/auth/
  mfa.ts                                [nuevo]
  session.ts                            [nuevo]
app/(auth)/
  login/page.tsx                        [modificar — flujo MFA]
  recuperar/page.tsx                     [modificar — token JWT]
  verificar-email/page.tsx               [nuevo]
app/(dashboard)/configuracion/
  mfa/page.tsx                           [nuevo]
app/(customer)/perfil/
  sesiones/page.tsx                      [nuevo]
  seguridad/page.tsx                     [nuevo]
app/api/auth/
  mfa/setup/route.ts                    [nuevo]
  mfa/verify/route.ts                   [nuevo]
  audit/route.ts                        [nuevo]
app/api/webhooks/
  supabase-auth/route.ts                [nuevo]
lib/rate-limit.ts                       [nuevo — sustituye rateLimit.ts]
supabase/migrations/00007_rls_roles.sql [nuevo]
```

### Criterios de aceptación
- Admin sin MFA configurada es redirigido a `/configuracion/mfa` al intentar entrar al dashboard.
- 6 intentos de login fallidos consecutivos retornan 429 con `Retry-After`.
- Email de verificación se envía al registrar y no se puede acceder a funciones hasta confirmar.
- `audit_logs` registra cada login con ip y user-agent.
- Usuario puede revocar sesiones activas desde `/perfil/sesiones`.

---

## 1.3 Seguridad y Cumplimiento (2 dev-days)

### Tareas

#### 1.3.1 Security headers en `next.config.mjs`
```js
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "default-src 'self'; base-uri 'self'; img-src 'self' *.supabase.co data: blob: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co https://api.stripe.com wss://*.supabase.co; frame-ancestors 'none';" },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=(self)' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' }
];

async function headers() {
  return [
    { source: '/:path*', headers: securityHeaders },
    { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] }
  ];
}
```

#### 1.3.2 CSP con nonces para scripts (opcional avanzado)
- Generar nonce por request en middleware y pasarlo a `<Script nonce={nonce} />`.
- Actualizar CSP header dinámicamente con `'nonce-<random>'`.

#### 1.3.3 Cloudflare Turnstile (CAPTCHA sin tracking)
- Registrarse en Cloudflare, crear sitio Turnstile, obtener `siteKey` y `secretKey`.
- Variables de entorno: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`.
- Componente `<TurnstileWidget />` en `components/auth/TurnstileWidget.tsx`:
  ```tsx
  'use client';
  import { Turnstile } from '@marsidev/react-turnstile';
  export function TurnstileWidget({ onVerify }: { onVerify: (token: string) => void }) {
    return (
      <Turnstile
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
        onSuccess={onVerify}
        options={{ theme: 'light' }}
      />
    );
  }
  ```
- Validar token server-side en login/registro/checkout:
  ```ts
  async function verifyTurnstile(token: string): Promise<boolean> {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token })
    });
    const data = await res.json();
    return data.success === true;
  }
  ```

#### 1.3.4 Anti-CSRF
- Cookies `sb-...-auth-token` con `SameSite=Lax` (configuración default de Supabase SSR).
- En Server Actions y POST de formularios, comparar header `Origin` con el dominio permitido:
  ```ts
  function assertCsrf(req: NextRequest) {
    const origin = req.headers.get('origin');
    if (!origin || !origin.startsWith(process.env.NEXT_PUBLIC_SITE_URL!)) {
      throw new Response('CSRF', { status: 403 });
    }
  }
  ```

#### 1.3.5 Validación Zod estricta en TODAS las API routes
- Revisar cada `app/api/**/route.ts` y envolver el body/payload con `*.safeParse()`.
- Cualquier error de parseo retorna 422 con `flatten().fieldErrors` estructurado.
- Tipos `z.infer<typeof schema>` pasados al resto del handler para evitar casts `as`.

#### 1.3.6 CORS restringido
- En API routes, setear `Access-Control-Allow-Origin` solo al dominio de producción + localhost para dev.
- Para webhooks externos (Stripe, Supabase, Google), ruta específica con CORS allow all pero validación signature.

#### 1.3.7 LOPD / Privacidad
- Página `/privacidad` con política de privacidad clara (template adaptado).
- Página `/terminos` con términos de servicio.
- Página `/cookies` con banner configurable y preferencias (analytics/no).
- Componente `<CookieConsent />` que guarda preferencia y solo carga Vercel Analytics / PostHog si consent.
- Endpoint `/api/me/delete` para solicitud de eliminación de datos (derecho LOPD).

### Archivos a crear/modificar
```
next.config.mjs                                            [modificar — securityHeaders]
components/auth/TurnstileWidget.tsx                        [nuevo]
lib/turnstile.ts                                           [nuevo]
lib/csrf.ts                                                [nuevo]
app/(public)/privacidad/page.tsx                           [nuevo — contenido legal]
app/(public)/terminos/page.tsx                             [nuevo — contenido legal]
app/(public)/cookies/page.tsx                              [nuevo — contenido legal]
components/layout/CookieConsent.tsx                        [nuevo]
app/api/me/delete/route.ts                                [nuevo]
```

### Criterios de aceptación
- securityheaders.com califica el dominio como **A+**.
- Sin Turnstile válido, login retorna 403.
- Sin header `Origin` válido, cualquier POST retorna 403.
- Política de privacidad accesible y linked en footer.

---

## 1.4 Observabilidad (2 dev-days)

### Tareas

#### 1.4.1 Sentry setup
- Crear proyecto en Sentry, obtener `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`.
- Configurar con wizard:
  ```bash
  npx @sentry/wizard@latest -i nextjs
  ```
  Genera `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, modifica `next.config.mjs`.
- Variables en `.env` (no commitear `SENTRY_AUTH_TOKEN`).
- Source maps upload automático en CI.
- Performance monitoring activado (sampleRate: 0.1 en producción, 1.0 en staging).

#### 1.4.2 Logs estructurados con pino
- Instalar `pino` y `pino-pretty`:
  ```bash
  npm i pino pino-pretty
  ```
- Wrapper `lib/logger.ts`:
  ```ts
  import pino from 'pino';
  export const logger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
    base: { service: 'tuzonamarket-api' }
  });
  ```
- Uso en API routes:
  ```ts
  logger.info({ userId, orderId, action: 'checkout.completed', amount: 150.00, currency: 'USD' }, 'order.event');
  logger.error({ err, userId }, 'checkout.failed');
  ```
- En Vercel, logs se envían automáticamente a Axiom/Logflare configurado.

#### 1.4.3 Vercel Analytics + Web Vitals
- Instalar:
  ```bash
  npm i @vercel/analytics @vercel/speed-insights
  ```
- En `app/layout.tsx`:
  ```tsx
  import { Analytics } from '@vercel/analytics/react';
  import { SpeedInsights } from '@vercel/speed-insights/next';
  // ...
  <Analytics mode={process.env.NODE_ENV === 'production' ? 'production' : 'development'} />
  <SpeedInsights />
  ```
- Web Vitals a PostHog (ver Fase 8) o Sentry.

#### 1.4.4 Uptime monitoring
- Crear monitor en UptimeRobot para:
  - `https://tuzonamarket.com` (cada 30s)
  - `https://tuzonamarket.com/api/productos` (cada 1m)
  - `https://tuzonamarket.com/api/zonas` (cada 1m)
- Alertas a email + Slack/Telegram webhook.

#### 1.4.5 Alertas
- Sentry alert rules:
  - Error rate >5% en 5 min → email + Slack
  - LCP >2.5s en 10% de sesiones → email
- Supabase alert en DB CPU >80% y connection pool saturado.

### Archivos a crear/modificar
```
sentry.client.config.ts                  [generado por wizard]
sentry.server.config.ts                  [generado por wizard]
sentry.edge.config.ts                    [generado por wizard]
next.config.mjs                          [modificar — sentry wrap]
lib/logger.ts                            [nuevo]
app/layout.tsx                           [modificar — Analytics/SpeedInsights]
.env.example                              [modificar — nuevas vars SENTRY_*]
```

### Criterios de aceptación
- Un error lanzado en producción aparece en Sentry en <30s con stack trace completo.
- `logger.info(...)` aparece en logs de Vercel con formato JSON parseable.
- Vercel Analytics dashboard muestra Web Vitals reales.

---

## 1.5 Testing Strategy (3 dev-days)

### Tareas

#### 1.5.1 Expandir unit tests
- Cobertura actual: stores, utils, button.

- Meta: **>80% en `lib/`**.
- Tests nuevos:
  - `lib/auth/mfa.test.ts` — generate/verify TOTP
  - `lib/rate-limit.test.ts` — mock Redis, verify sliding window
  - `lib/api/products.test.ts` — mock Supabase, verify list/create/update
  - `lib/api/orders.test.ts` — mock Supabase + Stripe, verify workflow estados
  - `lib/utils/validation.test.ts` — todos los schemas Zod (expandir)
  - `store/zoneStore.test.ts` — selección, persist, selectors

#### 1.5.2 Integration tests con Supabase local
- `npx supabase start` levanta stack local en Docker.
- Crear `vitest.config.integ.ts` con setup que espera a Supabase local healthcheck.
- Tests:
  - `tests/integration/auth.test.ts` — signup, login, MFA, logout
  - `tests/integration/cart.test.ts` — add/update/remove con DB real
  - `tests/integration/checkout.test.ts` — checkout end-to-end con Stripe mock
  - `tests/integration/inventory.test.ts` — deduct_stock, alert low stock
- Script en `package.json`:
  ```json
  "test:integration": "vitest run --config vitest.config.integ.ts"
  ```

#### 1.5.3 E2E tests con Playwright
- Instalar:
  ```bash
  npm i -D @playwright/test
  npx playwright install --with-deps chromium
  ```
- Config `playwright.config.ts`:
  ```ts
  export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
    webServer: { command: 'npm run dev', url: 'http://localhost:3000', timeout: 60_000, reuseExistingServer: true }
  });
  ```
- Tests iniciales (mínimo 5):
  - `tests/e2e/browse-add-cart.spec.ts` — browse productos, añadir al carrito
  - `tests/e2e/checkout-flow.spec.ts` — checkout completo con Stripe test card
  - `tests/e2e/auth.spec.ts` — registro + login + logout
  - `tests/e2e/admin-product-crud.spec.ts` — admin crea/edita/elimina producto
  - `tests/e2e/mobile-viewport.spec.ts` — mismo flujo en viewport móvil (375x812)

#### 1.5.4 Coverage report
- Instalar `@vitest/coverage-v8`:
  ```bash
  npm i -D @vitest/coverage-v8
  ```
- Script:
  ```json
  "test:coverage": "vitest run --coverage"
  ```
- Meta CI: coverage de `lib/` >=80%, fallo si <70%.

#### 1.5.5 Visual regression (opcional)
- Playwright screenshots + Percy o Chromatic.
- Comparar screenshots de `/`, `/productos`, `/checkout` antes/después de cada PR.

#### 1.5.6 Load testing con k6 (opcional avanzado)
- Script `scripts/load-test.js` que simula 100 usuarios concurrentes navegando 5 min.
- Métricas: p95 latency, error rate, requests/s.

### Archivos a crear/modificar
```
playwright.config.ts                     [nuevo]
vitest.config.integ.ts                   [nuevo]
tests/
  unit/                                  [renombrar carpeta components/]
  integration/
    auth.test.ts                         [nuevo]
    cart.test.ts                         [nuevo]
    checkout.test.ts                     [nuevo]
    inventory.test.ts                    [nuevo]
  e2e/
    browse-add-cart.spec.ts              [nuevo]
    checkout-flow.spec.ts                [nuevo]
    auth.spec.ts                         [nuevo]
    admin-product-crud.spec.ts           [nuevo]
    mobile-viewport.spec.ts               [nuevo]
package.json                              [modificar — scripts test:*]
```

### Criterios de aceptación
- `npm run test:coverage` muestra >=80% en `lib/`.
- `npm run test:e2e` pasa los 5 specs en CI.
- `npm run test:integration` pasa con Supabase local running.

---

## 1.6 CI/CD Profesional (2 dev-days)

### Tareas

#### 1.6.1 GitHub Actions workflow
Archivo `.github/workflows/ci.yml` (modificar el actual):

```yaml
name: CI

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main, staging]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npx tsc --noEmit

      - name: Unit tests + coverage
        run: npm run test:coverage

      - name: Build
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          SENTRY_DSN: ${{ secrets.SENTRY_DSN }}
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}

      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: build-${{ github.sha }}
          path: .next
          retention-days: 3

      - name: Lighthouse CI
        run: npx @lhci/cli autorun
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_TOKEN }}

  e2e:
    runs-on: ubuntu-latest
    needs: quality
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - name: Install Playwright
        run: npx playwright install --with-deps chromium
      - name: Run E2E
        run: npm run test:e2e
        env:
          BASE_URL: http://localhost:3000
```

#### 1.6.2 Branch protection
En GitHub Settings > Branches > `main`:
- Require pull request with 1+ approval.
- Require status checks: `quality`, `e2e`.
- Require branches up-to-date before merge.
- Dismiss stale reviews on push.
- Restrict who can push to `main` (sólo admins del repo).

#### 1.6.3 Preview deploys
- Conectar repo a Vercel.
- Cada PR genera preview URL automática.
- Comentario en PR con link al preview.
- Comment con Lighthouse diff (via Vercel Speed Insights).

#### 1.6.4 Environment promotion
- 3 environments en Vercel: `development` (auto de PR), `staging` (push a `staging`), `production` (push a `main` + manual approval).
- DB separate por environment usando Supabase branches (en plan Team):
  ```bash
  supabase branch create staging-pr-42
  supabase branch create production
  ```

#### 1.6.5 DB migrations en CI
- Job separado para aplicar migraciones antes del deploy:
  ```yaml
  - name: Apply DB migrations
    run: npx supabase db push --linked
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
  ```

### Archivos a crear/modificar
```
.github/workflows/ci.yml                 [modificar]
.github/workflows/deploy-staging.yml     [nuevo opcional]
.github/workflows/deploy-production.yml  [nuevo opcional]
lighthouserc.json                        [nuevo]
.vercelignore                            [nuevo opcional]
```

### Criterios de aceptación
- Cada PR dispara CI que pasa lint+typecheck+unit+build+e2e.
- Preview URL se crea automáticamente en cada PR.
- Merge a `main` requiere 1 approval + todos los checks verdes.

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Supabase local no levanta en CI Ubuntu | Media | Alto | Pre-bake Docker images, usar `supabase db reset` en cada test run |
| next-pwa incompatibilidad con Next 14 | Media | Medio | Migrar a `@ducanh2912/next-pwa` si aparece error de build |
| Upstash Redis latencia desde Venezuela | Baja | Medio | Verificar Vercel edge region; fallback a in-memory ratelimit |
| Sentry wizard modifica next.config con side-effects | Alta | Bajo | Revisar diff antes de commiter; revertir config innecesaria |
| Coverage <80% por legacy sin tests | Media | Bajo | Excluir decorators/controllers del threshold; foco en `lib/` |
| Stripe test cards no funcionan en E2E | Baja | Medio | Usar `pm_card_visa` siempre, mock completo en integration |

---

## Dependencias con otras fases

- Fase 2 (E-commerce core) depende de: `inventory_items`, `stock_movements` (creados aquí).
- Fase 3 (Pagos) depende de: `rate-limit`, `turnstile`, `audit_logs`.
- Fase 4 (Logística) depende de: `stock_reservations` (creado aquí).
- Fase 6 (Admin) depende de: `get_admin_kpis()`, `audit_logs`.

Todas las fases siguientes dependen de CI/CD verde de esta Fase 1.

---

## Siguiente

[Fase 2 — E-Commerce Core](./02-ecommerce-core.md)
