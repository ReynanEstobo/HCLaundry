-- Run after 20260909_account_email_change.sql.
-- Validates an email-change OTP without changing account data. The final
-- confirmation function still consumes the code atomically when it updates
-- the contact email.
BEGIN;

CREATE OR REPLACE FUNCTION public.verify_account_email_change(
  p_auth_user_id UUID, p_challenge_id UUID, p_code_hash TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_staff public.staff;
  v_challenge public.email_change_otps;
BEGIN
  SELECT * INTO v_staff FROM public.staff
    WHERE auth_id = p_auth_user_id AND deleted_at IS NULL FOR UPDATE;
  IF v_staff.id IS NULL OR v_staff.must_change_password THEN
    RETURN jsonb_build_object('error', 'An active, activated account is required.');
  END IF;
  SELECT * INTO v_challenge FROM public.email_change_otps
    WHERE id = p_challenge_id AND auth_user_id = p_auth_user_id AND staff_id = v_staff.id FOR UPDATE;
  IF v_challenge.id IS NULL OR v_challenge.consumed_at IS NOT NULL
     OR v_challenge.expires_at <= now() OR v_challenge.attempts >= 5 THEN
    RETURN jsonb_build_object('error', 'Code expired or unavailable. Request a new code.');
  END IF;
  IF v_challenge.previous_email IS DISTINCT FROM v_staff.contact_email THEN
    RETURN jsonb_build_object('error', 'Your account email changed. Request a new code.');
  END IF;
  IF p_code_hash IS DISTINCT FROM v_challenge.code_hash THEN
    UPDATE public.email_change_otps SET attempts = attempts + 1 WHERE id = v_challenge.id;
    RETURN jsonb_build_object('error', 'Invalid verification code.');
  END IF;
  RETURN jsonb_build_object('success', true);
END $$;

REVOKE ALL ON FUNCTION public.verify_account_email_change(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_account_email_change(UUID, UUID, TEXT) TO service_role;
COMMIT;
