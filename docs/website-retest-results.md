# Website retest results

This run evaluates the current local worktree, including the uncommitted
session-expiry changes. It does not establish the behavior of the deployed
version or certify every function. No production records, credentials,
emails, or SMS were changed or sent.

## Latest verification after fixes

All four reproduced failures are fixed in the local application. The current
suite has **37 passing tests and zero failures**.

- Staff deletion through the generic API now requires an administrator.
  Regression tests also confirm administrator archival still writes its audit.
- Public tracking accepts a complete IC, HC, or 4J receipt number, performs
  an exact match, excludes cancelled orders, and selects only progress fields.
  The tracking UI uses this public endpoint and no longer displays customer names.
- Admin and staff client directories exclude deleted customers; staff queries
  retain branch filtering.
- Order creation rejects missing, invalid, negative, or non-finite payments.
  Valid numeric strings still produce partial/paid states correctly.
- The legacy signup helper now sends the administrator's session token.

These are code-level fixes; live database/inbox/browser limitations below still
apply. No application deployment or database migration was performed for them.

## Original audit checks (before fixes)

| Check | Result |
| --- | --- |
| Automated tests (`npm test`) | 33 tests: 29 passed, 4 failed |
| JavaScript syntax | 24 backend, Worker, API, and library modules passed |
| Production frontend build | Passed |
| Cloudflare Worker deployment dry run | Passed; nothing published |

The original 25 tests pass. Eight additional tests in
`test/feature-audit.test.js` exercise previously uncovered paths.
Four pass and four reproduce the failures below. These tests deliberately
assert the required behavior. They now pass after the fixes described above.
Database calls in these additional tests are mocked; they do not demonstrate
production exploitation or successful persistence of invalid records.

## Original confirmed failures (now fixed)

1. **High: staff-account deletion permission gap.**
   Both HTTP adapters route generic resource requests to `handleData` after
   authentication. `databaseModel.execute` blocks staff insert/update, but
   does not require an administrator for staff deletion. A staff identity reaches
   the soft-delete update and audit insert for another staff ID in the test.
   The admin-only dedicated Recycle Bin endpoints do reject staff.
   Location: `backend/models/databaseModel.js`, `execute`.

2. **High: public order tracking accepts wildcard-only searches.**
   The tracking controller only rejects blank input and embeds the query in an
   ILIKE substring pattern. A percent sign is accepted and produces a broad
   search over non-cancelled orders. The selected response also contains
   customer name, customer ID, and total price. No live customer search was run.
   Location: `backend/controllers/publicController.js`, `trackOrder`.

3. **Medium: deleted customers can reappear in the client directory.**
   The admin directory query has no `deleted_at IS NULL` filter. The test
   returns a deleted customer as a visible record. The staff association path
   also lacks an explicit deleted-customer exclusion (review finding).
   Location: `backend/controllers/customerController.js`, `listVisibleCustomers`.

4. **Medium: invalid payment amounts reach order creation.**
   A nonnumeric `amount_paid` becomes NaN and bypasses the minimum-payment
   comparison. The test confirms it reaches the order RPC. Depending on the
   database/schema, this may cause an error or invalid data; persistence was
   not tested.
   Location: `backend/controllers/operationController.js`, `createOrder`.

## Passing coverage and limits

| Area | Exercised | Still unverified |
| --- | --- | --- |
| Login and recovery | Deleted/missing accounts rejected, restored account login with mocked auth | Real Supabase login and password recovery |
| Session expiry | Timer logout, clearing stored credentials, 401 logout, preserving replacement sessions, 403/offline behavior | Actual browser navigation, sleeping devices, multiple tabs |
| Account email changes | Isolated PostgreSQL execution: ownership, expiry, attempts, duplicate addresses, audit and permission preservation | Live migration state and inbox delivery |
| Admin provisioning | Global admin branch behavior and required recovery email with mocked auth | Real Auth user creation, reset, rollback |
| Orders | Validation samples, branch rejection, RPC arguments, cancellation scope | Full database lifecycle, stock deduction, undo, release, payment races |
| Inventory | Invalid quantity and cross-branch restock rejection | Actual restock/expense transaction and concurrent stock changes |
| Recycle Bin | Staff rejected from dedicated administration; protected ledger deletion rejected | All restore/delete workflows, rollback after audit failure |
| Charts | Date ranges, year boundaries, separate weekday/month buckets | Rendered labels, mobile layout, complete revenue reconciliation |
| Public/API | Anonymous endpoint rejection, validation, health headers, limiter sample | All security boundaries and real provider behavior |
| Emails, SMS, AI | Related modules compile; invalid contact request tested | Delivery, provider quotas, forecasting accuracy |
| UI | Production JSX/CSS bundling | Click-through flows, drag/drop, responsive layouts, downloads/printing |

No browser automation tool or browser test suite is configured in this session.
The repository's `docs/manual-uat-checklist.md` covers the remaining manual
flows. Full integration verification needs a staging database, separate test
admin/staff identities, and a controlled inbox.

## Additional review observations

- Fixed: the browser API client treated `/api/auth/signup` as public and omitted the token,
  while both server adapters require an administrator for that endpoint. The
  generated staff/admin UI uses a different endpoint, so this is a separate
  unused/legacy helper mismatch, not a demonstrated provisioning UI failure.
- The order load count uses client-provided `bundleKg`, and total price/add-on
  amounts are accepted from the client. Authoritative price and stock validation
  need further database/controller coverage.
- Cloudflare intentionally returns 204 for the local realtime stream endpoint.
  Build success does not establish cross-session live updates.

The original run added tests and this report. The subsequent fix request
updated application behavior and added positive regression cases.
