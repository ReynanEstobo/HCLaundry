-- Run once after the multi-branch migration.
-- Adds branch ownership to client/customer records without deleting rows.
BEGIN;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS created_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

-- Existing customer records cannot be reliably assigned automatically; an
-- administrator should assign their branch from the Client edit screen.

DROP TRIGGER IF EXISTS tr_customers_branch_name ON public.customers;
CREATE TRIGGER tr_customers_branch_name
BEFORE INSERT OR UPDATE OF branch, branch_id ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.sync_branch_name();

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_branch_customer_access ON public.customers;
CREATE POLICY staff_branch_customer_access ON public.customers
FOR ALL TO authenticated
USING (
  public.current_staff_role() = 'admin'
  OR (public.current_staff_role() = 'staff' AND branch_id = public.current_staff_branch_id())
)
WITH CHECK (
  public.current_staff_role() = 'admin'
  OR (public.current_staff_role() = 'staff' AND branch_id = public.current_staff_branch_id())
);

CREATE INDEX IF NOT EXISTS idx_customers_branch_created
ON public.customers(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_branch_creator
ON public.customers(branch_id, created_by_staff_id);

COMMIT;
