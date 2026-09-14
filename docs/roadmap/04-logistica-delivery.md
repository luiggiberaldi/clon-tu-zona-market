# Fase 4 — Logística y Delivery Inteligente

> **Duración estimada:** Semanas 7-10 (18 dev-days)
> **Dependencias:** Fase 1 (PostGIS, Realtime), Fase 2 (zones/inventory), Fase 3 (COD en driver app)
> **Objetivo:** Convertir las páginas estáticas del repartidor en una app logística real con cobertura geográfica poligonal, asignación automática inteligente, tracking en tiempo real y horarios reales con capacidad.

---

## Definition of Done

- [ ] Polígonos de cobertura geográfica con PostGIS por zona
- [ ] Autocomplete de dirección en checkout con Nominatim/Google Places
- [ ] Validación: el punto está dentro de un polígono de cobertura
- [ ] Asignación automática de pedidos a repartidores (round-robin + proximity + carga)
- [ ] Optimización de rutas con OR-Tools (TSP)
- [ ] Tracking en tiempo real del repartidor en mapa (Realtime Supabase)
- [ ] Driver app: estado, cobrar COD, marcar entregado, registrar problema
- [ ] Horarios reales con capacidad por slot y bloqueo dinámico
- [ ] Geolocalización del driver cada 30s con polylines en mapa
- [ ] Cliente ve ETA actualizada y ubicación del repartidor

---

## 4.1 Cobertura Geográfica con PostGIS (4 dev-days)

### Contexto
Hoy la "zona" del MVP es una FK simple. En producción, la zona es un polígono geográfico (barrio, ciudad, parroquia). El cliente ingresa su dirección y el sistema valida automáticamente si está dentro de cobertura.

### Tareas

#### 4.1.1 Habilitar PostGIS en Supabase
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;  -- opcional
```

#### 4.1.2 Schema de zonas geográficas
```sql
ALTER TABLE zones
  ADD COLUMN coverage_polygon geography(Polygon, 4326),
  ADD COLUMN center_point geography(Point, 4326),
  ADD COLUMN radius_meters int,                -- alternativa al polígono: radio en metros
  ADD COLUMN estimated_delivery_minutes int DEFAULT 60;

