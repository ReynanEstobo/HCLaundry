# I&C Laundry rebrand rollout

The interface, email HTML, sender display names, browser icon text, reports,
and newly generated account codes use I&C / IC.

The production Worker remains named `hc-laundry`, with the existing address
`https://hc-laundry.23-14327.workers.dev/`. Renaming a Worker does not transfer
its secrets or deployment state. Email links continue to use this working URL.

1. Run `supabase_migrations/20260909_rebrand_ic_laundry.sql` after the preceding
   migrations. It updates optional shop-name settings and the new-order prefix.
   Existing account codes, tracking numbers, passwords, and login emails stay valid.
2. Deploy the application to the existing Worker using the established workflow.
3. Update Google Apps Script from `docs/google-apps-script-email-relay.gs` and
   publish a new version of its existing deployment. Its sender name is I&C Laundry.
   The verified sending mailbox is `iclaundryshop@gmail.com`.
4. Check the browser title/icon, login page, report export, and an automated email.
   Check login with an existing account code and tracking with an existing receipt.
   New account codes and new order numbers should begin with IC.

Historical migration files retain their original brand strings as migration history.
Legacy storage keys and internal auth email support are retained for compatibility.
Original raster images are unchanged.

If the earlier draft of the rebrand migration was already run, existing HC codes
may already have been rewritten to IC. The revised migration does not reverse
that operation; use the updated codes until a reviewed data recovery is performed.
