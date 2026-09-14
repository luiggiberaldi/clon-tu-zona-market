-- Application RPC contracts, MFA enforcement and durable operational jobs.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce(auth.jwt()->>'aal', '') = 'aal2' AND EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- API and direct RPC access enforce the same identity / role rules.
CREATE FUNCTION public.sync_cart(p_items jsonb, p_mode text DEFAULT 'replace')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_item record; v_stock integer; v_qty integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('replace','merge') OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'Invalid cart payload' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('core:user:' || v_uid::text, 0));
  IF jsonb_array_length(p_items) > 0 THEN PERFORM * FROM public.core_order_items(p_items); END IF;
  IF p_mode = 'replace' THEN DELETE FROM public.cart_items WHERE user_id=v_uid; END IF;
  IF jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM public.core_order_items(p_items) LOOP
      SELECT stock_quantity INTO v_stock FROM public.products WHERE id=v_item.product_id AND is_active FOR SHARE;
      IF FOUND AND coalesce(v_stock,0)>0 THEN
        v_qty := least(v_stock, v_item.quantity, 99);
        IF p_mode='merge' THEN
          SELECT least(v_stock,99,v_qty+coalesce(sum(quantity),0)::integer) INTO v_qty
          FROM public.cart_items WHERE user_id=v_uid AND product_id=v_item.product_id;
        END IF;
        INSERT INTO public.cart_items(user_id,product_id,quantity) VALUES(v_uid,v_item.product_id,v_qty)
        ON CONFLICT(user_id,product_id) DO UPDATE SET quantity=excluded.quantity, updated_at=now();
      END IF;
    END LOOP;
  END IF;
  DELETE FROM public.cart_items c WHERE user_id=v_uid AND NOT EXISTS (
    SELECT 1 FROM public.products p WHERE p.id=c.product_id AND p.is_active AND p.stock_quantity>0
  );
  UPDATE public.cart_items c SET quantity=least(c.quantity,p.stock_quantity,99)
  FROM public.products p WHERE c.user_id=v_uid AND c.product_id=p.id;
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('product',to_jsonb(p),'quantity',c.quantity) ORDER BY c.created_at)
    FROM public.cart_items c JOIN public.products p ON p.id=c.product_id WHERE c.user_id=v_uid),'[]'::jsonb));
END;
$$;

CREATE FUNCTION public.available_delivery_slots(p_address_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_hours jsonb; v_start time; v_end time; v_cutoff time;
  v_capacity integer; v_lead integer; v_horizon integer; v_date date; v_slot time;
  v_now timestamp := statement_timestamp() AT TIME ZONE 'America/Caracas';
  v_result jsonb := '[]'::jsonb; v_used integer; v_day integer; v_offset integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.addresses a JOIN public.areas ar ON ar.id=a.area_id
    JOIN public.cities c ON c.id=ar.city_id JOIN public.states s ON s.id=c.state_id
    WHERE a.id=p_address_id AND a.user_id=v_uid AND ar.is_active AND c.is_active AND s.is_active) THEN
    RAISE EXCEPTION 'Address outside active coverage' USING ERRCODE='22023';
  END IF;
  SELECT value INTO v_hours FROM public.settings WHERE key='delivery_hours';
  v_start := (v_hours->>'start')::time; v_end := (v_hours->>'end')::time;
  v_cutoff := (v_hours->>'cutoff_time')::time;
  v_capacity := coalesce((v_hours->>'slot_capacity')::integer,20);
  v_lead := coalesce((v_hours->>'lead_minutes')::integer,60);
  v_horizon := coalesce((v_hours->>'horizon_days')::integer,7);
  IF v_start IS NULL OR v_end IS NULL OR v_cutoff IS NULL OR v_start>=v_end OR v_capacity NOT BETWEEN 1 AND 1000
    OR v_lead NOT BETWEEN 0 AND 1440 OR v_horizon NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'Delivery hours are not configured' USING ERRCODE='22023';
  END IF;
  FOR v_day IN 0..v_horizon LOOP
    v_date := v_now::date+v_day;
    v_offset := 0;
    WHILE v_offset * interval '1 minute' + interval '2 hours' <= v_end-v_start LOOP
      v_slot := v_start + v_offset * interval '1 minute';
      IF v_date+v_slot >= v_now+make_interval(mins=>v_lead) AND (v_day>0 OR v_now::time<v_cutoff) THEN
        SELECT count(*) INTO v_used FROM public.orders WHERE delivery_date=v_date AND time_slot_start=v_slot AND status<>'cancelled';
        IF v_used < v_capacity THEN
          v_result := v_result || jsonb_build_array(jsonb_build_object('date',v_date,'start',to_char(v_slot,'HH24:MI'),
            'end',to_char(v_slot+interval '2 hours','HH24:MI'),'available',v_capacity-v_used));
        END IF;
      END IF;
      v_offset := v_offset+120;
    END LOOP;
  END LOOP;
  RETURN v_result;