CREATE INDEX idx_zones_polygon ON zones USING GIST(coverage_polygon);
CREATE INDEX idx_zones_center ON zones USING GIST(center_point);
```
- Tipos: `geography` usa lat/lng en SRID 4326 (WGS84, lo que devuelven todos los mapas).

#### 4.1.3 Editor de polígonos admin
- Página `app/(dashboard)/admin/zonas/[id]/mapa/page.tsx`:
  - Mapa Leaflet (`react-leaflet`).
  - Draw control (`leaflet-draw` o `react-leaflet-draw`).
  - Admin dibuja el polígono de cobertura sobre el mapa.
  - Guardar con `INSERT INTO zones (id, coverage_polygon) VALUES (?, ST_GeogFromGeoJSON(?))`.
- Alternativa para zonas redondas: input center + radius meters → `ST_Buffer(center_point, radius)`.

#### 4.1.4 Autocompletado de dirección
- Componente `<AddressAutocomplete />` en `components/checkout/AddressAutocomplete.tsx`:
  - **Opción A — Nominatim (OpenStreetMap, gratis)**:
    ```ts
    // Respetar políticas de uso (User-Agent, máximo 1 req/seg)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=ve&format=json&addressdetails=1`,
      { headers: { 'User-Agent': 'TuZonaMarket/1.0' } }
    );
    ```
  - **Opción B — Google Places Autocomplete**:
    ```tsx
    import { useLoadScript } from '@react-google-maps/api';
    // const { isLoaded } = useLoadScript({ googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!, libraries: ['places'] });
    // <PlacesAutocomplete onSelect={...}>
    ```
- Debounce 400ms, mostrar dropdown con direcciones formateadas + sus coords.
- Al seleccionar, store en `addressDraft` con `lat/lng`.

#### 4.1.5 Validación de cobertura
- API `POST /api/zonas/validar`:
  ```ts
  // Body: { lat: number, lng: number }
  // SQL:
  // SELECT id, name, estimated_delivery_minutes
  // FROM zones
  // WHERE is_active = true AND ST_Contains(coverage_polygon::geometry, ST_SetSRID(ST_MakePoint($2, $1), 4326))
  // LIMIT 1
  const { data } = await supabase.rpc('find_zone_for_point', { p_lat: lat, p_lng: lng });
  // Crea función SQL find_zone_for_point(p_lat, p_lng)
  return Response.json({ covered: data !== null, zone: data });
  ```
- En el checkout, al seleccionar dirección:
  - Si covered → autoselecciona zona y muestra ETA.
  - Si no covered → banner "Aún no cubrimos tu zona. Únete a la lista de espera" + email + dirección a `waitlist` table.

#### 4.1.6 Lista de espera
```sql
CREATE TABLE zone_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  address text,
  lat double precision,
  lng double precision,
  zone_id uuid REFERENCES zones(id),  -- zona más cercana donde quiere cobertura
  created_at timestamptz DEFAULT now(),
  notified boolean DEFAULT false       -- cuando admin lanza esa zona, marcar
);
```
- Marketing: cuando admin lanza zona nueva, email masivo a la waitlist filtrada.

### Archivos a crear/modificar
```
supabase/migrations/00023_postgis_zones.sql              [nuevo]
supabase/migrations/00024_find_zone_function.sql        [nuevo]
supabase/migrations/00025_waitlist.sql                  [nuevo]
lib/geo/                                              [nuevo — carpeta]
lib/geo/postgis.ts                                      [nuevo — helpers]
lib/geo/nominatim.ts                                    [nuevo]
lib/geo/google-places.ts                                [nuevo opcional]
app/api/zonas/validar/route.ts                         [nuevo]
app/api/zonas/[id]/polygon/route.ts                    [nuevo — guardar polygon]
app/(dashboard)/admin/zonas/[id]/mapa/page.tsx        [nuevo]
components/checkout/AddressAutocomplete.tsx            [nuevo]
components/checkout/CoverageBanner.tsx                  [nuevo]
.env.example                                            [modificar — NOMINATIM_USER_AGENT, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY opcional]
```

### Criterios de aceptación
- Admin dibuja polígono en Valencia Norte y guarda.
- Cliente ingresa dirección en Valencia Norte → sistema autodetecta zona y ETA.
- Cliente en zona sin cobertura → ver banner de lista de espera y poder registrarse.
- Query PostGIS devuelve en <50ms para una sola coordenada.

---

## 4.2 Asignación Automática de Repartidores (5 dev-days)

### Contexto
Actualmente asignar pedidos es manual. En producción, con cientos de pedidos diarios, debe ser automático con criterios inteligentes.

### Tareas

#### 4.2.1 Tablas de asignación
```sql
CREATE TABLE delivery_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES users(id),
  date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','optimized','in_progress','completed','cancelled')),
  optimized_order jsonb,                   -- array de { order_id, position, lat, lng }
  estimated_total_minutes int,
  estimated_total_distance_km numeric(8,2),
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_routes_driver_date ON delivery_routes(driver_id, date);
CREATE INDEX idx_routes_status ON delivery_routes(status);

CREATE TABLE route_stops (
  route_id uuid NOT NULL REFERENCES delivery_routes(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id),
  position int NOT NULL,                  -- 1, 2, 3...
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','arrived','completed','skipped','failed')),
  arrived_at timestamptz,
  completed_at timestamptz,
  skip_reason text,
  PRIMARY KEY (route_id, order_id)
);

