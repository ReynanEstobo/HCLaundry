-- Run once after 20260908_three_stage_order_eta.sql.
-- Adds auditable, adjacent-stage corrections to the three-stage order flow.
BEGIN;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS status_undo_seconds INTEGER NOT NULL DEFAULT 60;
UPDATE public.settings
SET status_undo_seconds = 60
WHERE status_undo_seconds IS NULL OR status_undo_seconds < 1;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS original_estimated_ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eta_revised_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eta_revision_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_status_changed_at TIMESTAMPTZ;

UPDATE public.orders
SET original_estimated_ready_at = estimated_ready_at
WHERE original_estimated_ready_at IS NULL AND estimated_ready_at IS NOT NULL;

ALTER TABLE public.order_stage_history
  ADD COLUMN IF NOT EXISTS transition_type TEXT NOT NULL DEFAULT 'advance',
  ADD COLUMN IF NOT EXISTS correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS eta_before TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eta_after TIMESTAMPTZ;
ALTER TABLE public.order_stage_history DROP CONSTRAINT IF EXISTS order_stage_history_transition_type_check;
ALTER TABLE public.order_stage_history ADD CONSTRAINT order_stage_history_transition_type_check
  CHECK (transition_type IN ('created', 'advance', 'correction', 'release', 'cancel'));
CREATE INDEX IF NOT EXISTS idx_order_stage_history_order_changed
  ON public.order_stage_history(order_id, changed_at DESC);

-- The transition function sets transaction-local metadata immediately before
-- changing an order. The AFTER trigger records it in the immutable history.
CREATE OR REPLACE FUNCTION public.capture_order_stage_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_type TEXT;
  v_reason TEXT;
  v_eta_before TIMESTAMPTZ;
BEGIN
  v_type := COALESCE(NULLIF(current_setting('app.order_transition_type', true), ''),
    CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'advance' END);
  v_reason := NULLIF(current_setting('app.order_correction_reason', true), '');
  v_eta_before := NULLIF(current_setting('app.order_eta_before', true), '')::TIMESTAMPTZ;

  INSERT INTO public.order_stage_history(
    order_id, branch_id, staff_id, previous_status, status,
    transition_type, correction_reason, eta_before, eta_after
  ) VALUES (
    NEW.id, NEW.branch_id,
    COALESCE(NEW.last_updated_by_staff_id, NEW.created_by_staff_id),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
    NEW.status, v_type, v_reason, v_eta_before, NEW.estimated_ready_at
  );
  RETURN NEW;
END $$;

