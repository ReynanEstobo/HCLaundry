-- Run once after 20260906_branch_safe_operations_and_analytics.sql.
-- It merges accidental duplicate customer records by normalized phone number,
-- preserves their orders/SMS history, and enforces one central customer per phone.
BEGIN;

-- First preserve every branch association on the oldest customer record.
WITH duplicates AS (
  SELECT id, first_value(id) OVER (
    PARTITION BY regexp_replace(phone, '[^0-9]', '', 'g') ORDER BY created_at NULLS LAST, id
  ) AS keeper_id
  FROM public.customers
)
INSERT INTO public.customer_branches (customer_id, branch_id, first_served_at, last_served_at, order_count)
SELECT d.keeper_id, cb.branch_id, MIN(cb.first_served_at), MAX(cb.last_served_at), SUM(cb.order_count)::INTEGER
FROM duplicates d
JOIN public.customer_branches cb ON cb.customer_id = d.id
WHERE d.id <> d.keeper_id
GROUP BY d.keeper_id, cb.branch_id
ON CONFLICT (customer_id, branch_id) DO UPDATE
SET first_served_at = LEAST(public.customer_branches.first_served_at, EXCLUDED.first_served_at),
    last_served_at = GREATEST(public.customer_branches.last_served_at, EXCLUDED.last_served_at),
    order_count = public.customer_branches.order_count + EXCLUDED.order_count;

WITH duplicates AS (
  SELECT id, first_value(id) OVER (
    PARTITION BY regexp_replace(phone, '[^0-9]', '', 'g') ORDER BY created_at NULLS LAST, id
  ) AS keeper_id
  FROM public.customers
)
UPDATE public.orders o SET customer_id = d.keeper_id
FROM duplicates d WHERE o.customer_id = d.id AND d.id <> d.keeper_id;

WITH duplicates AS (
  SELECT id, first_value(id) OVER (
    PARTITION BY regexp_replace(phone, '[^0-9]', '', 'g') ORDER BY created_at NULLS LAST, id
  ) AS keeper_id
  FROM public.customers
)
UPDATE public.sms_log s SET customer_id = d.keeper_id
FROM duplicates d WHERE s.customer_id = d.id AND d.id <> d.keeper_id;

WITH duplicates AS (
  SELECT id, first_value(id) OVER (
    PARTITION BY regexp_replace(phone, '[^0-9]', '', 'g') ORDER BY created_at NULLS LAST, id
  ) AS keeper_id
  FROM public.customers
)
DELETE FROM public.customers c USING duplicates d
WHERE c.id = d.id AND d.id <> d.keeper_id;

CREATE UNIQUE INDEX IF NOT EXISTS customers_normalized_phone_unique
ON public.customers ((regexp_replace(phone, '[^0-9]', '', 'g')));

CREATE OR REPLACE FUNCTION public.find_customer_by_phone(p_phone TEXT)
RETURNS TABLE(id UUID, name TEXT, phone TEXT, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, c.phone, c.email
  FROM public.customers c
  WHERE regexp_replace(c.phone, '[^0-9]', '', 'g') = regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g')
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.register_branch_customer(
  p_branch_id UUID,
  p_staff_id UUID,
  p_name TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_notes TEXT
) RETURNS public.customers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer public.customers;
BEGIN
  IF COALESCE(trim(p_name), '') = '' OR COALESCE(trim(p_phone), '') = '' THEN
    RAISE EXCEPTION 'Customer name and phone are required';
  END IF;
  SELECT * INTO v_customer FROM public.customers
  WHERE regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g')
  LIMIT 1 FOR UPDATE;
  IF v_customer.id IS NULL THEN
    INSERT INTO public.customers(name, phone, email, notes, branch, branch_id, created_by_staff_id)
    SELECT trim(p_name), trim(p_phone), NULLIF(trim(p_email), ''), NULLIF(trim(p_notes), ''), name, p_branch_id, p_staff_id
    FROM public.branches WHERE id = p_branch_id
    RETURNING * INTO v_customer;
  END IF;
  INSERT INTO public.customer_branches(customer_id, branch_id, last_served_at)
  VALUES (v_customer.id, p_branch_id, now()) ON CONFLICT DO NOTHING;
  RETURN v_customer;
END $$;

-- Keep the atomic order workflow on the same normalized customer identity.
CREATE OR REPLACE FUNCTION public.create_branch_order(
  p_branch_id UUID, p_staff_id UUID, p_customer JSONB, p_order JSONB, p_addons JSONB, p_loads INTEGER
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer_id UUID; v_branch_name TEXT; v_item RECORD; v_required NUMERIC(10,4); v_order public.orders;
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
    VALUES (trim(p_customer->>'name'), trim(p_customer->>'phone'), NULLIF(trim(p_customer->>'email'), ''), NULL, v_branch_name, p_branch_id, p_staff_id) RETURNING id INTO v_customer_id;
  END IF;
  FOR v_item IN SELECT * FROM public.inventory_items WHERE branch_id = p_branch_id FOR UPDATE LOOP
    v_required := COALESCE(v_item.usage_per_load, 0) * GREATEST(p_loads, 0) + COALESCE((p_addons ->> v_item.id::TEXT)::NUMERIC, 0);
    IF v_required > COALESCE(v_item.current_stock, 0) THEN RAISE EXCEPTION '% has only % % remaining at %', v_item.name, v_item.current_stock, v_item.unit, v_branch_name; END IF;
  END LOOP;
  INSERT INTO public.orders(customer_id, service_type_id, weight_kg, total_price, addons, notes, payment_method, payment_status, amount_paid, branch, branch_id, created_by_staff_id, last_updated_by_staff_id, status)
  VALUES (v_customer_id, NULLIF(p_order->>'service_type_id', '')::UUID, (p_order->>'weight_kg')::NUMERIC, (p_order->>'total_price')::NUMERIC, COALESCE(p_addons, '{}'::JSONB), NULLIF(p_order->>'notes', ''), COALESCE(NULLIF(p_order->>'payment_method', ''), 'cash'), COALESCE(NULLIF(p_order->>'payment_status', ''), 'unpaid'), COALESCE((p_order->>'amount_paid')::NUMERIC, 0), v_branch_name, p_branch_id, p_staff_id, p_staff_id, 'pending') RETURNING * INTO v_order;
  FOR v_item IN SELECT * FROM public.inventory_items WHERE branch_id = p_branch_id FOR UPDATE LOOP
    v_required := COALESCE(v_item.usage_per_load, 0) * GREATEST(p_loads, 0) + COALESCE((p_addons ->> v_item.id::TEXT)::NUMERIC, 0);
    IF v_required > 0 THEN UPDATE public.inventory_items SET current_stock = current_stock - v_required WHERE id = v_item.id; INSERT INTO public.inventory_usage_log(item_id, quantity_used, order_id) VALUES (v_item.id, v_required, v_order.id); END IF;
  END LOOP;
  INSERT INTO public.customer_branches(customer_id, branch_id, first_served_at, last_served_at, order_count)
  VALUES (v_customer_id, p_branch_id, now(), now(), 1)
  ON CONFLICT (customer_id, branch_id) DO UPDATE SET last_served_at = now(), order_count = public.customer_branches.order_count + 1;
  RETURN v_order;
END $$;

COMMIT;
