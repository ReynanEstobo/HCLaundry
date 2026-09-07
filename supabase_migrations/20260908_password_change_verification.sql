-- Run once after 20260908_staff_account_provisioning.sql.
-- Stores short-lived, single-use verification challenges for self-service
-- password changes. Codes are hashed; plaintext OTPs are never saved.
BEGIN;

CREATE TABLE IF NOT EXISTS public.password_change_otps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID NOT NULL,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_password_change_otps_active
  ON public.password_change_otps(auth_user_id, requested_at DESC)
  WHERE consumed_at IS NULL;

ALTER TABLE public.password_change_otps ENABLE ROW LEVEL SECURITY;

COMMIT;
