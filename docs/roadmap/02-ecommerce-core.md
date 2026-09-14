# Fase 2 — E-Commerce Core

> **Duración estimada:** Semanas 4-7 (20 dev-days)
> **Dependencias:** Fase 1 (tablas `inventory_items`, `stock_movements`, `stock_reservations`, `coupons`, `reviews`, `wishlist`, funciones SQL)
> **Objetivo:** Construir las funcionalidades de e-commerce que diferencian a TuZonaMarket de un carrito básico: inventario multi-zona, búsqueda avanzada, productos con variantes/bundles, cupones y programa de fidelidad.

---

## Definition of Done

- [ ] Stock calculado por zona/bodega; el carrito bloquea productos sin stock en la zona del usuario
- [ ] Reservas de stock con TTL de 15 min durante checkout
- [ ] Alertas de stock bajo enviadas a admin (email + notificación in-app)
- [ ] Búsqueda full-text con Meilisearch (o Postgres FTS como fallback) con autocomplete y facets
- [ ] Productos con variantes (tamaño/color/sabor) y bundles/combos
- [ ] Reviews verificadas con fotos y moderación admin
- [ ] Wishlist migrada del frontend a tabla server
- [ ] Cupones funcionando en checkout (percent, fixed, free_shipping) con validación server-side
- [ ] Programa de fidelidad con puntos acumulables y canjeable en checkout
- [ ] Tests de integración cubriendo inventario, cupones y fidelidad

---

## 2.1 Inventario Multi-Zona / Multi-Bodega (5 dev-days)

### Contexto
El MVP tiene `products.stock_quantity` como un único entero global. TuZonaMarket opera en múltiples zonas (Carabobo, Valencia norte/sur, etc.) con bodegas físicas distintas. Un producto puede tener 50 unidades en Valencia norte y 0 en Valencia sur — el sistema debe reflejarlo.

### Tareas

#### 2.1.1 Migración de datos de `products.stock_quantity` a `inventory_items`
- Script `scripts/migrate-inventory.ts`:
  ```ts
  // Para cada producto existente, crear inventory_items por cada zona activa
  // con la cantidad actual de stock_quantity
  import { createClient } from '@supabase/supabase-js';
  // ... leer products, para cada uno leer zones, insertar inventory_items
  ```
- Mantener `products.stock_quantity` como **vista agregada** (deprecated, para backward compat):
  ```sql
  CREATE OR REPLACE VIEW products_with_stock AS
  SELECT p.*, COALESCE(SUM(i.quantity - i.reserved_quantity), 0) AS total_stock
  FROM products p
  LEFT JOIN inventory_items i ON i.product_id = p.id
  GROUP BY p.id;
  ```
- En el modelo Product de la API, leer de `inventory_items` filtrando por `zone_id`.

#### 2.1.2 Lógica de stock en el carrito
- Modificar `addItem` en `cartStore.ts` para:
  1. Consultar stock disponible en la zona seleccionada (vía API `/api/productos/[slug]/stock?zone_id=...`).
  2. Si no hay stock → no añadir, mostrar toast "No disponible en tu zona".
  3. Si stock < qty → limitar a `available` + banner "Stock limitado: quedan N".
- Nueva API route `app/api/productos/[slug]/stock/route.ts` (ya existe, expandir):
  ```ts
  // GET /api/productos/[slug]/stock?zone_id=uuid
  // Retorna { available: number, reserved: number, low_stock: boolean }
  ```

#### 2.1.3 Reservas de stock en checkout
- Al iniciar checkout (`POST /api/checkout/reserve`):
  - Para cada item del carrito, crear `stock_reservations` con `expires_at = now() + interval '15 minutes'`.
  - Incrementar `inventory_items.reserved_quantity`.
- Cron Supabase (o Vercel Cron) cada minuto ejecuta `cleanup_expired_reservations()`:
  - Las reservas expiradas se eliminan, `reserved_quantity` se decrementa.
- Al confirmar pago (webhook Stripe o confirmación PagoMóvil):
  - Llamar `deduct_stock(order_id)` que transaccionalmente:
    - Decrementa `inventory_items.quantity`.
    - Decrementa `reserved_quantity`.
    - Crea `stock_movements` con reason='order'.
    - Elimina las `stock_reservations` del carrito.