ALTER TABLE orders ADD COLUMN route_id uuid REFERENCES delivery_routes(id);
```

#### 4.2.2 Algoritmo de asignación
- Página admin "Asignar rutas" (`app/(dashboard)/admin/rutas/asignar/page.tsx`):
  - Tabla de pedidos pendientes de hoy + lista de drivers activos.
  - **Auto-asignar** button.
- Lógica backend en `POST /api/rutas/asignar`:
  ```ts
  // lib/logistics/assign.ts
  interface AssignRequest {
    date: string;
    zone_id?: string;
  }

  export async function autoAssign(req: AssignRequest) {
    // 1. Recolectar orders pending de hoy con zona
    const orders = await getOrdersToAssign(req.date, req.zone_id);

    // 2. Recolectar drivers activos en su zona
    const drivers = await getAvailableDrivers(req.zone_id);

    // 3. Distribuir: round-robin + carga actual + proximidad
    // Score driver: load越小 mejor + distance al centroide de orders越小 mejor
    const assignments: Record<string, string[]> = {};  // driverId -> orderIds
    let i = 0;
    for (const order of orders) {
      // Ordenar drivers por (load_actual + distancia_a_dirección) asc
      const sortedDrivers = [...drivers].sort((a, b) => {
        const aLoad = assignments[a.id]?.length ?? 0;
        const bLoad = assignments[b.id]?.length ?? 0;
        // Añadir distancia euclidiana como tiebreaker
        return aLoad - bLoad;
      });
      const driver = sortedDrivers[i % sortedDrivers.length];
      assignments[driver.id] = assignments[driver.id] ?? [];
      assignments[driver.id].push(order.id);
      i++;
    }

    // 4. Crear delivery_routes + route_stops con position inicial 1..N
    for (const [driverId, orderIds] of Object.entries(assignments)) {
      const route = await createRoute(driverId, orderIds);
      // Optimizar orden de paradas con OR-Tools o nearest-neighbor (ver 4.2.3)
      const optimized = await optimizeRouteStops(driverId, orderIds);
      await updateRouteOptimizedOrder(route.id, optimized);
    }
  }
  ```

#### 4.2.3 Optimización de rutas con OR-Tools
- Instalar `or-tools` Vercel-compat: usar API REST de soluciones cloud, o wrapper WASM:
  ```bash
  npm i @svgdotjs/or-tools-wasm  # experimental
  # o usar backend propio en Python con Cloud Run
  ```
- Alternativa simple sin OR-Tools: nearest neighbor:
  ```ts
  // lib/logistics/route-optimize.ts
  function nearestNeighborTSP(startPoint: LatLng, stops: LatLng[]): LatLng[] {
    const unvisited = [...stops];
    const path: LatLng[] = [startPoint];
    let current = startPoint;
    while (unvisited.length > 0) {
      let minDist = Infinity;
      let nextIdx = 0;
      for (let i = 0; i < unvisited.length; i++) {
        const dist = haversineDistance(current, unvisited[i]);
        if (dist < minDist) { minDist = dist; nextIdx = i; }
      }
      current = unvisited[nextIdx];
      path.push(current);
      unvisited.splice(nextIdx, 1);
    }
    return path;
  }
  ```
- Calcular distance matrix con OSRM:
  ```ts
  // OSRM public API (gratuito, sin key)
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${lng},${lat};${...};?overview=full`);
  ```

#### 4.2.4 Asignación manual (override)
- Admin UI permite:
  - Drag pedidos entre drivers.
  - Reasignar pedido de un driver a otro.
  - Liberar driver (pedidos vuelven a cola general).

#### 4.2.5 Driver app
- Página `app/(dashboard)/repartidor/rutas/[routeId]/page.tsx`:
  - Mapa con todos los stops ordenados.
  - Lista de stops con dirección, monto, expected COD, productos.
  - Botón "Iniciar ruta" → driver.current_location update.
  - Botón por stop: "Llegué", "Entregado", "Cliente no estaba", "Dirección incorrecta".
- Browser Geolocation API:
  ```ts
  navigator.geolocation.getCurrentPosition((pos) => {...}, {enableHighAccuracy: true, maximumAge: 5000, timeout: 10000});
  ```

