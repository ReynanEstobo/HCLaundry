-- Run once after the existing multi-branch and customer migrations.
-- This preserves operational data and makes branch inventory/order processing atomic.
BEGIN;

-- A customer remains one central record. This table records each branch that has
-- served the customer, allowing staff to see their branch's clients without
-- duplicating a customer when they visit another branch.
CREATE TABLE IF NOT EXISTS public.customer_branches (
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  first_served_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_served_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  order_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (customer_id, branch_id)
);
CREATE INDEX IF NOT EXISTS idx_customer_branches_branch ON public.customer_branches(branch_id, last_served_at DESC);

-- Branch ownership is recorded for operational inventory documents as well.
ALTER TABLE public.inventory_restocks ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE public.inventory_restocks ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_usage_log ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE public.inventory_usage_log ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS completed_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_updated_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

-- Seed association rows from legacy customer/order branch values.
INSERT INTO public.customer_branches (customer_id, branch_id, first_served_at, last_served_at, order_count)
SELECT o.customer_id, o.branch_id, MIN(o.created_at), MAX(o.created_at), COUNT(*)::INTEGER
FROM public.orders o
WHERE o.customer_id IS NOT NULL AND o.branch_id IS NOT NULL
GROUP BY o.customer_id, o.branch_id
ON CONFLICT (customer_id, branch_id) DO UPDATE
SET last_served_at = GREATEST(public.customer_branches.last_served_at, EXCLUDED.last_served_at),
    order_count = GREATEST(public.customer_branches.order_count, EXCLUDED.order_count);