#### 2.1.4 Alertas de stock bajo
- Trigger SQL en `inventory_items` que dispara cuando `quantity <= low_stock_threshold`:
  ```sql
  CREATE OR REPLACE FUNCTION check_low_stock()
  RETURNS trigger AS $$
  BEGIN
    IF NEW.quantity <= NEW.low_stock_threshold AND (OLD IS NULL OR OLD.quantity > NEW.low_stock_threshold) THEN
      INSERT INTO notifications (user_id, type, title, body, link, metadata)
      SELECT u.id, 'stock.low',
        'Stock bajo: ' || p.name,
        'Quedan ' || NEW.quantity || ' unidades en ' || z.name,
        '/admin/productos/' || p.slug,
        jsonb_build_object('product_id', p.id, 'zone_id', z.id)
      FROM users u, products p, zones z
      WHERE u.role IN ('admin', 'manager', 'super_admin')
        AND p.id = NEW.product_id
        AND z.id = NEW.zone_id;
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  CREATE TRIGGER trg_low_stock
  AFTER UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION check_low_stock();
  ```
- Notificaciones in-app + envío async vía webhook externo (Resend email, ver Fase 5).
- Dashboard admin widget "Productos con stock bajo" (`components/admin/LowStockWidget.tsx`).

#### 2.1.5 Ajustes manuales y transferencias (admin)
- Página `app/(dashboard)/admin/inventario/page.tsx`:
  - Tabla por zona/warehouse con `<InventoryTable />` editable inline.
  - Botón "Ajustar stock" abre dialog: cantidad nueva + razón (adjustment, transfer, initial).
  - Cada ajuste crea `stock_movements` con `user_id` del admin.
- Botón "Transferir" abre dialog: origen (zona A warehouse), destino (zona B warehouse), cantidad.
  - Transacción: decrementa origen `quantity`, incrementa destino `quantity`, crea 2 `stock_movements` (+X, -X) con reason='transfer'.

### Archivos a crear/modificar
```
scripts/migrate-inventory.ts                              [nuevo]
supabase/migrations/
  00008_inventory_views.sql                               [nuevo]
  00009_low_stock_trigger.sql                             [nuevo]
  00010_delivery_slots.sql                                [nuevo — ver 2.1]
app/api/productos/[slug]/stock/route.ts                  [modificar — zone_id filter]
app/api/checkout/reserve/route.ts                        [nuevo]
app/api/checkout/cleanup/route.ts                        [nuevo — cron Vercel]
app/(dashboard)/admin/inventario/page.tsx                [nuevo]
components/admin/InventoryTable.tsx                        [nuevo]
components/admin/LowStockWidget.tsx                       [nuevo]
store/cartStore.ts                                        [modificar — zone-aware stock]
lib/api/inventory.ts                                      [nuevo]
types/inventory.ts                                       [nuevo]
```

### Criterios de aceptación
- Usuario en zona sin stock de un producto no puede añadirlo al carrito.
- Al añadir más del stock disponible, la cantidad se limita y muestra banner.
- Reserva de stock desaparece si el checkout se abandona >15 min.
- Stock real decrementa solo al confirmar pago.
- Admin ve widget de productos con stock bajo en el dashboard.

---

## 2.2 Búsqueda Avanzada (3 dev-days)

### Contexto
La API `/api/search` actual usa `ILIKE` en SQL — no es typo-tolerante, no soporta facets, no ordena por relevancia. Para un catálogo de >1000 productos, esto no escala.

### Tareas

#### 2.2.1 Opción A — Meilisearch Cloud (recomendado)
- Crear cuenta en meilisearch.com, obtener `MEILI_HOST` y `MEILI_MASTER_KEY`.
- Crear índice `products` con configuración:
  ```json
  {
    "searchableAttributes": ["name", "description", "sku", "brand_name"],
    "filterableAttributes": ["category_id", "zone_id", "is_offer", "brand_id", "price_usd"],
    "sortableAttributes": ["price_usd", "created_at", "name"],
    "rankingRules": ["words", "typo", "proximity", "attribute", "sort", "exactness"],
    "synonyms": {
      "harina": ["flour"],
      "leche": ["milk"]
    }
  }
  ```
