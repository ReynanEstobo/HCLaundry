-- Run once after the existing multi-branch migrations.
-- Adds recoverable deletion and an immutable audit trail without deleting data.
BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL CHECK (action IN ('delete', 'restore')),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  actor_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  before_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only these tables use the Recycle Bin. Financial/transaction records remain
-- permanent so reporting, payment, and stock usage stay auditable.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS deleted_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS deleted_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS deleted_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.inventory_categories ADD COLUMN IF NOT EXISTS deleted_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE public.service_types ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.service_types ADD COLUMN IF NOT EXISTS deleted_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS deleted_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON public.audit_logs(table_name, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON public.customers(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_deleted_at ON public.staff(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_items_deleted_at ON public.inventory_items(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_categories_deleted_at ON public.inventory_categories(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_types_deleted_at ON public.service_types(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_deleted_at ON public.expenses(deleted_at) WHERE deleted_at IS NOT NULL;

-- The application uses the backend service role. This policy is defense in
-- depth for any future direct authenticated Supabase use.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_audit_log_read ON public.audit_logs;
CREATE POLICY admin_audit_log_read ON public.audit_logs
FOR SELECT TO authenticated
USING (public.current_staff_role() = 'admin');

COMMIT;
