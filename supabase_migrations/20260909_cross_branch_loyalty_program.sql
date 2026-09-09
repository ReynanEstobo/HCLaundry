-- Run after 20260909_account_email_change.sql.
-- Cross-branch loyalty rewards are calculated automatically on the qualifying
-- fifth and tenth orders after this migration. The ledger is auditable and
-- prevents more than one pending qualifying reward for a customer.
BEGIN;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS loyalty_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS loyalty_discount_milestone INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS loyalty_free_load_milestone INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS loyalty_discount_percent INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS loyalty_reward_expiry_days INTEGER NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS loyalty_program_started_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.settings
SET loyalty_discount_milestone = GREATEST(COALESCE(loyalty_discount_milestone, 5), 1),
    loyalty_free_load_milestone = GREATEST(COALESCE(loyalty_free_load_milestone, 10), 2),
    loyalty_discount_percent = LEAST(GREATEST(COALESCE(loyalty_discount_percent, 50), 1), 100),
    loyalty_reward_expiry_days = GREATEST(COALESCE(loyalty_reward_expiry_days, 180), 1),
    loyalty_program_started_at = COALESCE(loyalty_program_started_at, now());

ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_loyalty_milestones_check;
ALTER TABLE public.settings ADD CONSTRAINT settings_loyalty_milestones_check
  CHECK (loyalty_discount_milestone > 0
    AND loyalty_free_load_milestone > loyalty_discount_milestone
    AND loyalty_discount_percent BETWEEN 1 AND 100
    AND loyalty_reward_expiry_days > 0);