- Sincronización Supabase → Meilisearch:
  - **Vía DB Webhooks** (Supabase): cuando `products` cambia (INSERT/UPDATE/DELETE), POST a endpoint `/api/webhooks/meili-sync` que actualiza el índice.
  - O **vía script inicial** + trigger SQL `pg_net` (más simple, menos infra):
    ```sql
    CREATE OR REPLACE FUNCTION sync_product_to_meili()
    RETURNS trigger AS $$
    DECLARE
      url text := 'https://<host>/indexes/products/documents?primaryKey=id';
      auth text := 'Bearer ' || current_setting('app.meili_key');
      payload jsonb;
    BEGIN
      payload := jsonb_build_object(
        'id', NEW.id,
        'name', NEW.name,
        'description', NEW.description,
        'sku', NEW.sku,
        'price_usd', NEW.price_usd,
        'category_id', NEW.category_id,
        'is_offer', NEW.is_offer,
        'is_active', NEW.is_active
      );
      PERFORM pg_net.http_post(url, payload,ARRAY[('Authorization', auth)]::http_header[]);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    ```
- API route `app/api/search/route.ts` Consulta Meili:
  ```ts
  import { MeiliSearch } from 'meilisearch';
  const client = new MeiliSearch({ host: process.env.MEILI_HOST!, apiKey: process.env.MEILI_SEARCH_KEY! });
  // GET /api/search?q=leche&page=1&hitsPerPage=20&filter=category_id='cat-123'
  const hits = await client.index('products').search(query, {
    filter: `is_active = true AND zone_id = ${zoneId}`,
    limit: 20,
    offset: (page - 1) * 20,
    showFacetDistribution: true
  });
  ```

#### 2.2.2 Opción B — Postgres Full-Text Search (fallback zero-cost)
Si el catálogo es <10k productos y no hay presupuesto para Meilisearch:
- Migración:
  ```sql
  ALTER TABLE products
    ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('spanish',
        coalesce(name,'') || ' ' ||
        coalesce(description,'') || ' ' ||
        coalesce(sku,'') || ' ' ||
        coalesce((SELECT name FROM brands WHERE id = products.brand_id), '')
      )
    ) STORED;
  CREATE INDEX idx_products_search ON products USING GIN(search_vector);

  -- Para fuzzy: añadir trigram index
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX idx_products_name_trgm ON products USING GIN(name gin_trgm_ops);
  ```
- API route reescrita:
  ```ts
  // Búsqueda: full-text + fuzzy fallback
  const { data } = await supabase.rpc('search_products', {
    p_query: query,
    p_zone_id: zoneId,
    p_limit: 20,
    p_offset: (page - 1) * 20
  });
  ```
  Con función SQL:
  ```sql
  CREATE OR REPLACE FUNCTION search_products(p_query text, p_zone_id uuid, p_limit int DEFAULT 20, p_offset int DEFAULT 0)
  RETURNS SETOF products AS $$
  BEGIN
    RETURN QUERY
    SELECT p.*
    FROM products p
    WHERE p.is_active = true
      AND (
        p.search_vector @@ websearch_to_tsquery('spanish', p_query)
        OR similarity(p.name, p_query) > 0.3
      )
    ORDER BY ts_rank(p.search_vector, websearch_to_tsquery('spanish', p_query)) DESC
    LIMIT p_limit OFFSET p_offset;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;
  ```

#### 2.2.3 Autocomplete en `SearchBar`
- New endpoint `app/api/search/autocomplete/route.ts`:
  - Meili: `.search(query, { limit: 5 })`.
  - Postgres: `SELECT name FROM products WHERE name ILIKE query || '%' LIMIT 5`.
- Componente `<SearchBar />` actualizado con debounce 300ms y dropdown de sugerencias.

#### 2.2.4 Facets en listado de productos
- Componente `<ProductFilters />` ya existe; expandir con facets dinámicas desde la API:
  - Marca, categoría, rango de precio, en oferta, con stock en zona.
- Cada facet es un filter server-side (no cliente filtering).

### Archivos a crear/modificar
```
lib/search/meili.ts                                      [nuevo — cliente Meili]
lib/search/pg.ts                                         [nuevo — cliente FTS]
app/api/search/route.ts                                  [modificar — Meili/PG]
app/api/search/autocomplete/route.ts                    [nuevo]
app/api/webhooks/meili-sync/route.ts                    [nuevo]
supabase/migrations/00011_fulltext_search.sql           [nuevo — si Opción B]
supabase/migrations/00011_meili_sync_trigger.sql        [nuevo — si Opción A]
components/product/SearchBar.tsx                        [modificar — autocomplete]
components/product/ProductFilters.tsx                    [modificar — facets dinámicas]
.env.example                                             [modificar — MEILI_*]
```

