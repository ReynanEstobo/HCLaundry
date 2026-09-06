# Migration and acceptance checklist

## Migration order

Run each file once in Supabase SQL Editor, in this order. Stop if a script reports an error; do not skip ahead.

1. `supabase_migrations/20260906_multi_branch_reporting.sql`
2. `supabase_migrations/20260906_branch_safe_operations_and_analytics.sql`
3. `supabase_migrations/20260907_fix_order_stage_history_trigger.sql`
4. `supabase_migrations/20260907_central_customer_phone_identity.sql`
5. `supabase_migrations/20260907_verify_multi_branch_setup.sql` (read-only verification)

The final query's `data_issue` counts should be zero before production sign-off, except intentionally unassigned historical records that an administrator has reviewed.

## Three-branch UAT

Create an administrator and one staff account assigned to each branch. Use different browsers or private windows for simultaneous sessions.

| Test | Expected result |
| --- | --- |
| Staff A creates an order in Main | The order has Main's branch and is visible only to Main staff and the administrator. |
| Staff B opens orders in Calzada | Staff B cannot see Main's order or modify it by ID. |
| Staff A creates an order that needs stock | Only Main inventory is checked and deducted; an insufficient-stock order is rejected without creating an order or usage log. |
| Staff B restocks a Calzada item | Only Calzada stock changes; a restock log and corresponding expense are created. |
| Add a customer in Main, then use the same phone in Nasugbu | One central customer record remains; name/email are reused and `customer_branches` associates the customer with both branches. |
| Record a partial payment, then complete it | `payments`, `amount_paid`, and payment status agree with the total order price. |
| Advance an order to released | The stage history is recorded and completed staff attribution is retained. |
| Open Analytics as administrator | Revenue, expenses, service demand, branch productivity, customer trends, inventory signals, forecast, and DSS render for each filter. |
| Export CSV and Print / PDF | Export contains the selected branch/range data; printed report contains summary, services, branches, and DSS insights. |

## Gemini verification

1. Set `GEMINI_API_KEY` only in the backend `.env`; never in a `VITE_*` variable or frontend file.
2. Restart the backend after changing `.env`.
3. Open Analytics as an administrator and wait for the forecast/DSS loaders to finish.
4. A header such as `Gemini-assisted forecast (...)` confirms a live provider response. `Local trend baseline · low confidence` means the dashboard remained available but Gemini was not usable; check backend logs for the safe provider error.
5. Reopen the same scope within six hours. The browser and backend caches should reuse the result rather than submit another Gemini request.
