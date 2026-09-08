-- Run once after 20260908_staff_account_provisioning.sql.
-- Administrators are global accounts. Their permissions are role-based and
-- must not be represented as a branch assignment.
BEGIN;

UPDATE public.staff
SET branch = NULL,
    branch_id = NULL
WHERE lower(COALESCE(role, '')) = 'admin'
  AND (branch IS NOT NULL OR branch_id IS NOT NULL);

COMMIT;