INSERT INTO public.customer_branches (customer_id, branch_id)
SELECT c.id, c.branch_id FROM public.customers c
WHERE c.branch_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_customer_branch_access() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    INSERT INTO public.customer_branches(customer_id, branch_id, last_served_at)
    VALUES (NEW.id, NEW.branch_id, now())
    ON CONFLICT (customer_id, branch_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_ensure_customer_branch_access ON public.customers;
CREATE TRIGGER tr_ensure_customer_branch_access AFTER INSERT OR UPDATE OF branch_id ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.ensure_customer_branch_access();

-- Copy an item's branch into restock/usage logs. The server independently
-- checks the branch before it changes stock.
CREATE OR REPLACE FUNCTION public.sync_inventory_log_branch() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT branch_id, branch INTO NEW.branch_id, NEW.branch
  FROM public.inventory_items WHERE id = NEW.item_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_inventory_restock_branch ON public.inventory_restocks;
DROP TRIGGER IF EXISTS tr_inventory_usage_branch ON public.inventory_usage_log;
CREATE TRIGGER tr_inventory_restock_branch BEFORE INSERT OR UPDATE OF item_id ON public.inventory_restocks
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_log_branch();
CREATE TRIGGER tr_inventory_usage_branch BEFORE INSERT OR UPDATE OF item_id ON public.inventory_usage_log
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_log_branch();

-- Atomic server-side order creation. It locks only the selected branch's
-- inventory, rejects insufficient stock, creates usage logs, and records the
-- customer/branch relationship in one transaction.
CREATE OR REPLACE FUNCTION public.create_branch_order(
  p_branch_id UUID,
  p_staff_id UUID,
  p_customer JSONB,
  p_order JSONB,
  p_addons JSONB,
  p_loads INTEGER
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customer_id UUID;
  v_branch_name TEXT;
  v_item RECORD;
  v_required NUMERIC(10,4);
  v_order public.orders;
BEGIN
  IF p_branch_id IS NULL OR p_staff_id IS NULL THEN RAISE EXCEPTION 'A staff branch assignment is required'; END IF;
  SELECT name INTO v_branch_name FROM public.branches WHERE id = p_branch_id;
  IF v_branch_name IS NULL THEN RAISE EXCEPTION 'Selected branch does not exist'; END IF;
  IF COALESCE(trim(p_customer->>'phone'), '') = '' OR COALESCE(trim(p_customer->>'name'), '') = '' THEN
    RAISE EXCEPTION 'Customer name and phone are required';
  END IF;

  SELECT id INTO v_customer_id FROM public.customers
  WHERE phone = trim(p_customer->>'phone') ORDER BY created_at NULLS LAST LIMIT 1 FOR UPDATE;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (name, phone, email, notes, branch, branch_id, created_by_staff_id)
    VALUES (trim(p_customer->>'name'), trim(p_customer->>'phone'), NULLIF(trim(p_customer->>'email'), ''), NULLIF(trim(p_customer->>'notes'), ''), v_branch_name, p_branch_id, p_staff_id)
    RETURNING id INTO v_customer_id;
  END IF;

  -- Lock every stock row used by this branch before checking or deducting it.
  FOR v_item IN SELECT * FROM public.inventory_items WHERE branch_id = p_branch_id FOR UPDATE LOOP
    v_required := COALESCE(v_item.usage_per_load, 0) * GREATEST(p_loads, 0)
      + COALESCE((p_addons ->> v_item.id::TEXT)::NUMERIC, 0);
    IF v_required > COALESCE(v_item.current_stock, 0) THEN
      RAISE EXCEPTION '% has only % % remaining at %', v_item.name, v_item.current_stock, v_item.unit, v_branch_name;
    END IF;
  END LOOP;

  INSERT INTO public.orders (
    customer_id, service_type_id, weight_kg, total_price, addons, notes, payment_method,
    payment_status, amount_paid, branch, branch_id, created_by_staff_id,
    last_updated_by_staff_id, status
  ) VALUES (
    v_customer_id, NULLIF(p_order->>'service_type_id', '')::UUID, (p_order->>'weight_kg')::NUMERIC, (p_order->>'total_price')::NUMERIC,
    COALESCE(p_addons, '{}'::JSONB), NULLIF(p_order->>'notes', ''),
    COALESCE(NULLIF(p_order->>'payment_method', ''), 'cash'),
    COALESCE(NULLIF(p_order->>'payment_status', ''), 'unpaid'),
    COALESCE((p_order->>'amount_paid')::NUMERIC, 0), v_branch_name, p_branch_id,
    p_staff_id, p_staff_id, 'pending'
  ) RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM public.inventory_items WHERE branch_id = p_branch_id FOR UPDATE LOOP
    v_required := COALESCE(v_item.usage_per_load, 0) * GREATEST(p_loads, 0)
      + COALESCE((p_addons ->> v_item.id::TEXT)::NUMERIC, 0);
    IF v_required > 0 THEN
      UPDATE public.inventory_items SET current_stock = current_stock - v_required WHERE id = v_item.id;
      INSERT INTO public.inventory_usage_log (item_id, quantity_used, order_id) VALUES (v_item.id, v_required, v_order.id);
    END IF;
  END LOOP;

  INSERT INTO public.customer_branches (customer_id, branch_id, first_served_at, last_served_at, order_count)
  VALUES (v_customer_id, p_branch_id, now(), now(), 1)
  ON CONFLICT (customer_id, branch_id) DO UPDATE
  SET last_served_at = now(), order_count = public.customer_branches.order_count + 1;

  RETURN v_order;
END $$;

-- Atomic restock and expense recording for one inventory item.
CREATE OR REPLACE FUNCTION public.restock_branch_inventory(
  p_item_id UUID,
  p_quantity NUMERIC,
  p_cost_total NUMERIC,
  p_supplier TEXT
) RETURNS public.inventory_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item public.inventory_items;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Restock quantity must be greater than zero'; END IF;
  SELECT * INTO v_item FROM public.inventory_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Inventory item not found'; END IF;
  UPDATE public.inventory_items SET current_stock = current_stock + p_quantity WHERE id = p_item_id RETURNING * INTO v_item;
  INSERT INTO public.inventory_restocks(item_id, quantity_added, cost_total, supplier)
  VALUES (p_item_id, p_quantity, NULLIF(p_cost_total, 0), NULLIF(p_supplier, ''));
  IF COALESCE(p_cost_total, 0) > 0 THEN
    INSERT INTO public.expenses(category, description, amount, expense_date, branch, branch_id)
    VALUES ('inventory', format('Restock: %s (%s %s)', v_item.name, p_quantity, v_item.unit), p_cost_total, CURRENT_DATE, v_item.branch, v_item.branch_id);
  END IF;
  RETURN v_item;
END $$;

-- A normalized performance/event trail for branch and staff productivity reports.
CREATE TABLE IF NOT EXISTS public.order_stage_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  previous_status TEXT,
  status TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_stage_history_branch_status ON public.order_stage_history(branch_id, status, changed_at DESC);

CREATE OR REPLACE FUNCTION public.capture_order_stage_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.order_stage_history(order_id, branch_id, staff_id, previous_status, status)
  VALUES (NEW.id, NEW.branch_id, COALESCE(NEW.last_updated_by_staff_id, NEW.created_by_staff_id),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END, NEW.status);
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.stamp_order_completion() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'released' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'released') THEN
    NEW.completed_by_staff_id := COALESCE(NEW.last_updated_by_staff_id, NEW.created_by_staff_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_capture_order_stage_change ON public.orders;
DROP TRIGGER IF EXISTS tr_stamp_order_completion ON public.orders;
CREATE TRIGGER tr_stamp_order_completion BEFORE INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.stamp_order_completion();
CREATE TRIGGER tr_capture_order_stage_change AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.capture_order_stage_change();

CREATE INDEX IF NOT EXISTS idx_inventory_items_branch_name ON public.inventory_items(branch_id, name);
CREATE INDEX IF NOT EXISTS idx_inventory_usage_branch_logged ON public.inventory_usage_log(branch_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_restock_branch_at ON public.inventory_restocks(branch_id, restocked_at DESC);
COMMIT;
