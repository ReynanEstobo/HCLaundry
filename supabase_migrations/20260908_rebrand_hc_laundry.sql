-- Run once after the existing 20260908 migrations.
-- Rebrands live configuration and customer-facing tracking numbers.
BEGIN;

-- Older installations do not store a shop name in `settings`; only update it
-- when the optional legacy column is actually present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'shopname'
  ) THEN
    EXECUTE $sql$
      UPDATE public.settings
      SET shopname = 'H&C Laundry'
      WHERE shopname IS NULL
         OR btrim(shopname) IN ('4J Laundry', 'I&C Laundry', 'I&C Laundry Hub')
    $sql$;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'shop_name'
  ) THEN
    EXECUTE $sql$
      UPDATE public.settings
      SET shop_name = 'H&C Laundry'
      WHERE shop_name IS NULL
         OR btrim(shop_name) IN ('4J Laundry', 'I&C Laundry', 'I&C Laundry Hub')
    $sql$;
  END IF;
END;
$$;

-- Update existing tracking numbers first so all current order screens, reports,
-- and customer tracking results use the H&C brand.
UPDATE public.orders
SET order_number = regexp_replace(order_number, '^4J-', 'HC-')
WHERE order_number ~ '^4J-';

-- New orders receive the H&C prefix.
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.order_number := 'HC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

COMMIT;