### Criterios de aceptación
- Buscar "leche entera" encuentra "Leche Entera 1L" aunque el usuario escriba "lech ent".
- Autocomplete muestra sugerencias en <200ms.
- Facets muestran count de cada opción (ej: Marca: Santa Teresa (12), Corimón (5)).
- Catálogo se reindexa en <5s al cambiar un producto.

---

## 2.3 Productos Avanzados (4 dev-days)

### Tareas

#### 2.3.1 Variantes de producto
- Tabla:
  ```sql
  CREATE TABLE product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name text NOT NULL,                      -- "1L", "Rojo", "Sabor Chocolate"
    attributes jsonb DEFAULT '{}'::jsonb,    -- { color: 'rojo', size: '1L' }
    sku text,                                -- SKU propio de la variante
    price_modifier numeric(10,2) DEFAULT 0,  -- +0.50 USD si más caro
    stock_quantity int DEFAULT 0,
    images jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    sort_order int DEFAULT 0,
    created_at timestamptz DEFAULT now()
  );
  CREATE INDEX idx_variants_product ON product_variants(product_id);
  ```
- Componente `<VariantSelector />` en `components/product/VariantSelector.tsx`:
  - Renderiza opciones por atributo (Color: ●Rojo ●Azul, Tamaño: 1L 2L).
  - Al seleccionar, actualiza precio, imagen y stock mostrado.
- API `GET /api/productos/[slug]` retorna `variants` array.
- Cart almacena `variant_id` además de `product_id`.

#### 2.3.2 Bundles / Combos
- Tablas:
  ```sql
  CREATE TABLE bundles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    description text,
    price_usd numeric(10,2) NOT NULL,         -- precio del bundle (vs suma individual)
    image_url text,
    is_active boolean DEFAULT true,
    valid_from timestamptz,
    valid_until timestamptz,
    created_at timestamptz DEFAULT now()
  );
  CREATE TABLE bundle_items (
    bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id),
    quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
    variant_id uuid REFERENCES product_variants(id),
    PRIMARY KEY (bundle_id, product_id)
  );
  ```
- Página `app/(public)/combos/page.tsx` lista bundles activos.
- "Añadir combo" al carrito mete el bundle como item con `bundle_id` (no variant/product).

#### 2.3.3 Productos relacionados
- Lógica server-side:
  - Manual: tabla `product_relations (product_id, related_id, type)`.
  - Automático: mismos `category_id` + `brand_id`, top 8 por ventas.
- Sección "Productos relacionados" en `ProductDetail.tsx`.

#### 2.3.4 Reviews con fotos
- Tabla `reviews` ya creada en Fase 1.
- Componente `<ReviewForm />` en `components/product/ReviewForm.tsx`:
  - Rating 1-5 estrellas.
  - Título + cuerpo (max 500 chars).
  - Upload de hasta 3 fotos (Supabase Storage path `reviews/<order_id>/<n>.webp`).
  - Solo disponible si `order_id` está delivered y no tiene review aún.
- Componente `<ReviewsList />` con paginación + filter por rating.
- Moderación admin en `app/(dashboard)/admin/reviews/page.tsx` (approve/reject con motivo).

#### 2.3.5 Wishlist migrada a server
- Tabla `wishlist` ya creada en Fase 1.
- Nueva API:
  - `POST /api/wishlist` con `{ product_id }` → añadir.
  - `DELETE /api/wishlist/[productId]` → eliminar.
  - `GET /api/wishlist` → lista paginada.
- Migración: al iniciar sesión, fusionar `wishlist` local (si exists en cliente) con server.
- Página `app/(customer)/favoritos/page.tsx` reescrita para leer de la API.

#### 2.3.6 Q&A (Question & Answer) estilo Amazon
- Tablas:
  ```sql
  CREATE TABLE product_questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id),
    question text NOT NULL,
    created_at timestamptz DEFAULT now(),
    is_approved boolean DEFAULT false
  );
  CREATE TABLE product_answers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES product_questions(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id),       -- cualquier usuario o admin
    answer text NOT NULL,
    is_official boolean DEFAULT false,       -- admin/brand
    created_at timestamptz DEFAULT now()
  );
  ```
