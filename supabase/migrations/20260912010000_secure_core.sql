-- Secure, single-merchant CORE upgrade. Apply after 20260912000000_initial.sql.
-- Existing records are preserved. No extension or remote service is required.
BEGIN;

ALTER TABLE public.orders
  ADD COLUMN address_snapshot jsonb,
  ADD COLUMN exchange_rate numeric,
  ADD COLUMN payment_instructions text,
  ADD COLUMN payment_currency text CHECK (payment_currency IN ('USD', 'VES')),
  ADD COLUMN idempotency_key uuid,
  ADD COLUMN request_hash text,
  ADD COLUMN reservation_expires_at timestamptz,
  ADD COLUMN stock_released boolean NOT NULL DEFAULT false,
  ADD COLUMN inventory_reserved boolean NOT NULL DEFAULT false;
-- Legacy orders have unknown reservation history and must never manufacture stock.
CREATE UNIQUE INDEX orders_user_idempotency_key
  ON public.orders(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX orders_reservation_expiry
  ON public.orders(reservation_expires_at)
  WHERE status = 'pending' AND payment_status = 'pending' AND NOT stock_released;
CREATE INDEX orders_slot_capacity ON public.orders(delivery_date, time_slot_start)
  WHERE status <> 'cancelled';
CREATE INDEX orders_driver ON public.orders(driver_id) WHERE driver_id IS NOT NULL;
ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_core_quantity
  CHECK (quantity BETWEEN 1 AND 99) NOT VALID;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_core_quantity
  CHECK (quantity BETWEEN 1 AND 99) NOT VALID;

CREATE TABLE public.payment_methods (
  id text PRIMARY KEY CHECK (id IN ('cash', 'pagomovil', 'transfer')),
  label text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  currency text NOT NULL CHECK (currency IN ('USD', 'VES')),
  CONSTRAINT enabled_payment_instructions CHECK (NOT enabled OR length(btrim(instructions)) > 0)
);
INSERT INTO public.payment_methods (id, label, currency) VALUES
  ('cash', 'Cash', 'USD'), ('pagomovil', 'Pago Movil', 'VES'), ('transfer', 'Bank transfer', 'VES');

CREATE TABLE public.manual_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,
  reference text NOT NULL CHECK (length(btrim(reference)) BETWEEN 6 AND 100),
  normalized_reference text GENERATED ALWAYS AS
    (upper(regexp_replace(reference, '[^a-zA-Z0-9]', '', 'g'))) STORED,
  payment_method text NOT NULL REFERENCES public.payment_methods(id),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (payment_method <> 'cash'),
  CHECK (length(normalized_reference) BETWEEN 6 AND 100),
  UNIQUE (payment_method, normalized_reference)
);
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity <> 0),
  movement_type text NOT NULL CHECK (movement_type IN ('order_reserved', 'order_released', 'adjustment')),
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, product_id, movement_type)
);
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX outbox_pending ON public.outbox(created_at) WHERE status = 'pending';

-- Preserve the actual exchange-rate value and timestamp: the stale legacy default
-- intentionally cannot authorize a purchase. Operators must publish a fresh rate.
UPDATE public.settings
SET value = '{"slot_capacity":20,"lead_minutes":60,"horizon_days":7}'::jsonb || value
WHERE key = 'delivery_hours';

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin');
$$;
CREATE OR REPLACE FUNCTION public.is_driver()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'driver');
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Profiles are provisioned by the authentication service' USING ERRCODE = '42501';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.role IS DISTINCT FROM OLD.role OR NEW.is_prime IS DISTINCT FROM OLD.is_prime
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Only a trusted server operation may change protected profile fields'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_profile_privileges BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();

CREATE OR REPLACE FUNCTION public.provision_customer_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  INSERT INTO public.users(id, email, full_name, phone, role, is_prime)
  VALUES (NEW.id, coalesce(NEW.email, NEW.id::text || '@phone.invalid'),
          left(nullif(NEW.raw_user_meta_data->>'full_name', ''), 255),
          left(coalesce(NEW.phone, NEW.raw_user_meta_data->>'phone'), 20), 'customer', false)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER provision_customer_profile AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.provision_customer_profile();
INSERT INTO public.users(id, email, full_name, phone, role, is_prime)
SELECT u.id, coalesce(u.email, u.id::text || '@phone.invalid'),
       left(nullif(u.raw_user_meta_data->>'full_name', ''), 255),
       left(coalesce(u.phone, u.raw_user_meta_data->>'phone'), 20), 'customer', false
FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.users p WHERE p.id = u.id)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS varchar LANGUAGE sql VOLATILE
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT 'TZ' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 18));
$$;