### Archivos a crear/modificar
```
supabase/migrations/00026_delivery_routes.sql            [nuevo]
lib/logistics/assign.ts                                  [nuevo]
lib/logistics/route-optimize.ts                          [nuevo]
lib/logistics/distance-matrix.ts                         [nuevo]
lib/geo/haversine.ts                                     [nuevo]
app/api/rutas/asignar/route.ts                          [nuevo]
app/api/rutas/[id]/route.ts                             [nuevo — detalles API]
app/(dashboard)/admin/rutas/asignar/page.tsx            [nuevo]
app/(dashboard)/admin/rutas/[id]/page.tsx              [nuevo — ver/editar]
app/(dashboard)/repartidor/rutas/[routeId]/page.tsx     [nuevo]
components/admin/RouteAssignmentBoard.tsx                [nuevo]
components/driver/RouteMap.tsx                           [nuevo]
components/driver/StopCard.tsx                            [nuevo]
types/delivery.ts                                        [nuevo]
```

### Criterios de aceptación
- Admin auto-asigna 20 pedidos a 4 drivers en <2s.
- Cada driver recibe 5 stops optimizadas por nearest-neighbor.
- Driver puede iniciar ruta y marcar stops individually.
- Reasignación manual funciona con drag-drop o select.

---

## 4.3 Tracking en Tiempo Real (4 dev-days)

### Contexto
El cliente quiere ver dónde está el repartidor y cuánto falta. El driver necesita mandar su ubicación. Supabase Realtime permite tanto broadcast como postgres changes sin infra propia.

### Tareas

#### 4.3.1 Tabla de ubicación de driver
```sql
CREATE TABLE driver_locations (
  driver_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  heading double precision,                -- grados del movimiento
  speed_kmph numeric(6,2),
  battery_level int,                        -- 0-100 para detectar drivers que desaparecen
  is_online boolean DEFAULT true,
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Histórico de ubicaciones (polylines para el mapa)
CREATE TABLE driver_location_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES users(id),
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  logged_at timestamptz DEFAULT now()
);
CREATE INDEX idx_history_driver_time ON driver_location_history(driver_id, logged_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE driver_locations;
```

#### 4.3.2 Driver envía ubicación
- En la app del driver:
  ```ts
  // Hook useDriverTracker
  'use client';
  import { createBrowserSupabase } from '@/lib/supabase/client';

  export function useDriverTracking() {
    const supabase = createBrowserSupabase();
    let intervalId: ReturnType<typeof setInterval> | null;

    const start = () => {
      navigator.geolocation.watchPosition(
        async (pos) => {
          await supabase.from('driver_locations').upsert({
            driver_id: currentDriverId,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            heading: pos.coords.heading,
            speed_kmph: pos.coords.speed * 3.6,
            last_seen: new Date().toISOString(),
            is_online: true
          }, { onConflict: 'driver_id' });

          // Cada 30s guardar histórico
          if (Date.now() - lastHistTimestamp > 30000) {
            await supabase.from('driver_location_history').insert({ driver_id: currentDriverId, latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            lastHistTimestamp = Date.now();
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );

      intervalId = setInterval(() => {
        const now = Date.now();
        // Si no se ha enviado en 90s, marcar offline
      }, 30000);
    };
    return { start, stop: () => {} } };
  ```
- Optimización: el navegador limita background geolocation. Funciona si la PWA está visible o si el permiso es `geolocation:always`.

#### 4.3.3 Cliente ve tracking
- Página `app/(customer)/mis-pedidos/[id]/rastrear/page.tsx`:
  - Mapa Leaflet con marcador del driver.
  - Polylinea del histórico (últimos 30 min).
  - ETA actualizado dinámicamente con OSRM:
    ```ts
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${driverLng},${driverLat};${destLng},${destLat}`);
    const data = await res.json();
    const etaMin = data.routes[0].duration / 60;
    ```
- Suscripción Supabase Realtime:
  ```ts
  supabase
    .channel(`driver:${driverId}`)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` },
      (payload) => updateMarkerPosition(payload.new)
    )
    .subscribe();
  ```

#### 4.3.4 Notificaciones automáticas por estado
- En el driver app, botones están ligados a triggers en `orders`:
  - "Llegué" → `order.status = 'arrived'`, notifica cliente por email + push.
  - "Entregado" → `order.status = 'delivered'`, comprobante COD si aplica, SMS survey.
- Triggers SQL para inserts en `notifications` (ver Fase 5 para delivery channels).