- Componente `<QASection />` en la página de producto.
- Admin página `app/(dashboard)/admin/preguntas/page.tsx` para moderar.

#### 2.3.7 Comparador de productos (opcional)
- Página `app/(public)/comparar/page.tsx` con hasta 4 productos side-by-side.
- Parámetros: `?ids=uuid1,uuid2,uuid3`.
- Componente `<CompareTable />` con specs (precio, marca, categoría, attrs).

### Archivos a crear/modificar
```
supabase/migrations/00012_variants_bundles.sql           [nuevo]
supabase/migrations/00013_reviews_qa_wishlist.sql       [nuevo]
lib/api/products.ts                                      [modificar — variants, bundles]
lib/api/wishlist.ts                                      [nuevo]
lib/api/reviews.ts                                       [nuevo]
lib/api/questions.ts                                     [nuevo]
components/product/VariantSelector.tsx                   [nuevo]
components/product/ReviewForm.tsx                        [nuevo]
components/product/ReviewsList.tsx                        [nuevo]
components/product/QASection.tsx                          [nuevo]
components/product/CompareTable.tsx                       [nuevo opcional]
app/(public)/combos/page.tsx                             [nuevo]
app/(public)/comparar/page.tsx                           [nuevo opcional]
app/(customer)/favoritos/page.tsx                        [modificar — server data]
app/(dashboard)/admin/reviews/page.tsx                   [nuevo]
app/(dashboard)/admin/preguntas/page.tsx                [nuevo]
types/product.ts                                         [modificar — variant, bundle]
```

### Criterios de aceptación
- Producto con variantes muestra selector y actualiza precio/imagen al cambiar.
- Bundle se añade al carrito como item con descuento aplicado.
- Solo usuarios con orden delivered pueden dejar review de ese producto.
- Wishlist persiste server-side y se sincroniza al iniciar sesión.

---

## 2.4 Cupones y Promociones (4 dev-days)

### Contexto
Tabla `coupons` y `coupon_redemptions` ya creadas en Fase 1. Falta la lógica de aplicación y validación.

### Tareas

#### 2.4.1 Validación server-side de cupones
- API `POST /api/cupones/validate`:
  ```ts
  // Body: { code: string, cart_total: number, zone_id: uuid, user_id: uuid }
  // Response: { valid: boolean, discount: number, type: string, message?: string }
  ```
- Validaciones:
  - Existe, `is_active`, en fecha válida (`valid_from` ≤ now ≤ `valid_until`).
  - `max_uses` null o `used_count < max_uses`.
  - `min_order` ≤ `cart_total`.
  - `zone_id` null o == `zone_id` del carrito.
  - Usuario no lo ha usado ya (check `coupon_redemptions`).
- Si válido, retorna `{ discount: ..., type: ... }`.

#### 2.4.2 Aplicación en checkout
- Componente `<CouponInput />` en `components/checkout/CouponInput.tsx`:
  - Input + botón "Aplicar".
  - Llama a `POST /api/cupones/validate`.
  - Si válido, actualiza `OrderSummary` con descuento y lo guarda en `cartStore.coupon`.
- En `POST /api/ordenes` (crear orden):
  - Re-validar cupón server-side (no confiar en cliente).
  - Si válido, crear `coupon_redemptions` row + incrementar `used_count`.
  - Si el cupón era `free_shipping`, `delivery_fee_usd = 0`.
  - Si `percent`, `discount = subtotal * value / 100`.
  - Si `fixed`, `discount = min(value, subtotal)`.

#### 2.4.3 Admin CRUD de cupones
- Página `app/(dashboard)/admin/cupones/page.tsx`:
  - Tabla con listado (código, tipo, value, usados, estado, fechas).
  - Botón "Nuevo cupón" abre `<CouponForm />` con todos los campos.
  - Acciones: editar, desactivar, ver redenciones.
- Estadísticas por cupón: usados, revenue descontado, usuarios.

