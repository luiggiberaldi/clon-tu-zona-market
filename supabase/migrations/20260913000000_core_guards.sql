-- Final integration guards. Preserve existing records and immutable order snapshots.
BEGIN;

DROP POLICY payment_methods_public_read ON public.payment_methods;
CREATE POLICY payment_methods_public_read ON public.payment_methods FOR SELECT TO anon
  USING (enabled);
CREATE POLICY payment_methods_authenticated_read ON public.payment_methods FOR SELECT TO authenticated
  USING (enabled OR public.is_admin());

-- Preserve every legacy address; only resolve conflicting default flags.
WITH defaults AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at, id) AS position
  FROM public.addresses WHERE is_default
)
UPDATE public.addresses SET is_default = false
WHERE id IN (SELECT id FROM defaults WHERE position > 1);
CREATE UNIQUE INDEX addresses_one_default ON public.addresses(user_id) WHERE is_default;

CREATE FUNCTION public.save_address(p_values jsonb, p_address_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_id uuid := coalesce(p_address_id, gen_random_uuid());
  v_area uuid; v_address public.addresses%ROWTYPE; v_default boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'object' THEN
    RAISE EXCEPTION 'Invalid address' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_values) k WHERE k NOT IN
      ('area_id','full_address','street','building','apartment','floor','reference','is_default'))
    OR jsonb_typeof(p_values->'area_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_values->'full_address') IS DISTINCT FROM 'string'
    OR length(btrim(p_values->>'full_address')) NOT BETWEEN 5 AND 500
    OR (p_values ? 'is_default' AND jsonb_typeof(p_values->'is_default') IS DISTINCT FROM 'boolean')
    OR EXISTS (SELECT 1 FROM jsonb_each(p_values) e WHERE e.key IN ('street','building','apartment','floor','reference')
      AND (jsonb_typeof(e.value) <> 'string' OR length(e.value #>> '{}') > CASE e.key WHEN 'floor' THEN 10 WHEN 'apartment' THEN 50 WHEN 'reference' THEN 500 ELSE 255 END)) THEN
    RAISE EXCEPTION 'Invalid address fields' USING ERRCODE='22023';
  END IF;
  BEGIN v_area := (p_values->>'area_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid area' USING ERRCODE='22023'; END;
  PERFORM pg_advisory_xact_lock(hashtextextended('core:user:' || v_uid::text,0));
  SELECT * INTO v_address FROM public.addresses WHERE id=v_id FOR UPDATE;
  IF FOUND AND v_address.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Address not found' USING ERRCODE='42501';
  END IF;
  IF NOT FOUND AND (SELECT count(*) FROM public.addresses WHERE user_id=v_uid)>=50 THEN
    RAISE EXCEPTION 'At most 50 saved addresses are allowed' USING ERRCODE='22023';
  END IF;
  PERFORM ar.id FROM public.areas ar JOIN public.cities c ON c.id=ar.city_id JOIN public.states s ON s.id=c.state_id
    WHERE ar.id=v_area AND ar.is_active AND c.is_active AND s.is_active FOR SHARE OF ar,c,s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Address outside active coverage' USING ERRCODE='22023'; END IF;
  v_default := coalesce((p_values->>'is_default')::boolean,false);
  IF v_default THEN UPDATE public.addresses SET is_default=false WHERE user_id=v_uid AND is_default AND id<>v_id; END IF;
  INSERT INTO public.addresses(id,user_id,area_id,full_address,street,building,apartment,floor,reference,is_default)
  VALUES(v_id,v_uid,v_area,btrim(p_values->>'full_address'),nullif(btrim(p_values->>'street'),''),
    nullif(btrim(p_values->>'building'),''),nullif(btrim(p_values->>'apartment'),''),
    nullif(btrim(p_values->>'floor'),''),nullif(btrim(p_values->>'reference'),''),v_default)
  ON CONFLICT(id) DO UPDATE SET area_id=excluded.area_id,full_address=excluded.full_address,
    street=excluded.street,building=excluded.building,apartment=excluded.apartment,floor=excluded.floor,
    reference=excluded.reference,is_default=excluded.is_default
  RETURNING * INTO v_address;
  RETURN to_jsonb(v_address);
END;
$$;
CREATE FUNCTION public.delete_address(p_address_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('core:user:'||v_uid::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.addresses WHERE id=p_address_id AND user_id=v_uid) THEN
    RAISE EXCEPTION 'Address not found' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.orders WHERE address_id=p_address_id) THEN
    RAISE EXCEPTION 'Esta dirección pertenece al historial de pedidos. Puedes editarla, pero no eliminarla.' USING ERRCODE='22023';
  END IF;
  DELETE FROM public.addresses WHERE id=p_address_id AND user_id=v_uid;
  RETURN FOUND;
END;
$$;
REVOKE INSERT, UPDATE, DELETE ON public.addresses,public.cart_items FROM authenticated;
REVOKE ALL ON FUNCTION public.save_address(jsonb,uuid),public.delete_address(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_address(jsonb,uuid),public.delete_address(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_cart(p_items jsonb,p_mode text DEFAULT 'replace')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid(); v_item record; v_stock integer; v_qty integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR p_mode IS NULL OR p_mode NOT IN ('replace','merge') THEN
    RAISE EXCEPTION 'Invalid cart payload' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_items)>100 THEN RAISE EXCEPTION 'Cart line limit exceeded' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p_items)>0 THEN PERFORM * FROM public.core_order_items(p_items); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('core:user:'||v_uid::text,0));
  -- Lock the full union, not just incoming items, before any cleanup/clamping.
  PERFORM p.id FROM public.products p WHERE p.id IN (
    SELECT product_id FROM public.cart_items WHERE user_id=v_uid
    UNION SELECT (value->>'product_id')::uuid FROM jsonb_array_elements(p_items)
  ) ORDER BY p.id FOR SHARE;
  IF p_mode='replace' THEN DELETE FROM public.cart_items WHERE user_id=v_uid; END IF;
  IF jsonb_array_length(p_items)>0 THEN
    FOR v_item IN SELECT * FROM public.core_order_items(p_items) LOOP
      SELECT stock_quantity INTO v_stock FROM public.products WHERE id=v_item.product_id AND is_active;
      IF FOUND AND coalesce(v_stock,0)>0 THEN
        v_qty:=least(v_stock,v_item.quantity,99);
        IF p_mode='merge' THEN
          SELECT least(v_stock,99,v_qty+coalesce(sum(quantity),0)::integer) INTO v_qty FROM public.cart_items
            WHERE user_id=v_uid AND product_id=v_item.product_id;
        END IF;
        INSERT INTO public.cart_items(user_id,product_id,quantity) VALUES(v_uid,v_item.product_id,v_qty)
        ON CONFLICT(user_id,product_id) DO UPDATE SET quantity=excluded.quantity,updated_at=now();
      END IF;
    END LOOP;
  END IF;
  DELETE FROM public.cart_items c WHERE user_id=v_uid AND NOT EXISTS(
    SELECT 1 FROM public.products p WHERE p.id=c.product_id AND p.is_active AND p.stock_quantity>0
  );
  UPDATE public.cart_items c SET quantity=least(c.quantity,p.stock_quantity,99)
    FROM public.products p WHERE c.user_id=v_uid AND c.product_id=p.id;
  IF (SELECT count(*) FROM public.cart_items WHERE user_id=v_uid)>100 THEN
    RAISE EXCEPTION 'Cart line limit exceeded' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('product',to_jsonb(p),'quantity',c.quantity) ORDER BY c.created_at,p.id)
    FROM public.cart_items c JOIN public.products p ON p.id=c.product_id WHERE c.user_id=v_uid),'[]'::jsonb));
