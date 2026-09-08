# Switch automated mail to `hclaundryhub@gmail.com`

This runbook changes the sender of production OTPs, order notifications, manual
emails, and public contact-form messages. Do this during a quiet period because
password-recovery and notification mail may briefly be unavailable during the
cutover.

## What changes and what does not

- The Gmail sender and public contact address become `hclaundryhub@gmail.com`.
- The public website and Notifications page show the new address.
- Existing customer email addresses, staff contact emails, and internal
  `@accounts.hclaundry.local` login identities are not changed. They represent
  individual accounts, not the system sender.
- Cloudflare Workers cannot use Gmail SMTP directly. Production mail is sent by
  the Google Apps Script relay, so that relay must be deployed by the new Gmail
  account.

## 1. Prepare the new Gmail account

1. Sign into `hclaundryhub@gmail.com`.
2. Enable Google two-step verification.
3. Create a Google App Password named `H&C Laundry local SMTP`. Keep the
   16-character value private. It is only for local Node testing; it is not
   used by Cloudflare Workers.
4. Do not revoke the old sender's app password or relay yet.

## 2. Create the new Apps Script relay

1. While signed into `hclaundryhub@gmail.com`, open
   <https://script.google.com/home> and choose **New project**.
2. Replace the default code with
   [`google-apps-script-email-relay.gs`](google-apps-script-email-relay.gs).
3. Open **Project Settings** > **Script properties** and add:

   - Property: `EMAIL_RELAY_SECRET`
   - Value: a newly generated random value of at least 32 characters

   Keep this value private. It must exactly match the Cloudflare Worker secret
   in step 4.
4. Click **Deploy** > **New deployment** > select **Web app**.
5. Set **Execute as** to `hclaundryhub@gmail.com` / **Me**.
6. Set access to the least broad option that still lets the Cloudflare Worker
   call it. For a standard Gmail account this is normally **Anyone**. The relay
   accepts only requests carrying the separate shared secret.
7. Authorize the Gmail sending permission, deploy, and copy the `/exec` web-app
   URL. Do not use the `/dev` URL.

## 3. Update local development configuration

In the ignored `.env` file, set these values. Do not commit the file:

```dotenv
GMAIL_EMAIL=hclaundryhub@gmail.com
GMAIL_APP_PASSWORD=<new Gmail app password>
CONTACT_EMAIL=hclaundryhub@gmail.com
GOOGLE_APPS_SCRIPT_EMAIL_URL=<new Apps Script /exec URL>
EMAIL_RELAY_SECRET=<same 32+ character relay secret>
```

`PASSWORD_OTP_SECRET`, Supabase values, SMS values, and Gemini values stay as
they are.

## 4. Update Cloudflare production secrets

From the project directory, enter the new values interactively. Never paste
them into GitHub, source files, or terminal screenshots.

```powershell
npx wrangler secret put GOOGLE_APPS_SCRIPT_EMAIL_URL
npx wrangler secret put EMAIL_RELAY_SECRET
npx wrangler secret put GMAIL_EMAIL
npx wrangler secret put CONTACT_EMAIL
```

`GMAIL_APP_PASSWORD` is not needed by the Worker while the Apps Script relay is
configured. You may still save it as a Worker secret if desired for future
fallback support, but it is not used by this production path.

Deploy the current Worker after changing the secrets. If GitHub Actions deploys
your Worker, commit and push the non-secret code changes, then verify the
deployment completed. Secrets set in Cloudflare are preserved across deploys.

## 5. Verify before retiring the old sender

1. Use the production **Notifications** page to email a test inbox.
2. Check the received message's **From** and **Reply-To** values. Both should
   be `hclaundryhub@gmail.com` (the display name should be H&C Laundry).
3. Request one password-reset OTP for a test account; confirm delivery and the
   branded template.
4. Create a UAT order with a test email and move it to Ready; confirm the
   ready-for-pickup email arrives once.
5. Submit a test public contact form and confirm its message arrives at
   `hclaundryhub@gmail.com`.
6. Check Worker logs for safe success/failure messages only; never log the OTP,
   app password, relay secret, or full email body.

If any check fails, restore the old Apps Script URL/secret in Cloudflare and
redeploy. Do not delete the old configuration until the new path has passed.

## 6. Retire the old sender

After successful verification, revoke the old Gmail account's app password and
disable or delete its Apps Script deployment. This prevents accidental mail
from the old mailbox.
