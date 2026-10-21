# Enable account email with Resend

Use this guide to enable email confirmation, welcome messages, password recovery,
and password-change notifications. Signup grants immediate access. Verification
adds a confirmation date to the account and triggers its welcome email.

## Configure Resend

1. Add a sending subdomain, such as `accounts.will-be-done.app`, to Resend.
2. Add the SPF and DKIM records shown in the Resend dashboard to your DNS provider.
3. Wait until Resend marks the domain as verified.
4. Configure DMARC for the sending domain. Follow the
   [Resend DMARC guide](https://resend.com/docs/dashboard/domains/dmarc).
5. Disable open and click tracking for this domain. Account links contain credentials.
6. Create a sending API key restricted to the verified domain.

See [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction)
for DNS record details.

## Configure the backend

Set these values through your deployment's secret manager or local environment:

```dotenv
WBD_RESEND_API_KEY=re_replace_with_your_key
WBD_EMAIL_FROM=Will Be Done <hello@accounts.will-be-done.app>
WBD_PUBLIC_APP_URL=https://app.will-be-done.app
```

Use your installation's public web origin for `WBD_PUBLIC_APP_URL`. The value must
have no path, query, fragment, or credentials. Local development also accepts HTTP
on `localhost`, `127.0.0.1`, and `[::1]`.

Restart the backend after you change these values. If you set only some values,
the backend rejects the configuration at startup. To disable account email, leave
all three values empty. Signup and login continue to work without email.

## Check delivery

1. Sign up with an inbox you control.
2. Confirm that the app opens before email verification.
3. Open the confirmation email and select **Confirm email** on the linked page.
4. Confirm that the verification reminder disappears and the welcome email arrives.
5. Sign out and select **Forgot password?**.
6. Request a reset link and set a new password through that link.
7. Confirm that the password-change notification arrives.
8. Sign in with the new password and confirm that old login and API tokens no longer work.

For an existing account, request a confirmation email from the reminder in the app.
The rollout does not send emails to existing users automatically.

## Diagnose failed delivery

Look for `[Account email]` events in backend logs. Events include a job ID, email
kind, delivery status, and a safe error code. Check the corresponding message in
the Resend dashboard. A `sent` event means Resend accepted the message, not that the
recipient's inbox received it.

For `invalid_api_key` or sender errors, correct the configuration before you request
a new link. For rate-limit or temporary network errors, let the worker retry.
Retries stop after 23 hours or when the link expires. Reset links expire after one
hour. Confirmation links expire after 24 hours. A resend invalidates the older link.

Pending messages survive backend restarts in the main database. Each job has a
lease so multiple instances can share the outbox. The sender reuses the same payload
and [Resend idempotency key](https://resend.com/docs/dashboard/emails/idempotency-keys)
for retries. Resend retains keys for 24 hours.

Pending message payloads contain account links. Restrict access to the main
database and its backups. The worker removes each payload after delivery, expiry,
cancellation, or permanent failure. It retains sanitized job metadata for seven days.

## Run local email checks

Run backend email tests without a Resend account:

```sh
pnpm --filter @will-be-done/api exec bun test src/email/email.test.ts
```

Run browser flows with a local test inbox:

```sh
WBD_E2E_EMAIL_ENABLED=true pnpm --filter @will-be-done/web test:e2e e2e/account-email.spec.ts e2e/auth.spec.ts
```

The browser test runner starts a separate test API entry point. Its local inbox
endpoint is absent from the production server.
