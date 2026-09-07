-- Run once after the 20260907 migrations.
-- Replaces internal wash/dry/fold operational statuses with a simpler customer
-- workflow: received -> on_process -> ready. Released and cancelled remain
-- separate terminal transaction states.
BEGIN;

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS default_processing_minutes INTEGER;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS eta_buffer_minutes INTEGER NOT NULL DEFAULT 15;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS eta_min_completed_orders INTEGER NOT NULL DEFAULT 5;

-- Keep the old stage settings for backward compatibility, but use their total
-- as the initial default ETA for every newly migrated installation.
UPDATE public.settings
SET default_processing_minutes = COALESCE(
  default_processing_minutes,
  COALESCE(etawash, 45) + COALESCE(etadrying, 40) + COALESCE(etafolding, 15)
);
ALTER TABLE public.settings ALTER COLUMN default_processing_minutes SET DEFAULT 100;
UPDATE public.settings SET default_processing_minutes = 100 WHERE default_processing_minutes IS NULL OR default_processing_minutes < 1;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_processing_minutes INTEGER;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS eta_source TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS actual_completion TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stage_started_at TIMESTAMPTZ;

-- The previous schema restricts status to pending/washing/drying/folding/etc.
-- Remove that rule before converting legacy rows, then add the new workflow
-- rule after every old status has been mapped below.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- Preserve the state of existing work. An old item already in any internal
-- laundry stage is actively being processed; no order is discarded.
UPDATE public.orders
SET status = CASE
  WHEN status = 'pending' THEN 'received'
  WHEN status IN ('washing', 'drying', 'folding') THEN 'on_process'
  ELSE status
END;

UPDATE public.orders
SET processing_started_at = COALESCE(processing_started_at, stage_started_at, created_at)
WHERE status = 'on_process' AND processing_started_at IS NULL;

UPDATE public.orders
SET ready_at = COALESCE(ready_at, actual_completion, updated_at, created_at)
WHERE status IN ('ready', 'released') AND ready_at IS NULL;

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
CHECK (status IN ('received', 'on_process', 'ready', 'released', 'cancelled'));