#### 4.3.5 Driver app PWA
- Repartidor instala la PWA en su móvil (Add to Home Screen).
- Persiste con offline support para zonas sin buena cobertura celular.
- Background location service si `Permissions-Policy: geolocation=(self)` y permiso dado.

### Archivos a crear/modificar
```
supabase/migrations/00027_driver_locations.sql            [nuevo]
app/(customer)/mis-pedidos/[id]/rastrear/page.tsx        [nuevo]
components/customer/DeliveryTracking.tsx                  [nuevo]
app/(dashboard)/repartidor/rutas/[routeId]/page.tsx     [modificar — tracker setup]
lib/hooks/useDriverTracking.ts                           [nuevo]
lib/hooks/useCustomerTracking.ts                         [nuevo — Realtime subscribe]
lib/geo/osrm.ts                                          [nuevo]
```

### Criterios de aceptación
- Cliente ve marcador del driver moviéndose en tiempo real (<5s delay).
- Polylinea muestra recorrido parcial.
- ETA recalculada cada 60s.
- Driver cierra app, su estado pasa `is_online=false` en 90s (heartbeat check).

---

## 4.4 Ventanas de Horario Reales con Capacidad (3 dev-days)

### Contexto
El MVP tiene un seleccionador de horarios sin sentido de capacidad. En producción, cada slot tiene un límite de órdenes (basado en drivers disponibles) y se cierra automáticamente al llenarse.

### Tareas

#### 4.4.1 Tabla de slots
```sql
CREATE TABLE delivery_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES zones(id),
  date date NOT NULL,
  start_time time NOT NULL,                -- '08:00'
  end_time time NOT NULL,                   -- '10:00'
  max_orders int NOT NULL DEFAULT 20,
  current_orders int NOT NULL DEFAULT 0,    -- incrementado por reservas
  is_closed boolean DEFAULT false,         -- admin override o feriados
  is_driver_shortage boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_slots_date_zone ON delivery_slots(date, zone_id);
CREATE UNIQUE INDEX idx_slots_unique ON delivery_slots(zone_id, date, start_time, end_time);

ALTER PUBLICATION supabase_realtime ADD TABLE delivery_slots;
```

#### 4.4.2 Generación programática de slots
- Cron Supabase diario genera slots para los próximos 14 días:
  ```sql
  CREATE OR REPLACE FUNCTION generate_slots_for_date(p_date date)
  RETURNS void AS $$
  DECLARE
    zone RECORD;
    schedule jsonb;
  BEGIN
    FOR zone IN SELECT id, COALESCE(slot_schedule, '["08-10","10-12","14-16","16-18"]'::jsonb) FROM zones WHERE is_active LOOP
      FOR s IN SELECT * FROM jsonb_array_elements(schedule) LOOP
        INSERT INTO delivery_slots (zone_id, date, start_time, end_time, max_orders)
        VALUES (zone.id, p_date, split_part(s#>>'{}','-',1), split_part(s#>>'{}','-',2), 20)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;
  ```
- Scheduler:
  ```sql
  SELECT cron.schedule('generate_slots_daily', '0 22 * * *',  $$ SELECT generate_slots_for_date(CURRENT_DATE + interval '14 days'); $$);
  ```

#### 4.4.3 Reserva y liberación de slots
- En checkout:
  - `PATCH /api/slots/[id]/reserve` decrements `current_orders`.
  - Si `current_orders = max_orders` → endpoint retorna 409 "Slot lleno".
  - Si slot es hoy y `start_time` está a <2h de ahora → no permitido.
- En orden cancelled → liberar slot.

#### 4.4.4 Realtime en checkout
- Suscripción Supabase:
  ```ts
  supabase
    .channel('slots')
    .on('postgres_changes', { event: '*', table: 'delivery_slots', filter: `zone_id=eq.${zoneId}` }, () => refetchSlots())
    .subscribe();
  ```
- Si alguien más agarra el último slot mientras tú estás, ese slot aparece deshabilitado instantáneamente.