END;
$$;

ALTER TABLE public.manual_payments ADD COLUMN submission_count integer NOT NULL DEFAULT 1 CHECK(submission_count BETWEEN 1 AND 5);
CREATE OR REPLACE FUNCTION public.submit_payment_reference(p_order_id uuid,p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_order public.orders%ROWTYPE; v_payment public.manual_payments%ROWTYPE;
  v_reference text:=btrim(p_reference); v_normalized text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  v_normalized:=upper(regexp_replace(v_reference,'[^a-zA-Z0-9]','','g'));
  IF p_order_id IS NULL OR v_reference IS NULL OR length(v_reference) NOT BETWEEN 6 AND 100
    OR v_reference !~ '^[a-zA-Z0-9 ._/-]+$' OR length(v_normalized)<6 THEN
    RAISE EXCEPTION 'La referencia debe contener entre 6 y 100 caracteres.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id AND user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_payment FROM public.manual_payments WHERE order_id=p_order_id FOR UPDATE;
  -- Identical ambiguous-response retries are a pure read, including after approval/expiry.
  IF FOUND AND v_payment.normalized_reference=v_normalized AND v_payment.status IN ('submitted','approved') THEN
    RETURN to_jsonb(v_order);
  END IF;
  IF v_order.status IS DISTINCT FROM 'pending'::public.order_status
    OR v_order.payment_status IS DISTINCT FROM 'pending'::public.payment_status
    OR v_order.payment_method IS NULL OR v_order.payment_method NOT IN ('pagomovil','transfer')
    OR v_order.stock_released OR v_order.reservation_expires_at IS NULL
    OR v_order.reservation_expires_at<=statement_timestamp() THEN
    RAISE EXCEPTION 'Este pedido ya no acepta referencias de pago.' USING ERRCODE='22023';
  END IF;
  IF v_payment.id IS NOT NULL THEN
    IF v_payment.normalized_reference=v_normalized AND v_payment.status='rejected' THEN
      RAISE EXCEPTION 'La referencia fue rechazada. Contacta al comercio o corrige el dato.' USING ERRCODE='22023';
    END IF;
    IF v_payment.submission_count>=5 OR v_payment.updated_at>statement_timestamp()-interval '1 minute' THEN
      RAISE EXCEPTION 'Espera un minuto entre cambios; se permiten hasta cinco referencias por pedido.' USING ERRCODE='22023';
    END IF;
  END IF;
  INSERT INTO public.manual_payments(order_id,reference,payment_method,status)
  VALUES(p_order_id,v_reference,v_order.payment_method::text,'submitted')
  ON CONFLICT(order_id) DO UPDATE SET reference=excluded.reference,status='submitted',
    review_note=NULL,reviewed_by=NULL,reviewed_at=NULL,updated_at=now(),
    submission_count=public.manual_payments.submission_count+1;
  UPDATE public.orders SET payment_reference=v_reference,
    reservation_expires_at=least(statement_timestamp()+interval '24 hours',v_order.created_at+interval '24 hours 30 minutes')
    WHERE id=p_order_id RETURNING * INTO v_order;
  PERFORM public.core_record_event(p_order_id,'payment.submitted',v_uid,jsonb_build_object('payment_method',v_order.payment_method));
  RETURN to_jsonb(v_order);
END;
$$;

CREATE FUNCTION public.guard_category_hierarchy() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('core:category-tree',0));
  IF NEW.parent_id=NEW.id OR EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT id,parent_id FROM public.categories WHERE id=NEW.parent_id
      UNION SELECT c.id,c.parent_id FROM public.categories c JOIN ancestors a ON c.id=a.parent_id
    ) SELECT 1 FROM ancestors WHERE id=NEW.id
  ) THEN RAISE EXCEPTION 'Las categorías no pueden formar un ciclo.' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_category_hierarchy BEFORE INSERT OR UPDATE OF parent_id ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.guard_category_hierarchy();
REVOKE ALL ON FUNCTION public.guard_category_hierarchy() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