-- A small bucket avoids comparing a 2 kg order to a 15 kg order. The ETA is
-- based on actual completed orders in the same branch and service where enough
-- data exists; otherwise it uses the administrator's configured default.
CREATE OR REPLACE FUNCTION public.estimate_order_processing_minutes(
  p_branch_id UUID,
  p_service_type_id UUID,
  p_weight_kg NUMERIC
) RETURNS TABLE(minutes INTEGER, source TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_default INTEGER;
  v_buffer INTEGER;
  v_min_samples INTEGER;
  v_average NUMERIC;
  v_count INTEGER;
  v_weight_bucket INTEGER := GREATEST(1, CEIL(COALESCE(p_weight_kg, 1) / 4.0));
BEGIN
  SELECT default_processing_minutes, eta_buffer_minutes, eta_min_completed_orders
  INTO v_default, v_buffer, v_min_samples FROM public.settings LIMIT 1;
  v_default := GREATEST(COALESCE(v_default, 100), 1);
  v_buffer := GREATEST(COALESCE(v_buffer, 15), 0);
  v_min_samples := GREATEST(COALESCE(v_min_samples, 5), 1);

  SELECT AVG(EXTRACT(EPOCH FROM (ready_at - processing_started_at)) / 60.0), COUNT(*)
  INTO v_average, v_count
  FROM public.orders
  WHERE branch_id = p_branch_id
    AND service_type_id IS NOT DISTINCT FROM p_service_type_id
    AND status IN ('ready', 'released')
    AND processing_started_at IS NOT NULL
    AND ready_at IS NOT NULL
    AND ready_at > processing_started_at
    AND CEIL(COALESCE(weight_kg, 1) / 4.0) = v_weight_bucket;

  IF COALESCE(v_count, 0) >= v_min_samples AND v_average IS NOT NULL THEN
    RETURN QUERY SELECT GREATEST(1, CEIL(v_average)::INTEGER + v_buffer), 'historical_service_branch'::TEXT;
  ELSE
    RETURN QUERY SELECT v_default + v_buffer, 'branch_default'::TEXT;
  END IF;
END $$;

-- Recalculate legacy active-order ETAs once. The timestamp is a saved promise,
-- so later Settings changes do not rewrite customer-facing ETAs.
WITH legacy_active_orders AS (
  SELECT id, branch_id, service_type_id, weight_kg, created_at
  FROM public.orders
  WHERE status IN ('received', 'on_process') AND estimated_ready_at IS NULL
), estimated_legacy_orders AS (
  SELECT o.id, o.created_at, e.minutes, e.source
  FROM legacy_active_orders o
  CROSS JOIN LATERAL public.estimate_order_processing_minutes(
    o.branch_id, o.service_type_id, o.weight_kg
  ) e
)
UPDATE public.orders o
SET estimated_processing_minutes = e.minutes,
    eta_source = e.source,
    estimated_ready_at = o.created_at + make_interval(mins => e.minutes)
FROM estimated_legacy_orders e
WHERE o.id = e.id;

CREATE OR REPLACE FUNCTION public.create_branch_order(
  p_branch_id UUID, p_staff_id UUID, p_customer JSONB, p_order JSONB, p_addons JSONB, p_loads INTEGER
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customer_id UUID; v_branch_name TEXT; v_item RECORD; v_required NUMERIC(10,4); v_order public.orders;
  v_eta_minutes INTEGER; v_eta_source TEXT;
BEGIN
  IF p_branch_id IS NULL OR p_staff_id IS NULL THEN RAISE EXCEPTION 'A staff branch assignment is required'; END IF;
  SELECT name INTO v_branch_name FROM public.branches WHERE id = p_branch_id;
  IF v_branch_name IS NULL THEN RAISE EXCEPTION 'Selected branch does not exist'; END IF;
  IF COALESCE(trim(p_customer->>'phone'), '') = '' OR COALESCE(trim(p_customer->>'name'), '') = '' THEN RAISE EXCEPTION 'Customer name and phone are required'; END IF;
  SELECT id INTO v_customer_id FROM public.customers
  WHERE regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace(trim(p_customer->>'phone'), '[^0-9]', '', 'g')
  LIMIT 1 FOR UPDATE;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers(name, phone, email, notes, branch, branch_id, created_by_staff_id)
    VALUES (trim(p_customer->>'name'), trim(p_customer->>'phone'), NULLIF(trim(p_customer->>'email'), ''), NULLIF(trim(p_customer->>'notes'), ''), v_branch_name, p_branch_id, p_staff_id)
    RETURNING id INTO v_customer_id;
  END IF;
  FOR v_item IN SELECT * FROM public.inventory_items WHERE branch_id = p_branch_id FOR UPDATE LOOP
    v_required := COALESCE(v_item.usage_per_load, 0) * GREATEST(p_loads, 0) + COALESCE((p_addons ->> v_item.id::TEXT)::NUMERIC, 0);
    IF v_required > COALESCE(v_item.current_stock, 0) THEN RAISE EXCEPTION '% has only % % remaining at %', v_item.name, v_item.current_stock, v_item.unit, v_branch_name; END IF;
  END LOOP;
  SELECT minutes, source INTO v_eta_minutes, v_eta_source
  FROM public.estimate_order_processing_minutes(p_branch_id, NULLIF(p_order->>'service_type_id', '')::UUID, (p_order->>'weight_kg')::NUMERIC);
  INSERT INTO public.orders(customer_id, service_type_id, weight_kg, total_price, addons, notes, payment_method, payment_status, amount_paid, branch, branch_id, created_by_staff_id, last_updated_by_staff_id, status, estimated_processing_minutes, eta_source, estimated_ready_at)
  VALUES (v_customer_id, NULLIF(p_order->>'service_type_id', '')::UUID, (p_order->>'weight_kg')::NUMERIC, (p_order->>'total_price')::NUMERIC, COALESCE(p_addons, '{}'::JSONB), NULLIF(p_order->>'notes', ''), COALESCE(NULLIF(p_order->>'payment_method', ''), 'cash'), COALESCE(NULLIF(p_order->>'payment_status', ''), 'unpaid'), COALESCE((p_order->>'amount_paid')::NUMERIC, 0), v_branch_name, p_branch_id, p_staff_id, p_staff_id, 'received', v_eta_minutes, v_eta_source, now() + make_interval(mins => v_eta_minutes)) RETURNING * INTO v_order;
  FOR v_item IN SELECT * FROM public.inventory_items WHERE branch_id = p_branch_id FOR UPDATE LOOP
    v_required := COALESCE(v_item.usage_per_load, 0) * GREATEST(p_loads, 0) + COALESCE((p_addons ->> v_item.id::TEXT)::NUMERIC, 0);
    IF v_required > 0 THEN UPDATE public.inventory_items SET current_stock = current_stock - v_required WHERE id = v_item.id; INSERT INTO public.inventory_usage_log(item_id, quantity_used, order_id) VALUES (v_item.id, v_required, v_order.id); END IF;
  END LOOP;
  INSERT INTO public.customer_branches(customer_id, branch_id, first_served_at, last_served_at, order_count)
  VALUES (v_customer_id, p_branch_id, now(), now(), 1)
  ON CONFLICT (customer_id, branch_id) DO UPDATE SET last_served_at = now(), order_count = public.customer_branches.order_count + 1;
  RETURN v_order;
END $$;

-- The API verifies role and branch before calling this function. The function
-- nevertheless refuses skipped or reverse transitions and records timestamps.
CREATE OR REPLACE FUNCTION public.transition_branch_order(
  p_order_id UUID, p_staff_id UUID, p_new_status TEXT
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status = 'received' AND p_new_status = 'on_process' THEN
    UPDATE public.orders SET status = 'on_process', processing_started_at = COALESCE(processing_started_at, now()), last_updated_by_staff_id = p_staff_id, updated_at = now() WHERE id = p_order_id RETURNING * INTO v_order;
  ELSIF v_order.status = 'on_process' AND p_new_status = 'ready' THEN
    UPDATE public.orders SET status = 'ready', ready_at = now(), actual_completion = now(), last_updated_by_staff_id = p_staff_id, updated_at = now() WHERE id = p_order_id RETURNING * INTO v_order;
  ELSE
    RAISE EXCEPTION 'Orders can only move from Received to On Process, then Ready for Pickup';
  END IF;
  RETURN v_order;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_eta_training ON public.orders(branch_id, service_type_id, status, processing_started_at, ready_at);
CREATE INDEX IF NOT EXISTS idx_orders_estimated_ready ON public.orders(estimated_ready_at) WHERE estimated_ready_at IS NOT NULL;
COMMIT;