CREATE TABLE IF NOT EXISTS public.loyalty_rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  earned_order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('percentage_discount', 'free_load')),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'redeemed', 'revoked', 'expired')),
  discount_percent INTEGER CHECK (discount_percent BETWEEN 1 AND 100),
  free_load_kg NUMERIC(6,2),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ,
  redeemed_order_id UUID REFERENCES public.orders(id) ON DELETE RESTRICT,
  revoked_at TIMESTAMPTZ,
  revoked_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT loyalty_reward_snapshot_check CHECK (
    (reward_type = 'percentage_discount' AND discount_percent IS NOT NULL AND free_load_kg IS NULL)
    OR (reward_type = 'free_load' AND free_load_kg = 8 AND discount_percent IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_rewards_earned_order_unique ON public.loyalty_rewards(earned_order_id);
CREATE INDEX IF NOT EXISTS loyalty_rewards_customer_available ON public.loyalty_rewards(customer_id, expires_at)
  WHERE status = 'available';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS loyalty_reward_id UUID REFERENCES public.loyalty_rewards(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS loyalty_original_total NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS loyalty_discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS orders_loyalty_reward_unique ON public.orders(loyalty_reward_id)
  WHERE loyalty_reward_id IS NOT NULL;

-- Expire a claim lazily whenever it is inspected or a new one is earned. This
-- avoids a background job while ensuring expired rewards can never be used.
CREATE OR REPLACE FUNCTION public.expire_customer_loyalty_rewards(p_customer_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.loyalty_rewards
  SET status = 'expired'
  WHERE customer_id = p_customer_id AND status = 'available' AND expires_at <= now()
$$;

-- Automatic discounts are calculated when the qualifying order is created.
-- If that discounted order is cancelled, retain its ledger entry but revoke it
-- so the next successful qualifying order can receive the benefit instead.
CREATE OR REPLACE FUNCTION public.issue_loyalty_reward_for_released_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND NEW.loyalty_reward_id IS NOT NULL THEN
    UPDATE public.loyalty_rewards
    SET status = 'revoked', revoked_at = now(), revoke_reason = 'Qualifying order was cancelled'
    WHERE id = NEW.loyalty_reward_id AND status = 'redeemed';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_issue_loyalty_reward ON public.orders;
CREATE TRIGGER tr_issue_loyalty_reward
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.issue_loyalty_reward_for_released_order();

-- The existing six-argument function is replaced so a reward is locked and
-- redeemed in the same transaction as the order and inventory deduction.
DROP FUNCTION IF EXISTS public.create_branch_order(UUID, UUID, JSONB, JSONB, JSONB, INTEGER);
CREATE OR REPLACE FUNCTION public.create_branch_order(
  p_branch_id UUID, p_staff_id UUID, p_customer JSONB, p_order JSONB,
  p_addons JSONB, p_loads INTEGER, p_loyalty_reward_id UUID DEFAULT NULL
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customer_id UUID; v_branch_name TEXT; v_item RECORD; v_required NUMERIC(10,4); v_order public.orders;
  v_eta_minutes INTEGER; v_eta_source TEXT; v_reward_id UUID;
  v_weight NUMERIC; v_amount_paid NUMERIC; v_bundle_kg NUMERIC; v_bundle_price NUMERIC;
  v_excess_price NUMERIC; v_addon_price NUMERIC; v_raw_total NUMERIC; v_final_total NUMERIC; v_loads INTEGER;
  v_addon_units NUMERIC; v_discount NUMERIC := 0;
  v_loyalty_enabled BOOLEAN; v_discount_milestone INTEGER; v_free_load_milestone INTEGER;
  v_discount_percent INTEGER; v_expiry_days INTEGER; v_program_started_at TIMESTAMPTZ;
  v_completed_count INTEGER; v_next_position INTEGER; v_reward_type TEXT;
BEGIN
  IF p_branch_id IS NULL OR p_staff_id IS NULL THEN RAISE EXCEPTION 'A staff branch assignment is required'; END IF;
  SELECT name INTO v_branch_name FROM public.branches WHERE id = p_branch_id;
  IF v_branch_name IS NULL THEN RAISE EXCEPTION 'Selected branch does not exist'; END IF;
  IF COALESCE(trim(p_customer->>'phone'), '') = '' OR COALESCE(trim(p_customer->>'name'), '') = '' THEN RAISE EXCEPTION 'Customer name and phone are required'; END IF;
  v_weight := NULLIF(p_order->>'weight_kg', '')::NUMERIC;
  v_amount_paid := COALESCE(NULLIF(p_order->>'amount_paid', '')::NUMERIC, 0);
  IF v_weight IS NULL OR v_weight <= 0 OR v_amount_paid < 0 THEN RAISE EXCEPTION 'A valid weight and payment amount are required'; END IF;
  SELECT id INTO v_customer_id FROM public.customers
  WHERE regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace(trim(p_customer->>'phone'), '[^0-9]', '', 'g')
  LIMIT 1 FOR UPDATE;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers(name, phone, email, notes, branch, branch_id, created_by_staff_id)
    VALUES (trim(p_customer->>'name'), trim(p_customer->>'phone'), NULLIF(trim(p_customer->>'email'), ''), NULLIF(trim(p_customer->>'notes'), ''), v_branch_name, p_branch_id, p_staff_id)
    RETURNING id INTO v_customer_id;
  END IF;
  SELECT bundlekg, bundleprice, excesskgprice, addonprice, loyalty_enabled,
         loyalty_discount_milestone, loyalty_free_load_milestone,
         loyalty_discount_percent, loyalty_reward_expiry_days, loyalty_program_started_at
  INTO v_bundle_kg, v_bundle_price, v_excess_price, v_addon_price, v_loyalty_enabled,
       v_discount_milestone, v_free_load_milestone, v_discount_percent, v_expiry_days, v_program_started_at
  FROM public.settings LIMIT 1;
  v_bundle_kg := GREATEST(COALESCE(v_bundle_kg, 8), 1);
  v_bundle_price := GREATEST(COALESCE(v_bundle_price, 200), 0);
  v_excess_price := GREATEST(COALESCE(v_excess_price, 30), 0);
  v_addon_price := GREATEST(COALESCE(v_addon_price, 15), 0);
  v_loads := GREATEST(1, CEIL(v_weight / v_bundle_kg)::INTEGER);
  SELECT COALESCE(SUM(value::NUMERIC), 0) INTO v_addon_units FROM jsonb_each_text(COALESCE(p_addons, '{}'::JSONB));
  IF v_addon_units < 0 THEN RAISE EXCEPTION 'Add-on quantities cannot be negative'; END IF;
  v_raw_total := v_bundle_price + CEIL(GREATEST(v_weight - v_bundle_kg, 0)) * v_excess_price + v_addon_units * v_addon_price;
  v_final_total := v_raw_total;
  IF p_loyalty_reward_id IS NOT NULL THEN RAISE EXCEPTION 'Loyalty rewards are applied automatically to qualifying orders'; END IF;
  IF COALESCE(v_loyalty_enabled, FALSE) AND NOT EXISTS (
    SELECT 1 FROM public.loyalty_rewards reward
    JOIN public.orders reward_order ON reward_order.id = reward.earned_order_id
    WHERE reward.customer_id = v_customer_id
      AND reward.status = 'redeemed'
      AND reward_order.status NOT IN ('released', 'cancelled')
  ) THEN
    SELECT COUNT(*) INTO v_completed_count FROM public.orders
    WHERE customer_id = v_customer_id AND status = 'released' AND payment_status = 'paid'
      AND picked_up_at >= v_program_started_at;
    v_next_position := (v_completed_count % v_free_load_milestone) + 1;
    v_reward_type := CASE
      WHEN v_next_position = v_discount_milestone THEN 'percentage_discount'
      WHEN v_next_position = v_free_load_milestone THEN 'free_load'
      ELSE NULL
    END;
    IF v_reward_type = 'percentage_discount' THEN
      v_final_total := ROUND(v_raw_total * (100 - v_discount_percent) / 100.0, 2);
    ELSIF v_reward_type = 'free_load' THEN
      v_final_total := GREATEST(0, v_raw_total - v_bundle_price);
    END IF;
    v_discount := v_raw_total - v_final_total;
  END IF;
  IF v_amount_paid < v_final_total * 0.5 THEN RAISE EXCEPTION 'Minimum 50%% payment required: %', ROUND(v_final_total * 0.5, 2); END IF;
  FOR v_item IN SELECT * FROM public.inventory_items WHERE branch_id = p_branch_id FOR UPDATE LOOP
    v_required := COALESCE(v_item.usage_per_load, 0) * v_loads + COALESCE((p_addons ->> v_item.id::TEXT)::NUMERIC, 0);
    IF v_required > COALESCE(v_item.current_stock, 0) THEN RAISE EXCEPTION '% has only % % remaining at %', v_item.name, v_item.current_stock, v_item.unit, v_branch_name; END IF;
  END LOOP;
  SELECT minutes, source INTO v_eta_minutes, v_eta_source FROM public.estimate_order_processing_minutes(p_branch_id, NULLIF(p_order->>'service_type_id', '')::UUID, v_weight);
  INSERT INTO public.orders(customer_id, service_type_id, weight_kg, total_price, addons, notes, payment_method, payment_status, amount_paid, branch, branch_id, created_by_staff_id, last_updated_by_staff_id, status, estimated_processing_minutes, eta_source, estimated_ready_at, loyalty_reward_id, loyalty_original_total, loyalty_discount_amount)
  VALUES (v_customer_id, NULLIF(p_order->>'service_type_id', '')::UUID, v_weight, v_final_total, COALESCE(p_addons, '{}'::JSONB), NULLIF(p_order->>'notes', ''), COALESCE(NULLIF(p_order->>'payment_method', ''), 'cash'), CASE WHEN v_amount_paid >= v_final_total THEN 'paid' ELSE 'partial' END, v_amount_paid, v_branch_name, p_branch_id, p_staff_id, p_staff_id, 'received', v_eta_minutes, v_eta_source, now() + make_interval(mins => v_eta_minutes), NULL, v_raw_total, v_discount) RETURNING * INTO v_order;
  IF v_reward_type IS NOT NULL THEN
    INSERT INTO public.loyalty_rewards(customer_id, earned_order_id, reward_type, status, discount_percent, free_load_kg, expires_at, redeemed_at, redeemed_order_id)
    VALUES (v_customer_id, v_order.id, v_reward_type, 'redeemed',
      CASE WHEN v_reward_type = 'percentage_discount' THEN v_discount_percent ELSE NULL END,
      CASE WHEN v_reward_type = 'free_load' THEN 8 ELSE NULL END,
      now() + make_interval(days => v_expiry_days), now(), v_order.id)
    RETURNING id INTO v_reward_id;
    UPDATE public.orders SET loyalty_reward_id = v_reward_id WHERE id = v_order.id;
  END IF;
  FOR v_item IN SELECT * FROM public.inventory_items WHERE branch_id = p_branch_id FOR UPDATE LOOP
    v_required := COALESCE(v_item.usage_per_load, 0) * v_loads + COALESCE((p_addons ->> v_item.id::TEXT)::NUMERIC, 0);
    IF v_required > 0 THEN UPDATE public.inventory_items SET current_stock = current_stock - v_required WHERE id = v_item.id; INSERT INTO public.inventory_usage_log(item_id, quantity_used, order_id) VALUES (v_item.id, v_required, v_order.id); END IF;
  END LOOP;
  INSERT INTO public.customer_branches(customer_id, branch_id, first_served_at, last_served_at, order_count)
  VALUES (v_customer_id, p_branch_id, now(), now(), 1)
  ON CONFLICT (customer_id, branch_id) DO UPDATE SET last_served_at = now(), order_count = public.customer_branches.order_count + 1;
  RETURN v_order;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_branch_order(UUID, UUID, JSONB, JSONB, JSONB, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_branch_order(UUID, UUID, JSONB, JSONB, JSONB, INTEGER, UUID) TO service_role;
COMMIT;
