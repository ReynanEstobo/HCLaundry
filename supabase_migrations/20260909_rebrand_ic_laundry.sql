-- Run after 20260909_account_email_change.sql.
-- Rebrands active configuration and identifiers without breaking credentials
-- issued under the former HC prefix.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'shopname'
  ) THEN
    EXECUTE $sql$
      UPDATE public.settings SET shopname = 'I&C Laundry'
      WHERE shopname IS NULL OR btrim(shopname) IN ('4J Laundry', 'H&C Laundry', 'H&C Laundry Hub')
    $sql$;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'shop_name'
  ) THEN
    EXECUTE $sql$
      UPDATE public.settings SET shop_name = 'I&C Laundry'
      WHERE shop_name IS NULL OR btrim(shop_name) IN ('4J Laundry', 'H&C Laundry', 'H&C Laundry Hub')
    $sql$;
  END IF;
END;
$$;

-- Keep already-issued tracking numbers and account codes valid on receipts
-- and credential handovers. New orders and accounts receive the IC prefix.
-- Do not rewrite authentication identities or historical identifiers.

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.order_number := 'IC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

COMMIT;