END;
$$;

DROP FUNCTION public.admin_adjust_stock(uuid,integer,text);
CREATE FUNCTION public.admin_adjust_stock(p_product_id uuid,p_quantity integer,p_mode text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid(); v_before integer; v_after bigint;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator MFA required' USING ERRCODE='42501'; END IF;
  IF p_product_id IS NULL OR p_quantity IS NULL OR p_mode IS NULL OR p_mode NOT IN('delta','set') OR p_reason IS NULL
    OR length(btrim(p_reason)) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Invalid stock adjustment' USING ERRCODE='22023'; END IF;
  SELECT stock_quantity INTO v_before FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING ERRCODE='22023'; END IF;
  v_before:=coalesce(v_before,0);
  v_after:=CASE WHEN p_mode='set' THEN p_quantity::bigint ELSE v_before::bigint+p_quantity END;
  IF v_after NOT BETWEEN 0 AND 1000000000 THEN RAISE EXCEPTION 'Invalid stock result' USING ERRCODE='22023'; END IF;
  IF v_after<>v_before THEN
    UPDATE public.products SET stock_quantity=v_after::integer WHERE id=p_product_id;
    INSERT INTO public.stock_movements(product_id,quantity,movement_type,actor_id) VALUES(p_product_id,(v_after-v_before)::integer,'adjustment',v_uid);
    INSERT INTO public.audit_log(actor_id,action,details) VALUES(v_uid,'stock.adjusted',jsonb_build_object('product_id',p_product_id,'before',v_before,'after',v_after,'reason',btrim(p_reason)));
  END IF;
  RETURN jsonb_build_object('id',p_product_id,'stock',v_after);
END;
$$;

-- Audit trusted operator changes even when performed via the server service role.
CREATE FUNCTION public.core_audit_admin_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  INSERT INTO public.audit_log(actor_id,action,details) VALUES(auth.uid(),TG_TABLE_NAME||'.'||lower(TG_OP),
    jsonb_build_object('record_id',CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD)->>'id' ELSE to_jsonb(NEW)->>'id' END));
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER audit_products_write AFTER INSERT OR UPDATE OR DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.core_audit_admin_write();
CREATE TRIGGER audit_settings_write AFTER INSERT OR UPDATE OR DELETE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.core_audit_admin_write();
CREATE TRIGGER audit_payment_methods_write AFTER INSERT OR UPDATE OR DELETE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION public.core_audit_admin_write();

ALTER TABLE public.outbox ADD COLUMN locked_until timestamptz, ADD COLUMN claim_token uuid;
CREATE FUNCTION public.claim_outbox(p_limit integer DEFAULT 20) RETURNS SETOF public.outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid batch' USING ERRCODE='22023'; END IF;
  RETURN QUERY WITH batch AS (
    SELECT id FROM public.outbox WHERE status IN ('pending','failed') AND attempts<10
      AND (locked_until IS NULL OR locked_until<now()) ORDER BY created_at LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) UPDATE public.outbox o SET locked_until=now()+interval '5 minutes', claim_token=gen_random_uuid(),attempts=attempts+1
    FROM batch WHERE o.id=batch.id RETURNING o.*;
END;
$$;
CREATE FUNCTION public.finish_outbox(p_id uuid,p_token uuid,p_error text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  UPDATE public.outbox SET status=CASE WHEN p_error IS NULL THEN 'processed' ELSE 'failed' END,
    processed_at=CASE WHEN p_error IS NULL THEN now() ELSE NULL END,
    last_error=left(p_error,300),locked_until=CASE WHEN p_error IS NULL THEN NULL ELSE now()+interval '5 minutes' END,claim_token=NULL
  WHERE id=p_id AND claim_token=p_token;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_cart(jsonb,text),public.available_delivery_slots(uuid),
 public.admin_adjust_stock(uuid,integer,text,text),public.core_audit_admin_write(),
 public.claim_outbox(integer),public.finish_outbox(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sync_cart(jsonb,text),public.available_delivery_slots(uuid),
 public.admin_adjust_stock(uuid,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbox(integer),public.finish_outbox(uuid,uuid,text) TO service_role;
COMMIT;
