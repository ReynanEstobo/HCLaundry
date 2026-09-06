-- Run once in Supabase SQL Editor to fix the stage-history foreign-key error.
BEGIN;

CREATE OR REPLACE FUNCTION public.capture_order_stage_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- This must be an AFTER trigger: the referenced order must already exist.
  INSERT INTO public.order_stage_history(order_id, branch_id, staff_id, previous_status, status)
  VALUES (
    NEW.id,
    NEW.branch_id,
    COALESCE(NEW.last_updated_by_staff_id, NEW.created_by_staff_id),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
    NEW.status
  );
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

CREATE TRIGGER tr_stamp_order_completion
BEFORE INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.stamp_order_completion();

CREATE TRIGGER tr_capture_order_stage_change
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.capture_order_stage_change();

COMMIT;