#### 2.4.4 Promociones automáticas
- Tabla:
  ```sql
  CREATE TABLE promotions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,                    -- "2x1 en lácteos"
    type text NOT NULL CHECK (type IN ('buy_x_get_y','category_discount','flash_sale')),
    config jsonb NOT NULL,                 -- { buy: 2, get: 1, category_id: '...' }
    zone_id uuid REFERENCES zones(id),
    starts_at timestamptz,
    ends_at timestamptz,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
  );
  ```
- Engine en `/api/carrito/calcular`:
  - Para cada item, evaluar promociones aplicables.
  - Si `buy_2_get_1`: cada 3 unidades del mismo producto, la más barata gratis.
  - Si `category_discount`: `X%` off a todos los productos de esa categoría.
  - Si `flash_sale`: aplicar discount por `X` minutos (timer en UI).
- Comparar cupón vs promoción: no acumulables salvo flag `stackable`.

### Archivos a crear/modificar
```
app/api/cupones/validate/route.ts                        [nuevo]
app/api/cupones/route.ts                                [nuevo — CRUD admin]
app/api/cupones/[id]/route.ts                           [nuevo]
app/api/promociones/route.ts                            [nuevo]
app/api/carrito/calcular/route.ts                       [nuevo]
app/(dashboard)/admin/cupones/page.tsx                 [nuevo]
components/admin/CouponForm.tsx                          [nuevo]
components/admin/CouponTable.tsx                         [nuevo]
components/checkout/CouponInput.tsx                     [nuevo]
components/checkout/PromoBanner.tsx                     [nuevo opcional]
store/cartStore.ts                                       [modificar — coupon state]
supabase/migrations/00014_promotions.sql                [nuevo]
lib/api/coupons.ts                                      [nuevo]
lib/api/promotions.ts                                   [nuevo]
types/coupon.ts                                         [nuevo]
```

### Criterios de aceptación
- Cupón `SAVE10` (10% off) aplicado en checkout reduce total correctamente.
- Cupón `FREESHIP` anula `delivery_fee`.
- Cupón expirado muestra error "Cupón expirado".
- Cupón con `max_uses` alcanzado muestra "Cupón agotado".
- Promoción 2x1 aplica automáticamente al añadir 3 unidades.

---

## 2.5 Programa de Fidelidad (4 dev-days)

### Contexto
Programa simple de puntos: 1% de compra acumula en puntos (1 punto = $0.01 USD), canjeable como descuento. Tier system opcional.

### Tareas

#### 2.5.1 Tablas de fidelidad
```sql
CREATE TABLE loyalty_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  points_balance int NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze','silver','gold','platinum')),
  total_spent numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id),
  points int NOT NULL,                    -- positivo = earned, negativo = redeemed
  reason text NOT NULL CHECK (reason IN ('order_earned','order_redeemed','expire','adjustment','welcome_bonus')),
  expires_at timestamptz,                  -- 12 meses desde earn
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_loyalty_tx_user ON loyalty_transactions(user_id, created_at DESC);

-- RLS
ALTER TABLE loyalty_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_self" ON loyalty_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "loyalty_admin_write" ON loyalty_accounts FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin')));

ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_tx_self_read" ON loyalty_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "loyalty_tx_admin_all" ON loyalty_transactions FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','super_admin')));
```

#### 2.5.2 Acumulación automática
- Trigger en `orders` cuando status = 'delivered':
  ```sql
  CREATE OR REPLACE FUNCTION award_loyalty_points()
  RETURNS trigger AS $$
  DECLARE
    points_to_earn int;
    multiplier numeric := 1.0;
  BEGIN
    IF NEW.status = 'delivered' AND (OLD IS NULL OR OLD.status <> 'delivered') THEN
      -- Determinar multiplier por tier actual
      SELECT CASE WHEN a.points_balance >= 10000 THEN 1.5 ELSE 1.0 END
      INTO multiplier FROM loyalty_accounts a WHERE a.user_id = NEW.user_id;

      points_to_earn := floor(NEW.total_usd * 100 * multiplier);  -- 1% = 1 punto/$

      INSERT INTO loyalty_transactions (user_id, order_id, points, reason, expires_at)
      VALUES (NEW.user_id, NEW.id, points_to_earn, 'order_earned', now() + interval '12 months');

      UPDATE loyalty_accounts
      SET points_balance = points_balance + points_to_earn,
          total_spent = total_spent + NEW.total_usd,
          tier = CASE
            WHEN total_spent >= 5000 THEN 'platinum'
            WHEN total_spent >= 1000 THEN 'gold'
            WHEN total_spent >= 200 THEN 'silver'
            ELSE 'bronze'
          END
      WHERE user_id = NEW.user_id;
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;
  ```

