-- Safe migration for the existing H&C Laundry database. Run once in Supabase SQL Editor.
-- It preserves all rows and does NOT drop existing operational tables.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  code TEXT UNIQUE,
  address TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Existing database uses branch_name/status. Keep those columns for current
-- UI compatibility, then add the normalized fields used by relationships.
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS id UUID DEFAULT uuid_generate_v4();
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
UPDATE public.branches SET id = uuid_generate_v4() WHERE id IS NULL;
UPDATE public.branches SET name = branch_name WHERE name IS NULL AND branch_name IS NOT NULL;
UPDATE public.branches SET is_active = (status = 'active') WHERE status IS NOT NULL;
ALTER TABLE public.branches ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS branches_id_unique ON public.branches(id);
CREATE UNIQUE INDEX IF NOT EXISTS branches_name_unique ON public.branches(name);
-- branch_name is NOT NULL in the live database, so populate both names.
-- The WHERE NOT EXISTS checks keep this safe to run more than once.
INSERT INTO public.branches (branch_name, name, code, status, is_active)
SELECT seed.branch_name, seed.branch_name, seed.code, 'active', TRUE
FROM (VALUES
  ('Main - Brgy 7'::TEXT, 'MAIN-B7'::TEXT),
  ('2nd Branch - Brgy Calzada'::TEXT, 'CALZADA'::TEXT),
  ('3rd Branch - Nasugbu'::TEXT, 'NASUGBU'::TEXT)
) AS seed(branch_name, code)
WHERE NOT EXISTS (
  SELECT 1 FROM public.branches existing
  WHERE existing.branch_name = seed.branch_name OR existing.name = seed.branch_name
);

CREATE TABLE IF NOT EXISTS public.settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), darkmode BOOLEAN DEFAULT FALSE, notifications BOOLEAN DEFAULT TRUE,
  bundlekg NUMERIC DEFAULT 8, bundleprice NUMERIC DEFAULT 200, addonprice NUMERIC DEFAULT 15, excesskgprice NUMERIC DEFAULT 30,
  etawash INTEGER DEFAULT 45, etadrying INTEGER DEFAULT 40, etafolding INTEGER DEFAULT 15,
  defaultview TEXT DEFAULT 'table', capacitywash INTEGER DEFAULT 2, capacitydrying INTEGER DEFAULT 3, capacityfolding INTEGER DEFAULT 4,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS defaultview TEXT DEFAULT 'table';
INSERT INTO public.settings (id)
SELECT uuid_generate_v4()
WHERE NOT EXISTS (SELECT 1 FROM public.settings);

ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS addons JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS priority_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.ai_forecasts ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

-- Preserve text-based branch behavior while introducing a normalized branch relation.
UPDATE public.staff s SET branch_id = b.id FROM public.branches b WHERE s.branch = b.name AND s.branch_id IS NULL;
UPDATE public.inventory_items i SET branch_id = b.id FROM public.branches b WHERE i.branch = b.name AND i.branch_id IS NULL;
UPDATE public.orders o SET branch_id = b.id FROM public.branches b WHERE o.branch = b.name AND o.branch_id IS NULL;
UPDATE public.expenses e SET branch_id = b.id FROM public.branches b WHERE e.branch = b.name AND e.branch_id IS NULL;

-- New staff-created orders are stamped by the backend with the creator and
-- the staff member's assigned branch. This index makes branch-scoped lists fast.
CREATE INDEX IF NOT EXISTS idx_orders_branch_creator ON public.orders(branch_id, created_by_staff_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.sync_branch_name() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.branch_id IS NULL AND NEW.branch IS NOT NULL THEN
    SELECT id INTO NEW.branch_id FROM public.branches WHERE name = NEW.branch LIMIT 1;
  END IF;
  IF NEW.branch_id IS NOT NULL THEN SELECT name INTO NEW.branch FROM public.branches WHERE id = NEW.branch_id; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_staff_branch_name ON public.staff;
DROP TRIGGER IF EXISTS tr_inventory_branch_name ON public.inventory_items;
DROP TRIGGER IF EXISTS tr_orders_branch_name ON public.orders;
DROP TRIGGER IF EXISTS tr_expenses_branch_name ON public.expenses;
CREATE TRIGGER tr_staff_branch_name BEFORE INSERT OR UPDATE OF branch, branch_id ON public.staff FOR EACH ROW EXECUTE FUNCTION public.sync_branch_name();
CREATE TRIGGER tr_inventory_branch_name BEFORE INSERT OR UPDATE OF branch, branch_id ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.sync_branch_name();
CREATE TRIGGER tr_orders_branch_name BEFORE INSERT OR UPDATE OF branch, branch_id ON public.orders FOR EACH ROW EXECUTE FUNCTION public.sync_branch_name();
CREATE TRIGGER tr_expenses_branch_name BEFORE INSERT OR UPDATE OF branch, branch_id ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.sync_branch_name();

-- Defense in depth for any future direct Supabase access. The backend uses the
-- service role and enforces the same rule before every order request.
CREATE OR REPLACE FUNCTION public.current_staff_branch_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT branch_id FROM public.staff WHERE auth_id = auth.uid() LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.current_staff_role() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.staff WHERE auth_id = auth.uid() LIMIT 1
$$;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_branch_order_access ON public.orders;
CREATE POLICY staff_branch_order_access ON public.orders
FOR ALL TO authenticated
USING (
  public.current_staff_role() = 'admin'
  OR (public.current_staff_role() = 'staff' AND branch_id = public.current_staff_branch_id())
)
WITH CHECK (
  public.current_staff_role() = 'admin'
  OR (public.current_staff_role() = 'staff' AND branch_id = public.current_staff_branch_id())
);

-- Keep the order payment summary synchronized with the payment ledger.
CREATE OR REPLACE FUNCTION public.record_order_payment() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE previous_paid NUMERIC(10,2) := COALESCE(OLD.amount_paid, 0);
BEGIN
  IF COALESCE(NEW.amount_paid, 0) > previous_paid THEN
    INSERT INTO public.payments (order_id, amount, payment_method, payment_status)
    VALUES (NEW.id, NEW.amount_paid - previous_paid, COALESCE(NEW.payment_method, 'cash'),
      CASE WHEN NEW.amount_paid >= NEW.total_price THEN 'paid' ELSE 'partial' END);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_record_order_payment ON public.orders;
CREATE TRIGGER tr_record_order_payment AFTER INSERT OR UPDATE OF amount_paid ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.record_order_payment();

CREATE OR REPLACE FUNCTION public.refresh_order_payment_summary() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE target_order UUID; total NUMERIC(10,2); price NUMERIC(10,2);
BEGIN
  target_order := COALESCE(NEW.order_id, OLD.order_id);
  SELECT COALESCE(SUM(amount),0) INTO total FROM public.payments WHERE order_id = target_order;
  SELECT total_price INTO price FROM public.orders WHERE id = target_order;
  UPDATE public.orders SET amount_paid = total, payment_status = CASE WHEN total <= 0 THEN 'unpaid' WHEN total >= price THEN 'paid' ELSE 'partial' END WHERE id = target_order;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS tr_refresh_order_payment_summary ON public.payments;
CREATE TRIGGER tr_refresh_order_payment_summary AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.refresh_order_payment_summary();

CREATE INDEX IF NOT EXISTS idx_orders_branch_created ON public.orders(branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_branch_date ON public.expenses(branch_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_payments_order_date ON public.payments(order_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_branch_type ON public.ai_forecasts(branch_id, forecast_type, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
