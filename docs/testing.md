# Automated test suite

Run the safe automated scenarios with:

```bash
npm test
```

The suite never connects to the production database and never sends an email,
SMS, password-reset code, or creates an order. It uses mocked database and
Cloudflare boundaries to cover these representative user journeys:

- public pages, tracking validation, contact-form validation, response headers,
  unknown endpoints, and oversized request rejection;
- anonymous access attempts to protected staff and operational endpoints;
- rate-limit behavior;
- branch isolation for order-stage changes and inventory restocks;
- order validation, load calculation, payment state, and secure RPC usage.

## What requires a separate staging database

Real end-to-end testing of staff provisioning, Supabase sign-in, OTP delivery,
database triggers, inventory stock deduction, cancellation/restore, and order
history must run against a dedicated Supabase staging project. Do not point
automated mutation tests at the live I&C Laundry database.

Before a release, run:

```bash
npm test
npm run build
npx wrangler deploy --dry-run
```
