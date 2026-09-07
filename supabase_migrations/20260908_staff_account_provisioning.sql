-- Run once after 20260908_rebrand_hc_laundry.sql.
-- Supports administrator-provisioned staff accounts with generated identifiers
-- and first-login password changes.
BEGIN;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS staff_code TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS credentials_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credentials_issued_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS staff_staff_code_unique
  ON public.staff(staff_code) WHERE staff_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS staff_username_unique
  ON public.staff(lower(username)) WHERE username IS NOT NULL;

-- Capture provisioning and credential-reset events in the existing audit trail.
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_action_check
  CHECK (action IN ('delete', 'restore', 'cancel', 'provision', 'credentials_reset', 'update'));

COMMIT;