#### 4.4.5 Cerrar slots por feriado
- Tabla `holidays` para Venezuela (carabobo nacional + regionales):
  ```sql
  CREATE TABLE holidays (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    date date NOT NULL UNIQUE,
    name text NOT NULL,                      -- 'Día de la Independencia'
    applies_nationally boolean DEFAULT true,
    zone_id uuid REFERENCES zones(id),      -- NULL si nacional
    created_at timestamptz DEFAULT now()
  );
  ```
- Al generar slots, marcar `is_closed = true` si la fecha es feriado para la zona.

### Archivos a crear/modificar
```
supabase/migrations/00028_delivery_slots.sql              [nuevo]
supabase/migrations/00029_holidays.sql                    [nuevo]
app/api/slots/route.ts                                    [nuevo]
app/api/slots/[id]/reserve/route.ts                      [nuevo]
components/checkout/TimeSlotPicker.tsx                    [modificar — capacidad Realtime]
app/(dashboard)/admin/slots/page.tsx                     [nuevo — editar slots]
```

### Criterios de aceptación
- Slots se generan automáticamente 14 días al futuro.
- Sin slots disponibles para hoy < 2h desde ahora.
- Slot lleno (20 órdenes) aparece grisADO y no seleccionable en tiempo real.

---

## 4.5 Geolocalización Avanzada (2 dev-days)

### Tareas

#### 4.5.1 Optimizaciones del intervalo de tracking
- Mover tracking a 60s si la velocidad baja (posiblemente el driver está detenido).
- Speed > 20 km/h → tracking a 10s (en movimiento).
- Battery < 20% → tracking a 90s (preservar batería).

#### 4.5.2 Heatmap de coverage admin
- Página `app/(dashboard)/admin/mapa-calor/page.tsx`:
  - Visualizar densidad de entregas por zona en los últimos 30 días.
  - Leaflet + Heatmap layer.
- Identificar zonas alta/baja demanda para decisiones de expansión.

#### 4.5.3 Detección de driver perdido
- Si un driver no envía ubicación en 5 min, se le manda notificación push "¿Sigues en ruta?".
- Si en 10 min sin respuesta, se asigna sus stops restantes a otros drivers automáticamente.

### Archivos a crear/modificar
```
lib/hooks/useDriverTracking.ts                           [modificar — adaptative interval]
app/(dashboard)/admin/mapa-calor/page.tsx                [nuevo]
components/admin/DeliveryHeatmap.tsx                      [nuevo]
app/api/admin/drivers/health-check/route.ts             [nuevo — triggers notify]
```

### Criterios de aceptación
- Driver estacionado consume menos batería (interval 60s).
- Admin ve heatmap con zonas hot.
- Driver con 5 min silencioso recibe push, a 10 min se reasigna.

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Nominatim rate limit (1 req/s) sin cuenta | Alta | Alto | Cache responses in Redis 24h; throttle client-side |
| PostGIS query lenta con muchos polígonos | Baja | Medio | GIST index + spatial clustering; cache por zona activa |
| Mobile browser bloquea background GPS | Alta | Alto | Documentar "mantener app abierta"; usar Foreground Service en Android PWA wrapper |
| OR-Tools no corre en Vercel edge | Media | Medio | Self-host OR-Tools en servicio Cloud Run (Python) llamado por HTTP |
| Driver location stream frágil en 2G venezolano | Alta | Medio | Compresión (sólo deltas de coords), retry con backoff |
| Race condition en slot reserve | Media | Medio | SELECT FOR UPDATE + retries |
| Supabase Realtime Sobrecarga con muchos connections | Baja | Medio | Hacer refresh de polling cada 30s si >1000 usuarios concurrentes |

---

## Dependencias con otras fases

- **Fase 5** (UX): Notificaciones de estado al cliente, ETA display, mapa tracking UI.
- **Fase 6** (Admin): Dashboard KPIs basado en delivery_routes y stops.
- **Fase 8** (Operación): Runbook para "driver no reporta ubicación", "cliente no recibe".

---

## Siguiente

[Fase 5 — Experiencia Premium del Cliente](./05-ux-premium.md)
