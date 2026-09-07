# H&C Laundry Management System

The React interface is separated from the Node.js API. Existing screens, routes,
forms, styling, Supabase schema, and user flows are preserved.

```text
frontend/                 React/Vite application
  src/components/         Shared layout
  src/pages/              Existing feature screens
  src/context/            Authentication state
  src/services/api/       Central browser-to-API client
  src/lib/                Compatibility query/realtime adapter
backend/                  Server-only API
  config/                 Supabase configuration
  models/                 Data access whitelist/query model
  controllers/            HTTP-independent feature handlers
  routes/                 Resource-to-route definitions
  middleware/             Authentication utilities
  services/               Email, SMS, Gemini, realtime event services
```

## Setup

1. Copy `.env.example` to `.env` and set the values. All values now remain
   server-side; do not add `VITE_SUPABASE_*` or `VITE_GEMINI_API_KEY` values.
2. Use the existing `supabase_schema.sql` against the same Supabase project.
   The deployed database must also retain its existing application-added fields
   such as `settings`, `branch`, `amount_paid`, and `priority_order`.
3. Start the API: `npm run dev:backend`.
4. In another terminal, start React: `npm run dev:frontend`.
5. Open `http://localhost:5173`.

## API

Resource requests are authenticated and use these endpoints:

- `/api/customers`
- `/api/orders`
- `/api/inventory/items`, `/api/inventory/categories`, `/api/inventory/usage`, `/api/inventory/restocks`
- `/api/staff`, `/api/settings`, `/api/service-types`, `/api/expenses`, `/api/sms-log`
- `/api/auth/login`, `/api/auth/me`, `/api/auth/signup`, `/api/auth/password`
- `/api/notifications/email`, `/api/notifications/sms`, `/api/ai/generate`
- `/api/public/orders/track?q=...` and `/api/public/settings`

The frontend query adapter centrally translates the existing Supabase-shaped
feature calls to these API routes. This minimizes behavioral risk while keeping
database access and provider credentials out of the browser.

## Security note

An old hard-coded service-role key was removed from `seed-user.js`. Rotate that
key in Supabase before deploying this version, then set the replacement only in
the server environment.
