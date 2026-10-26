# Integrations and configuration guides

Every integration is off until its credentials are set, and the admin dashboard lists each one as Active, "Configured — not yet verified", or Inactive. "Not yet verified" means the code path exists but has not been run against the real provider.

## Supabase

1. Create a project (region chosen with privacy counsel). In Auth → Providers enable Email with "Confirm email" on; set the Site URL and add `https://<domain>/auth/callback` to redirect URLs.
2. Auth → Multi-Factor: enable TOTP.
3. Auth → Password: minimum length 8; the app enforces the full policy on sign-up and reset.
4. Apply migrations: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
5. Optional Google sign-in: create an OAuth client in Google Cloud, add it under Auth → Providers → Google, then set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`.
6. Customise the Auth email templates (confirm, reset) in both languages; they are sent by Supabase, not by the app.

## Email (Resend)

Outbound: verify the sending domain (SPF, DKIM, DMARC), set `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL`. Notifications are written to `notifications` by database triggers and sent by `/api/cron/notifications` (schedule it every 5 minutes with `Authorization: Bearer $CRON_SECRET`). Emails contain no order content — only a localized one-line summary and a link to the portal. Failed sends retry with exponential backoff and become `dead` after 6 attempts.

Inbound support email is **not implemented**. Recommended design: Resend (or Postmark/SendGrid) inbound webhook → a new `/api/webhooks/email` route that verifies the provider signature, matches the sender against verified `profiles.email`, and calls `recordInboundMessage({ channel: "email", … })` exactly as Telegram does.

## Telegram

1. Create a bot with @BotFather; note the token and username.
2. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, and a random `TELEGRAM_WEBHOOK_SECRET`.
3. Register the webhook: `curl "https://api.telegram.org/bot$TOKEN/setWebhook" -d url=https://<domain>/api/webhooks/telegram -d secret_token=$TELEGRAM_WEBHOOK_SECRET`.
4. Customers link from Settings → "Link Telegram": the portal shows a one-time code (10 minutes, hashed at rest); sending `/link CODE` (or tapping the deep link) binds the Telegram user id to the account and records an opt-in consent.
5. Messages from linked users appear in the unified inbox attached to the customer; messages from unlinked users appear as "Unverified sender" threads. Owner replies from the inbox are sent back through the Bot API, and failures are recorded on the message and in `integration_events`.

## WhatsApp Business Platform

1. Meta Business verification, a WhatsApp Business Account and a phone number in the Cloud API.
2. Set `WHATSAPP_APP_SECRET` (app secret, for `X-Hub-Signature-256`), `WHATSAPP_VERIFY_TOKEN` (any random string), `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`.
3. Configure the webhook URL `https://<domain>/api/webhooks/whatsapp` with the verify token and subscribe to `messages`.
4. Inbound messages are stored per phone number; they are attached to a customer only through a verified `channel_identities` row, never by matching the profile phone number.
5. Free-form replies work only inside the 24-hour customer-service window. **Template messages (required outside the window and for proactive notifications) are not implemented**: submit templates for approval in both languages, then add a template sender and an opt-in flow before enabling WhatsApp notifications. WhatsApp account linking by code is also not yet wired (Telegram's flow in `redeemLinkCode` is channel-generic and can be reused).

## OpenAI (optional)

Set `OPENAI_API_KEY` and `OPENAI_MODEL` (choose a current model), then set `app_config.ai_assist_enabled` to `true` in Admin → Pricing → Settings. The only implemented feature is the owner-only intake summary on an order, and it runs only when the customer ticked the AI consent box on that order. Input is minimized to intake fields, identifiers are redacted, `store: false` is sent, and the output is saved as an internal note labelled as AI output. The model never changes an order, a price, a deadline or a refund. Support-reply drafts, ticket categorization, QA checklists and analytics summaries are **not implemented**.

## n8n (optional)

Not required for the MVP: the email outbox runs from the app's cron route. Use n8n for owner-facing automations that need no database write access, for example: a schedule that calls `/api/cron/notifications`; a daily digest of overdue orders and dead-lettered notifications built from a read-only reporting view; Slack/Telegram alerts to the owner. Give n8n only `CRON_SECRET` or a dedicated read-only database role, enable its retry-on-fail and error-workflow (dead-letter) settings, and put approval nodes in front of any workflow that messages customers.

## Malware scanning

Deploy a ClamAV REST service (e.g. `ajilaag/clamav-rest` or `benzino77/clamav-rest-api`) that accepts `POST` multipart `file` and replies with JSON containing `infected` or `status: OK|FOUND`. Set `CLAMAV_REST_URL`. Without it, uploads are stored as `not_scanned` and flagged in the admin file list; infected files are deleted immediately and can never be delivered.

## Turnstile

Create a widget in Cloudflare for the production domain, set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. Used on registration, password reset and the contact form. In production a missing secret makes those forms fail closed.