-- Replace the baseline policies, including self-editable roles, client-created
-- orders, unrestricted inactive catalog reads and vendor-wide product writes.
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view own addresses" ON public.addresses;
DROP POLICY IF EXISTS "Users can manage own addresses" ON public.addresses;
DROP POLICY IF EXISTS "Users can view own cart" ON public.cart_items;
DROP POLICY IF EXISTS "Users can manage own cart" ON public.cart_items;
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view own order items" ON public.order_items;
DROP POLICY IF EXISTS "Anyone can view products" ON public.products;
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "Anyone can view categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Anyone can view states" ON public.states;
DROP POLICY IF EXISTS "Anyone can view cities" ON public.cities;
DROP POLICY IF EXISTS "Anyone can view areas" ON public.areas;

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_read ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());
CREATE POLICY users_update_self ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY orders_read ON public.orders FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin()
    OR (driver_id = auth.uid() AND public.is_driver()));
CREATE POLICY addresses_read ON public.addresses FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR EXISTS (
    SELECT 1 FROM public.orders o WHERE o.address_id = addresses.id
      AND o.driver_id = auth.uid() AND public.is_driver()
      AND o.status IN ('confirmed', 'preparing', 'on_way')
  ));
CREATE POLICY addresses_insert_self ON public.addresses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY addresses_update_self ON public.addresses FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY addresses_delete_self ON public.addresses FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY cart_self ON public.cart_items FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY order_items_read ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id));
CREATE POLICY products_public_active ON public.products FOR SELECT TO anon, authenticated
  USING (is_active = true);
CREATE POLICY products_admin_read ON public.products FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY categories_public_active ON public.categories FOR SELECT TO anon, authenticated
  USING (is_active = true);
CREATE POLICY categories_admin_read ON public.categories FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY states_public_active ON public.states FOR SELECT TO anon, authenticated
  USING (is_active = true);
CREATE POLICY states_admin_read ON public.states FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY cities_public_active ON public.cities FOR SELECT TO anon, authenticated
  USING (is_active = true AND EXISTS (SELECT 1 FROM public.states s WHERE s.id = cities.state_id AND s.is_active));
CREATE POLICY cities_admin_read ON public.cities FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY areas_public_active ON public.areas FOR SELECT TO anon, authenticated
  USING (is_active = true AND EXISTS (SELECT 1 FROM public.cities c
    JOIN public.states s ON s.id = c.state_id
    WHERE c.id = areas.city_id AND c.is_active AND s.is_active));
CREATE POLICY areas_admin_read ON public.areas FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY settings_public_config ON public.settings FOR SELECT TO anon, authenticated
  USING (key IN ('exchange_rate', 'delivery_hours', 'store_brand', 'store_features'));
CREATE POLICY settings_admin_read ON public.settings FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY payment_methods_public_read ON public.payment_methods FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY manual_payments_read ON public.manual_payments FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.orders o
    WHERE o.id = manual_payments.order_id AND o.user_id = auth.uid()));
CREATE POLICY stock_movements_admin_read ON public.stock_movements FOR SELECT TO authenticated
  USING (public.is_admin());
-- audit_log and outbox intentionally have no client policies.

REVOKE ALL ON public.users, public.addresses, public.cart_items, public.orders,
  public.order_items, public.products, public.categories, public.states, public.cities,
  public.areas, public.settings, public.payment_methods, public.manual_payments,
  public.stock_movements, public.audit_log, public.outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.products, public.categories, public.states, public.cities,
  public.areas, public.settings, public.payment_methods TO anon, authenticated;
GRANT SELECT ON public.users, public.addresses, public.cart_items, public.orders,
  public.order_items, public.manual_payments, public.stock_movements TO authenticated;
GRANT UPDATE (full_name, phone, avatar_url) ON public.users TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.addresses, public.cart_items TO authenticated;
GRANT ALL ON public.users, public.addresses, public.cart_items, public.orders,
  public.order_items, public.products, public.categories, public.states, public.cities,
  public.areas, public.settings, public.payment_methods, public.manual_payments,
  public.stock_movements, public.audit_log, public.outbox TO service_role;

-- Internal helpers are deliberately not exposed as client RPCs.
CREATE FUNCTION public.core_order_items(p_items jsonb)
RETURNS TABLE(product_id uuid, quantity integer) LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_item jsonb;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid;
  v_quantity numeric;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Items must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'An order must contain 1 to 100 item lines' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item->'product_id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number'
       OR (v_item->>'quantity') !~ '^[0-9]{1,2}$' THEN
      RAISE EXCEPTION 'Each item requires a product UUID and integer quantity from 1 to 99'
        USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Invalid product UUID or quantity' USING ERRCODE = '22023';
    END;
    IF v_quantity NOT BETWEEN 1 AND 99 OR v_id = ANY(v_ids) THEN
      RAISE EXCEPTION 'Duplicate products or invalid item quantity' USING ERRCODE = '22023';
    END IF;
    v_ids := array_append(v_ids, v_id);
  END LOOP;
  RETURN QUERY SELECT (i.value->>'product_id')::uuid, (i.value->>'quantity')::integer
    FROM jsonb_array_elements(p_items) i ORDER BY (i.value->>'product_id')::uuid;
