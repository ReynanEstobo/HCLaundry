# Bound email changes

Run `supabase_migrations/20260909_account_email_change.sql` in the Supabase SQL
Editor after the staff provisioning and password OTP migrations, then deploy
the updated app. The migration adds protected verification storage and two
service-role-only functions. It does not rewrite any existing account emails.

Admins: Settings → Change Bound Email.
Staff: Account Security → Change Bound Email.

1. Enter the new email and the account's current password.
2. Click Send code to new email and open that inbox.
3. Enter the six-digit code within 10 minutes and confirm.
4. Check the success message and the updated bound email.
5. Request a **new** password OTP; it should now arrive in the new inbox.
6. Sign out, log in with the same username/Account ID (or existing login
   email), and confirm branch access remains correct.

The bound email is `staff.contact_email`, used by password-change and
forgot-password recovery. The Supabase login address, username, password, role,
and branch assignment do not change. Changing a login email is a separate
operation, not part of this form. A user can bind an email even when the old
address is inaccessible by proving the current password and new mailbox.

## Failure checks

- Wrong current password: no code sent or email changed.
- Invalid/internal `.local` address: rejected.
- Wrong code: no change; five wrong attempts lock the challenge.
- Expired or previously consumed code: rejected.
- Request another code: the previous email-change code no longer works.
- More than five requests in 15 minutes: blocked per account in the database;
  Cloudflare also limits requests by IP.
- A code from another account: rejected.
- Email already claimed as another account's contact or login email: rejected
  at confirmation.
- An email changed by an admin after code issuance: stale challenge rejected.
- Successful change: previous password recovery codes are invalidated and an
  audit record is written in the same transaction.

`npm test` runs both controller tests with a mocked email provider and the actual
migration/functions in an isolated PostgreSQL test engine. It never sends real
mail or changes production records. Live inbox delivery still requires the
browser walkthrough above after migration and deployment.
