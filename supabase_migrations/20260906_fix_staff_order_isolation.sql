-- Run once after the multi-branch migration to repair legacy staff accounts.
-- It only links rows that have a blank auth_id and the exact same email.
BEGIN;

UPDATE public.staff s
SET auth_id = u.id
FROM auth.users u
WHERE s.auth_id IS NULL
  AND s.email IS NOT NULL
  AND lower(s.email) = lower(u.email);

UPDATE public.staff s
SET branch_id = b.id
FROM public.branches b
WHERE s.branch_id IS NULL
  AND s.branch = b.name;

CREATE UNIQUE INDEX IF NOT EXISTS staff_auth_id_unique
ON public.staff (auth_id)
WHERE auth_id IS NOT NULL;

COMMIT;
