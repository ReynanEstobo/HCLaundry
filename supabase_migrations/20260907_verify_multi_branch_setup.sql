-- Read-only verification. Run this after the four required migrations.
-- It does not insert, update, or delete application data.

-- Required database objects and their status.
SELECT 'tables' AS check_group, table_name AS object_name,
  CASE WHEN table_name IN ('branches', 'customer_branches', 'order_stage_history') THEN 'present' ELSE 'unexpected' END AS result
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('branches', 'customer_branches', 'order_stage_history')
ORDER BY table_name;

SELECT 'required_columns' AS check_group, table_name || '.' || column_name AS object_name, 'present' AS result
FROM information_schema.columns
WHERE table_schema = 'public' AND (
  (table_name = 'staff' AND column_name IN ('auth_id', 'branch', 'branch_id')) OR
  (table_name = 'orders' AND column_name IN ('branch', 'branch_id', 'created_by_staff_id', 'last_updated_by_staff_id', 'amount_paid', 'addons')) OR
  (table_name = 'customers' AND column_name IN ('branch', 'branch_id', 'created_by_staff_id')) OR
  (table_name = 'inventory_items' AND column_name IN ('branch', 'branch_id')) OR
  (table_name = 'inventory_restocks' AND column_name IN ('branch', 'branch_id')) OR
  (table_name = 'inventory_usage_log' AND column_name IN ('branch', 'branch_id'))
)
ORDER BY table_name, column_name;

SELECT 'functions' AS check_group, routine_name AS object_name, 'present' AS result
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name IN (
  'create_branch_order', 'restock_branch_inventory', 'find_customer_by_phone',
  'register_branch_customer', 'capture_order_stage_change', 'stamp_order_completion'
)
ORDER BY routine_name;

SELECT 'triggers' AS check_group, trigger_name AS object_name, event_manipulation AS result
FROM information_schema.triggers
WHERE trigger_schema = 'public' AND trigger_name IN (
  'tr_capture_order_stage_change', 'tr_stamp_order_completion',
  'tr_orders_branch_name', 'tr_ensure_customer_branch_access'
)
ORDER BY trigger_name;

-- These should normally return zero rows before sign-off.
SELECT 'data_issue' AS check_group, 'staff_without_branch' AS object_name, COUNT(*)::TEXT AS result
FROM public.staff WHERE lower(COALESCE(role, '')) = 'staff' AND branch_id IS NULL
UNION ALL
SELECT 'data_issue', 'orders_without_branch', COUNT(*)::TEXT FROM public.orders WHERE branch_id IS NULL
UNION ALL
SELECT 'data_issue', 'inventory_without_branch', COUNT(*)::TEXT FROM public.inventory_items WHERE branch_id IS NULL
UNION ALL
SELECT 'data_issue', 'duplicate_normalized_customer_phones', COUNT(*)::TEXT
FROM (SELECT regexp_replace(phone, '[^0-9]', '', 'g') FROM public.customers GROUP BY 1 HAVING COUNT(*) > 1) duplicates;