-- Adjacent workflow transitions only. A staff member may undo their own most
-- recent action during the configured window; administrators may correct a
-- branch order at any time, but every backward move requires a reason.
DROP FUNCTION IF EXISTS public.transition_branch_order(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.transition_branch_order(
  p_order_id UUID,
  p_staff_id UUID,
  p_new_status TEXT,
  p_correction_reason TEXT DEFAULT NULL
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders;
  v_actor RECORD;
  v_last_event RECORD;
  v_is_admin BOOLEAN := FALSE;
  v_is_backward BOOLEAN := FALSE;
  v_undo_seconds INTEGER := 60;
  v_eta_before TIMESTAMPTZ;
  v_revised_minutes INTEGER;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status IN ('released', 'cancelled') THEN
    RAISE EXCEPTION 'Released and cancelled orders are locked from stage changes';
  END IF;

  SELECT id, role, branch_id INTO v_actor FROM public.staff WHERE id = p_staff_id AND deleted_at IS NULL;
  IF v_actor.id IS NULL THEN RAISE EXCEPTION 'A valid active staff account is required'; END IF;
  v_is_admin := lower(COALESCE(v_actor.role, '')) = 'admin';
  IF NOT v_is_admin AND v_actor.branch_id IS DISTINCT FROM v_order.branch_id THEN
    RAISE EXCEPTION 'You can only update orders assigned to your branch';
  END IF;

  IF (v_order.status = 'received' AND p_new_status = 'on_process')
    OR (v_order.status = 'on_process' AND p_new_status = 'ready') THEN
    PERFORM set_config('app.order_transition_type', 'advance', true);
    PERFORM set_config('app.order_correction_reason', '', true);
    PERFORM set_config('app.order_eta_before', COALESCE(v_order.estimated_ready_at::TEXT, ''), true);
    IF p_new_status = 'on_process' THEN
      UPDATE public.orders
      SET status = 'on_process', processing_started_at = COALESCE(processing_started_at, now()),
          last_updated_by_staff_id = p_staff_id, last_status_changed_at = now(), updated_at = now()
      WHERE id = p_order_id RETURNING * INTO v_order;
    ELSE
      UPDATE public.orders
      SET status = 'ready', ready_at = now(), actual_completion = now(),
          last_updated_by_staff_id = p_staff_id, last_status_changed_at = now(), updated_at = now()
      WHERE id = p_order_id RETURNING * INTO v_order;
    END IF;
    RETURN v_order;
  END IF;

  IF v_order.status = 'ready' AND p_new_status = 'released' THEN
    IF COALESCE(v_order.amount_paid, 0) < COALESCE(v_order.total_price, 0)
      OR v_order.payment_status <> 'paid' THEN
      RAISE EXCEPTION 'Full payment is required before releasing an order';
    END IF;
    PERFORM set_config('app.order_transition_type', 'release', true);
    PERFORM set_config('app.order_correction_reason', '', true);
    PERFORM set_config('app.order_eta_before', COALESCE(v_order.estimated_ready_at::TEXT, ''), true);
    UPDATE public.orders
    SET status = 'released', picked_up_at = now(),
        last_updated_by_staff_id = p_staff_id, last_status_changed_at = now(), updated_at = now()
    WHERE id = p_order_id RETURNING * INTO v_order;
    RETURN v_order;
  END IF;

  IF (v_order.status = 'on_process' AND p_new_status = 'received')
    OR (v_order.status = 'ready' AND p_new_status = 'on_process') THEN
    v_is_backward := TRUE;
  END IF;
  IF NOT v_is_backward THEN
    RAISE EXCEPTION 'Orders can only move one stage forward or one stage backward';
  END IF;
  IF COALESCE(trim(p_correction_reason), '') = '' THEN
    RAISE EXCEPTION 'A correction reason is required to move an order backward';
  END IF;

  SELECT status_undo_seconds INTO v_undo_seconds FROM public.settings LIMIT 1;
  v_undo_seconds := GREATEST(COALESCE(v_undo_seconds, 60), 1);
  SELECT * INTO v_last_event FROM public.order_stage_history
  WHERE order_id = p_order_id ORDER BY changed_at DESC LIMIT 1;
  IF NOT v_is_admin AND (
    v_last_event.id IS NULL
    OR v_last_event.staff_id IS DISTINCT FROM p_staff_id
    OR v_last_event.status IS DISTINCT FROM v_order.status
    OR v_last_event.previous_status IS DISTINCT FROM p_new_status
    OR v_last_event.changed_at < now() - make_interval(secs => v_undo_seconds)
  ) THEN
    RAISE EXCEPTION 'Only an administrator can correct this order now. Staff may undo only their own most recent change within % seconds.', v_undo_seconds;
  END IF;

  v_eta_before := v_order.estimated_ready_at;
  -- A correction creates a new, transparent customer promise. Use half of the
  -- original estimate as a conservative remaining-time baseline, never below
  -- 15 minutes. The original promise remains preserved for audit purposes.
  v_revised_minutes := GREATEST(15, CEIL(COALESCE(v_order.estimated_processing_minutes, 100) / 2.0)::INTEGER);
  PERFORM set_config('app.order_transition_type', 'correction', true);
  PERFORM set_config('app.order_correction_reason', trim(p_correction_reason), true);
  PERFORM set_config('app.order_eta_before', COALESCE(v_eta_before::TEXT, ''), true);

  IF p_new_status = 'received' THEN
    UPDATE public.orders
    SET status = 'received', processing_started_at = NULL,
        estimated_processing_minutes = v_revised_minutes,
        eta_source = 'revised_after_correction',
        estimated_ready_at = now() + make_interval(mins => v_revised_minutes),
        original_estimated_ready_at = COALESCE(original_estimated_ready_at, v_eta_before),
        eta_revised_at = now(), eta_revision_reason = trim(p_correction_reason),
        last_updated_by_staff_id = p_staff_id, last_status_changed_at = now(), updated_at = now()
    WHERE id = p_order_id RETURNING * INTO v_order;
  ELSE
    UPDATE public.orders
    SET status = 'on_process', ready_at = NULL, actual_completion = NULL,
        estimated_processing_minutes = v_revised_minutes,
        eta_source = 'revised_after_correction',
        estimated_ready_at = now() + make_interval(mins => v_revised_minutes),
        original_estimated_ready_at = COALESCE(original_estimated_ready_at, v_eta_before),
        eta_revised_at = now(), eta_revision_reason = trim(p_correction_reason),
        last_updated_by_staff_id = p_staff_id, last_status_changed_at = now(), updated_at = now()
    WHERE id = p_order_id RETURNING * INTO v_order;
  END IF;
  RETURN v_order;
END $$;

REVOKE EXECUTE ON FUNCTION public.transition_branch_order(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_branch_order(UUID, UUID, TEXT, TEXT) TO service_role;

CREATE INDEX IF NOT EXISTS idx_orders_overdue_active
  ON public.orders(estimated_ready_at)
  WHERE status IN ('received', 'on_process') AND estimated_ready_at IS NOT NULL;

COMMIT;