END;
$$;

CREATE FUNCTION public.core_record_event(p_order_id uuid, p_action text, p_actor_id uuid, p_details jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  INSERT INTO public.audit_log(order_id, actor_id, action, details)
  VALUES (p_order_id, p_actor_id, p_action, coalesce(p_details, '{}'::jsonb));
  INSERT INTO public.outbox(event_type, aggregate_id, payload)
  VALUES (p_action, p_order_id, jsonb_build_object('order_id', p_order_id)
    || coalesce(p_details, '{}'::jsonb));
END;
$$;

CREATE FUNCTION public.core_release_order_stock(p_order_id uuid, p_actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item record;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = '22023';
  END IF;
  IF v_order.stock_released THEN RETURN; END IF;
  IF v_order.inventory_reserved THEN
    PERFORM p.id FROM public.products p
      WHERE p.id IN (SELECT i.product_id FROM public.order_items i WHERE i.order_id = p_order_id)
      ORDER BY p.id FOR UPDATE;
    FOR v_item IN SELECT product_id, sum(quantity)::integer AS quantity
      FROM public.order_items WHERE order_id = p_order_id GROUP BY product_id ORDER BY product_id
    LOOP
      UPDATE public.products SET stock_quantity = stock_quantity + v_item.quantity
        WHERE id = v_item.product_id;
      INSERT INTO public.stock_movements(product_id, order_id, quantity, movement_type, actor_id)
      VALUES (v_item.product_id, p_order_id, v_item.quantity, 'order_released', p_actor_id);
    END LOOP;
  END IF;
  UPDATE public.orders SET stock_released = true, reservation_expires_at = NULL WHERE id = p_order_id;
END;
$$;

CREATE FUNCTION public.quote_order(
  p_items jsonb, p_address_id uuid, p_delivery_date date DEFAULT NULL,
  p_time_slot_start time DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item record;
  v_product public.products%ROWTYPE;
  v_items jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_unit numeric;
  v_total numeric;
  v_fee numeric;
  v_minimum numeric;
  v_rate numeric;
  v_rate_at timestamptz;
  v_config jsonb;
  v_hours jsonb;
  v_start time;
  v_end time;
  v_cutoff time;
  v_slot_end time;
  v_capacity integer;
  v_lead integer;
  v_horizon integer;
  v_local_now timestamp := statement_timestamp() AT TIME ZONE 'America/Caracas';
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_address_id IS NULL THEN RAISE EXCEPTION 'An address is required' USING ERRCODE = '22023'; END IF;
  SELECT c.delivery_fee_usd, c.min_order_usd INTO v_fee, v_minimum
    FROM public.addresses a JOIN public.areas ar ON ar.id = a.area_id
    JOIN public.cities c ON c.id = ar.city_id JOIN public.states s ON s.id = c.state_id
    WHERE a.id = p_address_id AND a.user_id = v_uid AND ar.is_active AND c.is_active AND s.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Address is not owned by you or is outside active coverage' USING ERRCODE = '22023'; END IF;
  IF v_fee IS NULL OR v_minimum IS NULL OR v_fee < 0 OR v_minimum < 0
     OR v_fee = 'NaN'::numeric OR v_minimum = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Delivery pricing is not configured' USING ERRCODE = '22023';
  END IF;
  SELECT value INTO v_config FROM public.settings WHERE key = 'exchange_rate';
  IF v_config IS NULL OR jsonb_typeof(v_config->'usd_to_ves') IS DISTINCT FROM 'number'
    OR jsonb_typeof(v_config->'updated_at') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'A fresh exchange rate is required' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_rate := (v_config->>'usd_to_ves')::numeric;
    v_rate_at := (v_config->>'updated_at')::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Invalid exchange-rate configuration' USING ERRCODE = '22023';
  END;
  IF v_rate IS NULL OR v_rate <= 0 OR v_rate = 'NaN'::numeric OR v_rate_at IS NULL
     OR v_rate_at < statement_timestamp() - interval '24 hours' OR v_rate_at > statement_timestamp() THEN
    RAISE EXCEPTION 'The exchange rate must be positive and updated within the last 24 hours' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT * FROM public.core_order_items(p_items) LOOP
    SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'A product is unavailable' USING ERRCODE = '22023'; END IF;
    IF v_product.stock_quantity IS NULL OR v_product.stock_quantity < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product %', v_product.id USING ERRCODE = '22023';
    END IF;
    IF v_product.price_usd IS NULL OR v_product.price_usd < 0 OR v_product.price_usd = 'NaN'::numeric THEN
      RAISE EXCEPTION 'Invalid product price' USING ERRCODE = '22023';
    END IF;
    v_unit := round(v_product.price_usd *
      (100 - CASE WHEN v_product.is_offer THEN coalesce(v_product.offer_percentage, 0) ELSE 0 END) / 100, 2);
    v_subtotal := v_subtotal + v_unit * v_item.quantity;
    v_items := v_items || jsonb_build_array(jsonb_build_object('product_id', v_product.id,
      'name', v_product.name, 'quantity', v_item.quantity, 'unit_price_usd', v_unit,
      'total_usd', round(v_unit * v_item.quantity, 2)));
  END LOOP;
  v_subtotal := round(v_subtotal, 2);
  IF v_subtotal < v_minimum THEN
    RAISE EXCEPTION 'The minimum order subtotal is % USD', v_minimum USING ERRCODE = '22023';
  END IF;
  v_total := round(v_subtotal + v_fee, 2);
  v_result := jsonb_build_object('items', v_items, 'subtotal_usd', v_subtotal,
    'delivery_fee_usd', round(v_fee, 2), 'total_usd', v_total,
    'total_ves', round(v_total * v_rate, 2), 'exchange_rate', v_rate,
    'rate_updated_at', v_rate_at, 'min_order_usd', v_minimum);
  IF p_delivery_date IS NOT NULL OR p_time_slot_start IS NOT NULL THEN
    IF p_delivery_date IS NULL OR p_time_slot_start IS NULL THEN
      RAISE EXCEPTION 'Delivery date and slot must be supplied together' USING ERRCODE = '22023';
    END IF;
    SELECT value INTO v_hours FROM public.settings WHERE key = 'delivery_hours';
    IF v_hours IS NULL THEN RAISE EXCEPTION 'Delivery hours are not configured' USING ERRCODE = '22023'; END IF;
    BEGIN
      v_start := (v_hours->>'start')::time;
      v_end := (v_hours->>'end')::time;
      v_cutoff := (v_hours->>'cutoff_time')::time;
      v_capacity := coalesce((v_hours->>'slot_capacity')::integer, 20);
      v_lead := coalesce((v_hours->>'lead_minutes')::integer, 60);
      v_horizon := coalesce((v_hours->>'horizon_days')::integer, 7);
    EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Invalid delivery-hours configuration' USING ERRCODE = '22023';
    END;
    IF v_start IS NULL OR v_end IS NULL OR v_cutoff IS NULL OR v_start >= v_end
      OR v_end - v_start < interval '2 hours' OR v_capacity < 1
      OR v_lead < 0 OR v_horizon NOT BETWEEN 1 AND 7 THEN
      RAISE EXCEPTION 'Invalid delivery-hours configuration' USING ERRCODE = '22023';
    END IF;
    IF p_delivery_date < v_local_now::date OR p_delivery_date > v_local_now::date + v_horizon THEN
      RAISE EXCEPTION 'Delivery date is outside the booking horizon' USING ERRCODE = '22023';
    END IF;
    IF p_delivery_date + p_time_slot_start < v_local_now + make_interval(mins => v_lead) THEN
      RAISE EXCEPTION 'The delivery slot does not meet the minimum lead time' USING ERRCODE = '22023';
    END IF;
    IF p_delivery_date = v_local_now::date AND v_local_now::time >= v_cutoff THEN
      RAISE EXCEPTION 'The same-day delivery cutoff has passed' USING ERRCODE = '22023';
    END IF;
    IF p_time_slot_start < v_start OR p_time_slot_start > v_end
      OR p_time_slot_start - v_start > v_end - v_start - interval '2 hours'
      OR mod(extract(epoch FROM (p_time_slot_start - v_start)), 7200) <> 0 THEN
      RAISE EXCEPTION 'Select a two-hour slot within delivery hours' USING ERRCODE = '22023';
    END IF;
    v_slot_end := p_time_slot_start + interval '2 hours';
    IF (SELECT count(*) FROM public.orders WHERE delivery_date = p_delivery_date
        AND time_slot_start = p_time_slot_start AND status <> 'cancelled') >= v_capacity THEN
      RAISE EXCEPTION 'The delivery slot is full' USING ERRCODE = '22023';
    END IF;
    v_result := v_result || jsonb_build_object('time_slot_end', v_slot_end);
  END IF;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.place_order(
  p_items jsonb, p_address_id uuid, p_payment_method text, p_delivery_date date,
  p_time_slot_start time, p_idempotency_key uuid, p_expected_total_usd numeric,
  p_expected_rate numeric, p_instructions text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_items jsonb;
  v_hash text;
  v_order public.orders%ROWTYPE;
  v_quote jsonb;
  v_item jsonb;
  v_snapshot jsonb;
  v_method public.payment_methods%ROWTYPE;
  v_id uuid := gen_random_uuid();
  v_count integer;
  v_rate numeric;
  v_subtotal numeric;
  v_fee numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_items IS NULL OR p_address_id IS NULL OR p_payment_method IS NULL
    OR p_delivery_date IS NULL OR p_time_slot_start IS NULL OR p_idempotency_key IS NULL
    OR p_expected_total_usd IS NULL OR p_expected_rate IS NULL THEN
    RAISE EXCEPTION 'All purchase arguments are required' USING ERRCODE = '22023';
  END IF;
  IF p_payment_method NOT IN ('cash', 'pagomovil', 'transfer') OR p_expected_total_usd < 0
    OR p_expected_rate <= 0 OR p_expected_total_usd = 'NaN'::numeric OR p_expected_rate = 'NaN'::numeric
    OR length(coalesce(p_instructions, '')) > 1000 THEN
    RAISE EXCEPTION 'Invalid purchase arguments' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('product_id', i.product_id, 'quantity', i.quantity) ORDER BY i.product_id)
    INTO v_items FROM public.core_order_items(p_items) i;
  v_hash := md5(jsonb_build_object('items', v_items, 'address_id', p_address_id,
    'payment_method', p_payment_method, 'delivery_date', p_delivery_date,
    'time_slot_start', p_time_slot_start, 'expected_total_usd', trim_scale(p_expected_total_usd),
    'expected_rate', trim_scale(p_expected_rate), 'instructions', nullif(btrim(p_instructions), ''))::text);
  PERFORM pg_advisory_xact_lock(hashtextextended('core:user:' || v_uid::text, 0));
  SELECT * INTO v_order FROM public.orders WHERE user_id = v_uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_order.request_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'Idempotency key already used for a different purchase' USING ERRCODE = '22023';
    END IF;
    RETURN to_jsonb(v_order);
  END IF;
  IF (SELECT count(*) FROM public.orders WHERE user_id = v_uid AND status = 'pending'
    AND payment_status = 'pending' AND inventory_reserved AND NOT stock_released) >= 5 THEN
    RAISE EXCEPTION 'At most five pending unpaid reservations are allowed per customer' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('core:slot:' || p_delivery_date::text || ':' || p_time_slot_start::text, 0));
  SELECT * INTO v_method FROM public.payment_methods WHERE id = p_payment_method FOR SHARE;
  IF NOT FOUND OR NOT v_method.enabled OR length(btrim(v_method.instructions)) = 0 THEN
    RAISE EXCEPTION 'The selected payment method is not enabled' USING ERRCODE = '22023';
  END IF;
  PERFORM id FROM public.settings WHERE key IN ('exchange_rate', 'delivery_hours') ORDER BY key FOR SHARE;
  PERFORM a.id FROM public.addresses a JOIN public.areas ar ON ar.id = a.area_id
    JOIN public.cities c ON c.id = ar.city_id JOIN public.states s ON s.id = c.state_id
    WHERE a.id = p_address_id AND a.user_id = v_uid FOR SHARE OF a, ar, c, s;
  PERFORM p.id FROM public.products p WHERE p.id IN (
    SELECT i.product_id FROM public.core_order_items(v_items) i
  ) ORDER BY p.id FOR UPDATE;
  v_quote := public.quote_order(v_items, p_address_id, p_delivery_date, p_time_slot_start);
  IF (v_quote->>'total_usd')::numeric <> p_expected_total_usd
     OR (v_quote->>'exchange_rate')::numeric <> p_expected_rate THEN
    RAISE EXCEPTION 'The price or exchange rate changed; request a new quote' USING ERRCODE = '22023';
  END IF;
  SELECT to_jsonb(a) || jsonb_build_object('area', ar.name, 'city', c.name, 'state', s.name)
    INTO v_snapshot FROM public.addresses a JOIN public.areas ar ON ar.id = a.area_id
    JOIN public.cities c ON c.id = ar.city_id JOIN public.states s ON s.id = c.state_id
    WHERE a.id = p_address_id AND a.user_id = v_uid;
  v_rate := (v_quote->>'exchange_rate')::numeric;
  v_subtotal := (v_quote->>'subtotal_usd')::numeric;
  v_fee := (v_quote->>'delivery_fee_usd')::numeric;
  INSERT INTO public.orders(id, order_number, user_id, address_id, address_snapshot,
    status, payment_status, payment_method, subtotal_usd, delivery_fee_usd, discount_usd, total_usd,
    subtotal_ves, delivery_fee_ves, discount_ves, total_ves, exchange_rate,
    payment_instructions, payment_currency,
    delivery_date, time_slot_start, time_slot_end, delivery_instructions,
    idempotency_key, request_hash, reservation_expires_at, inventory_reserved, stock_released)
  VALUES (v_id, 'TZ' || upper(substr(replace(v_id::text, '-', ''), 1, 18)), v_uid, p_address_id, v_snapshot,
    'pending', 'pending', p_payment_method::public.payment_method,
    v_subtotal, v_fee, 0, (v_quote->>'total_usd')::numeric,
    round(v_subtotal * v_rate, 2), round(v_fee * v_rate, 2), 0, (v_quote->>'total_ves')::numeric, v_rate,
    v_method.instructions, v_method.currency,
    p_delivery_date, p_time_slot_start, (v_quote->>'time_slot_end')::time, nullif(btrim(p_instructions), ''),
    p_idempotency_key, v_hash,
    CASE WHEN p_payment_method = 'cash' THEN NULL ELSE statement_timestamp() + interval '30 minutes' END,
    true, false)
  RETURNING * INTO v_order;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_quote->'items') LOOP
    UPDATE public.products SET stock_quantity = stock_quantity - (v_item->>'quantity')::integer
      WHERE id = (v_item->>'product_id')::uuid AND stock_quantity >= (v_item->>'quantity')::integer AND is_active;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 1 THEN RAISE EXCEPTION 'Stock changed; request a new quote' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.order_items(order_id, product_id, product_name, product_sku, quantity,
      unit_price_usd, unit_price_ves, total_usd, total_ves)
    SELECT v_id, p.id, v_item->>'name', p.sku, (v_item->>'quantity')::integer,
      (v_item->>'unit_price_usd')::numeric, round((v_item->>'unit_price_usd')::numeric * v_rate, 2),
      (v_item->>'total_usd')::numeric, round((v_item->>'total_usd')::numeric * v_rate, 2)
    FROM public.products p WHERE p.id = (v_item->>'product_id')::uuid;
    INSERT INTO public.stock_movements(product_id, order_id, quantity, movement_type, actor_id)
    VALUES ((v_item->>'product_id')::uuid, v_id, -(v_item->>'quantity')::integer, 'order_reserved', v_uid);
  END LOOP;
  PERFORM public.core_record_event(v_id, 'order.created', v_uid,
    jsonb_build_object('user_id', v_uid, 'total_usd', v_order.total_usd, 'payment_method', p_payment_method));
  RETURN to_jsonb(v_order);
END;
$$;

CREATE FUNCTION public.submit_payment_reference(p_order_id uuid, p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_reference text := btrim(p_reference);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_order_id IS NULL OR v_reference IS NULL OR length(v_reference) NOT BETWEEN 6 AND 100
    OR v_reference !~ '^[a-zA-Z0-9 ._/-]+$'
    OR length(regexp_replace(v_reference, '[^a-zA-Z0-9]', '', 'g')) < 6 THEN
    RAISE EXCEPTION 'A payment reference must contain 6 to 100 characters' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = '42501'; END IF;
  IF v_order.status IS DISTINCT FROM 'pending'::public.order_status
    OR v_order.payment_status IS DISTINCT FROM 'pending'::public.payment_status
    OR v_order.payment_method IS NULL OR v_order.payment_method NOT IN ('pagomovil', 'transfer') OR v_order.stock_released
    OR v_order.reservation_expires_at IS NULL OR v_order.reservation_expires_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'This order no longer accepts a payment reference' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.manual_payments(order_id, reference, payment_method, status)
  VALUES (p_order_id, v_reference, v_order.payment_method::text, 'submitted')
  ON CONFLICT (order_id) DO UPDATE SET reference = EXCLUDED.reference, status = 'submitted',
    review_note = NULL, reviewed_by = NULL, reviewed_at = NULL, updated_at = now();
  UPDATE public.orders SET payment_reference = v_reference,
    reservation_expires_at = least(statement_timestamp() + interval '24 hours',
      v_order.created_at + interval '24 hours 30 minutes')
    WHERE id = p_order_id RETURNING * INTO v_order;
  PERFORM public.core_record_event(p_order_id, 'payment.submitted', v_uid,
    jsonb_build_object('payment_method', v_order.payment_method));
  RETURN to_jsonb(v_order);
END;
$$;

CREATE FUNCTION public.review_order_payment(p_order_id uuid, p_action text, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_payment public.manual_payments%ROWTYPE;
  v_note text := btrim(p_note);
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501'; END IF;
  IF p_order_id IS NULL OR p_action IS NULL OR p_action NOT IN ('approve', 'reject', 'refund')
    OR v_note IS NULL OR length(v_note) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'Provide an action and an operator verification note of 5 to 1000 characters' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = '22023'; END IF;
  IF p_action = 'refund' THEN
    IF v_order.payment_status <> 'paid' THEN RAISE EXCEPTION 'Only a paid order can be marked refunded' USING ERRCODE = '22023'; END IF;
    UPDATE public.orders SET payment_status = 'refunded', reservation_expires_at = NULL
      WHERE id = p_order_id RETURNING * INTO v_order;
  ELSE
    IF v_order.status IS NULL OR v_order.status = 'cancelled'
      OR v_order.payment_status IS DISTINCT FROM 'pending'::public.payment_status OR v_order.stock_released
      OR (v_order.reservation_expires_at IS NOT NULL AND v_order.reservation_expires_at <= statement_timestamp()) THEN
      RAISE EXCEPTION 'Expired, cancelled or already reviewed orders cannot be approved or rejected' USING ERRCODE = '22023';
    END IF;
    IF v_order.payment_method IN ('pagomovil', 'transfer') THEN
      SELECT * INTO v_payment FROM public.manual_payments WHERE order_id = p_order_id FOR UPDATE;
      IF NOT FOUND OR v_payment.status <> 'submitted' THEN
        RAISE EXCEPTION 'A submitted payment reference is required' USING ERRCODE = '22023';
      END IF;
      UPDATE public.manual_payments SET status = CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END,
        review_note = v_note, reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
        WHERE order_id = p_order_id;
    ELSIF v_order.payment_method IS DISTINCT FROM 'cash'::public.payment_method OR p_action = 'reject' THEN
      RAISE EXCEPTION 'Unsupported payment review action' USING ERRCODE = '22023';
    END IF;
    IF p_action = 'approve' THEN
      UPDATE public.orders SET payment_status = 'paid', reservation_expires_at = NULL
        WHERE id = p_order_id RETURNING * INTO v_order;
    ELSE
      UPDATE public.orders SET reservation_expires_at = statement_timestamp() + interval '30 minutes'
        WHERE id = p_order_id RETURNING * INTO v_order;
    END IF;
  END IF;
  PERFORM public.core_record_event(p_order_id, 'payment.' || p_action, v_uid,
    jsonb_build_object('note', v_note, 'payment_status', v_order.payment_status));
  RETURN to_jsonb(v_order);
END;
$$;

CREATE FUNCTION public.transition_order(p_order_id uuid, p_status text, p_driver_id uuid DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_order public.orders%ROWTYPE;
  v_previous public.order_status;
  v_driver uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_order_id IS NULL OR p_status IS NULL OR p_status NOT IN ('confirmed', 'preparing', 'on_way', 'delivered', 'cancelled')
    OR length(coalesce(p_reason, '')) > 1000 THEN
    RAISE EXCEPTION 'Invalid order transition' USING ERRCODE = '22023';
  END IF;
  v_admin := public.is_admin();
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = '42501'; END IF;
  IF NOT v_admin AND (NOT public.is_driver() OR v_order.driver_id IS DISTINCT FROM v_uid
    OR p_status NOT IN ('on_way', 'delivered') OR p_driver_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Only an administrator or the assigned driver can perform this transition' USING ERRCODE = '42501';
  END IF;
  IF NOT ((v_order.status = 'pending' AND p_status IN ('confirmed', 'cancelled'))
    OR (v_order.status = 'confirmed' AND p_status IN ('preparing', 'cancelled'))
    OR (v_order.status = 'preparing' AND p_status IN ('on_way', 'cancelled'))
    OR (v_order.status = 'on_way' AND p_status IN ('delivered', 'cancelled'))) THEN
    RAISE EXCEPTION 'Invalid transition from % to %', v_order.status, p_status USING ERRCODE = '22023';
  END IF;
  IF p_status = 'cancelled' THEN
    IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
      RAISE EXCEPTION 'Cancellation requires a reason of at least 5 characters' USING ERRCODE = '22023';
    END IF;
    IF v_order.payment_status = 'paid' THEN
      RAISE EXCEPTION 'Manually refund a paid order before cancelling it' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_order.stock_released OR (v_order.reservation_expires_at IS NOT NULL
       AND v_order.reservation_expires_at <= statement_timestamp()) THEN
      RAISE EXCEPTION 'The inventory reservation has expired' USING ERRCODE = '22023';
    END IF;
    IF v_order.payment_status = 'refunded' OR
      (v_order.payment_method IS DISTINCT FROM 'cash'::public.payment_method AND v_order.payment_status <> 'paid') THEN
      RAISE EXCEPTION 'Non-cash orders must be paid before fulfillment' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_status = 'delivered' AND v_order.payment_status IS DISTINCT FROM 'paid'::public.payment_status THEN
    RAISE EXCEPTION 'Verify and approve payment before marking an order delivered' USING ERRCODE = '22023';
  END IF;
  v_driver := coalesce(p_driver_id, v_order.driver_id);
  IF p_driver_id IS NOT NULL THEN
    IF NOT v_admin OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_driver_id AND role = 'driver') THEN
      RAISE EXCEPTION 'Assigned user must be a driver' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_status IN ('on_way', 'delivered') AND (v_driver IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = v_driver AND role = 'driver'
  )) THEN
    RAISE EXCEPTION 'Assign an active driver before dispatch' USING ERRCODE = '22023';
  END IF;
  v_previous := v_order.status;
  IF p_status = 'cancelled' THEN PERFORM public.core_release_order_stock(p_order_id, v_uid); END IF;
  UPDATE public.orders SET status = p_status::public.order_status,
    driver_id = v_driver,
    driver_assigned_at = CASE WHEN p_driver_id IS NOT NULL AND p_driver_id IS DISTINCT FROM driver_id THEN now() ELSE driver_assigned_at END,
    confirmed_at = CASE WHEN p_status = 'confirmed' THEN now() ELSE confirmed_at END,
    preparing_at = CASE WHEN p_status = 'preparing' THEN now() ELSE preparing_at END,
    on_way_at = CASE WHEN p_status = 'on_way' THEN now() ELSE on_way_at END,
    delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE delivered_at END,
    cancelled_at = CASE WHEN p_status = 'cancelled' THEN now() ELSE cancelled_at END,
    cancellation_reason = CASE WHEN p_status = 'cancelled' THEN btrim(p_reason) ELSE cancellation_reason END
    WHERE id = p_order_id RETURNING * INTO v_order;
  PERFORM public.core_record_event(p_order_id, 'order.' || p_status, v_uid,
    jsonb_build_object('from_status', v_previous, 'to_status', p_status, 'driver_id', v_driver, 'reason', nullif(btrim(p_reason), '')));
  RETURN to_jsonb(v_order);
END;
$$;

CREATE FUNCTION public.admin_adjust_stock(p_product_id uuid, p_delta integer, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_product public.products%ROWTYPE;
  v_before integer;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_product_id IS NULL OR p_delta IS NULL OR p_delta = 0 OR p_reason IS NULL
    OR length(btrim(p_reason)) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'Stock adjustment requires a product, nonzero delta and reason of 5 to 1000 characters'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING ERRCODE = '22023'; END IF;
  v_before := coalesce(v_product.stock_quantity, 0);
  IF v_before::bigint + p_delta NOT BETWEEN 0 AND 2147483647 THEN
    RAISE EXCEPTION 'Stock adjustment would create invalid inventory' USING ERRCODE = '22023';
  END IF;
  UPDATE public.products SET stock_quantity = v_before + p_delta
    WHERE id = p_product_id RETURNING * INTO v_product;
  INSERT INTO public.stock_movements(product_id, quantity, movement_type, actor_id)
  VALUES (p_product_id, p_delta, 'adjustment', v_uid);
  INSERT INTO public.audit_log(actor_id, action, details)
  VALUES (v_uid, 'stock.adjusted', jsonb_build_object('product_id', p_product_id,
    'before', v_before, 'after', v_product.stock_quantity, 'delta', p_delta, 'reason', btrim(p_reason)));
  RETURN to_jsonb(v_product);
END;
$$;

CREATE FUNCTION public.expire_order_reservations(p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Expiry batch limit must be between 1 and 1000' USING ERRCODE = '22023';
  END IF;
  FOR v_order IN SELECT * FROM public.orders WHERE status = 'pending' AND payment_status = 'pending'
    AND reservation_expires_at <= statement_timestamp() AND NOT stock_released
    ORDER BY reservation_expires_at, id LIMIT p_limit FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.core_release_order_stock(v_order.id, NULL);
    UPDATE public.orders SET status = 'cancelled', cancelled_at = now(),
      cancellation_reason = 'Payment reservation expired' WHERE id = v_order.id;
    PERFORM public.core_record_event(v_order.id, 'order.expired', NULL, jsonb_build_object('reason', 'Payment reservation expired'));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin(), public.is_driver(),
  public.guard_profile_privileges(), public.provision_customer_profile(),
  public.update_updated_at_column(), public.generate_order_number(), public.core_order_items(jsonb),
  public.core_record_event(uuid,text,uuid,jsonb), public.core_release_order_stock(uuid,uuid),
  public.quote_order(jsonb,uuid,date,time),
  public.place_order(jsonb,uuid,text,date,time,uuid,numeric,numeric,text),
  public.submit_payment_reference(uuid,text), public.review_order_payment(uuid,text,text),
  public.transition_order(uuid,text,uuid,text), public.admin_adjust_stock(uuid,integer,text),
  public.expire_order_reservations(integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(), public.is_driver(),
  public.quote_order(jsonb,uuid,date,time),
  public.place_order(jsonb,uuid,text,date,time,uuid,numeric,numeric,text),
  public.submit_payment_reference(uuid,text), public.review_order_payment(uuid,text,text),
  public.transition_order(uuid,text,uuid,text), public.admin_adjust_stock(uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_order_reservations(integer) TO service_role;

-- Storage is optional in a plain PostgreSQL install. Product uploads are server
-- only; receipt paths must start with the owning auth UUID and stay private.
DO $storage$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL THEN
    INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('products', 'products', true, 5242880,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']),
      ('payment-receipts', 'payment-receipts', false, 10485760,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
    EXECUTE 'CREATE POLICY core_product_images_read ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = ''products'')';
    EXECUTE 'CREATE POLICY core_receipts_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = ''payment-receipts'' AND (split_part(name, ''/'', 1) = auth.uid()::text OR public.is_admin()))';
    EXECUTE 'CREATE POLICY core_receipts_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''payment-receipts'' AND split_part(name, ''/'', 1) = auth.uid()::text)';
    EXECUTE 'CREATE POLICY core_receipts_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = ''payment-receipts'' AND split_part(name, ''/'', 1) = auth.uid()::text) WITH CHECK (bucket_id = ''payment-receipts'' AND split_part(name, ''/'', 1) = auth.uid()::text)';
    EXECUTE 'CREATE POLICY core_receipts_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''payment-receipts'' AND split_part(name, ''/'', 1) = auth.uid()::text)';
  END IF;
END;
$storage$;

COMMIT;