#### 2.5.3 Canje en checkout
- Componente `<LoyaltyRedeem />` en checkout:
  - Muestra balance actual y valor equivalente.
  - Input "Puntos a usar" (mín 0, máx.points_balance, máx 50% del total).
  - Actualiza `order_summary` con descuento por puntos.
- En `POST /api/ordenes`:
  - Si `points_to_redeem > 0`:
    - Validar balance del usuario.
    - Crear `loyalty_transactions` con puntos negativos, reason='order_redeemed'.
    - Decrementar `loyalty_accounts.points_balance`.
- Si orden se cancela, revertir puntos canjeados.

#### 2.5.4 Expiración de puntos
- Cron Supabase (pg_cron) ejecuta diariamente:
  ```sql
  SELECT cron.schedule(
    'expire_loyalty_points',
    '0 3 * * *',                          -- 3am diario
    $$ INSERT INTO loyalty_transactions (user_id, points, reason)
       SELECT user_id, -COALESCE(SUM(points), 0), 'expire'
       FROM loyalty_transactions
       WHERE expires_at < now() AND points > 0 AND expires_at IS NOT NULL
       GROUP BY user_id; $$
  );
  ```

#### 2.5.5 Página de fidelidad del usuario
- `app/(customer)/perfil/fidelidad/page.tsx`:
  - Widget balance: "Tienes 2,450 puntos = $24.50 USD".
  - Tier actual + progreso al siguiente ("Te faltan $250 para Silver").
  - Historial de transacciones con filtros.
  - Beneficios por tier explicados.

#### 2.5.6 Welcome bonus (opcional)
- Al registrarse, otorgar 500 puntos = $5 en primera compra.
- Configurable via settings (flag `welcome_bonus_enabled`, value).

### Archivos a crear/modificar
```
supabase/migrations/00015_loyalty.sql                    [nuevo]
supabase/migrations/00016_loyalty_triggers.sql          [nuevo]
lib/api/loyalty.ts                                      [nuevo]
components/checkout/LoyaltyRedeem.tsx                    [nuevo]
app/(customer)/perfil/fidelidad/page.tsx                [nuevo]
app/(customer)/perfil/page.tsx                          [modificar — link a fidelidad]
store/cartStore.ts                                       [modificar — points redeem]
app/api/ordenes/route.ts                                [modificar — loyalty redemption]
types/loyalty.ts                                        [nuevo]
```

### Criterios de aceptación
- Compra delivered otorga puntos automáticamente (1% del total).
- Tier Silver desbloquea 1.5x puntos en futuras compras.
- Usuario puede canjear puntos en checkout (máx 50% del total).
- Puntos expirados se descuentan automáticamente tras 12 meses.

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Meilisearch Cloud caída | Baja | Alto | Fallback a Postgres FTS, retry con backoff |
| Race condition en deduct_stock | Media | Alto | `SELECT ... FOR UPDATE` en inventory_items para bloqueo de fila |
| Cupón aplicado dos veces | Media | Medio | UNIQUE constraint en `coupon_redemptions (coupon_id, order_id)` |
| Variantes rompen carrito legacy | Media | Medio | Backward-compat: si product sin variantes, comportarse como antes |
| Migración de stock quantity → inventory_items pierde datos | Baja | Alto | Script idempotente + dry-run + backup previo |
| Puntos duplicados en retry webhook | Media | Medio | Idempotency check: si `order_id` ya tiene `loyalty_transactions`, no duplicar |

---

## Dependencias con otras fases

- **Fase 3** (Pagos): Al confirmar pago, trigger deduct_stock + award_loyalty_points.
- **Fase 4** (Logística): Asignación de rutas requiere `inventory_items.zone_id` para validar cobertura.
- **Fase 6** (Admin): Dashboard lee datos de `inventory_items`, `coupons`, `loyalty_accounts`.
- **Fase 7** (Infra): Cache de catálogo invalidado por cambios en `products` o `inventory_items`.

---

## Siguiente

[Fase 3 — Pagos Venezolanos Reales](./03-pagos-venezuela.md)
