# Operations: secrets, monitoring, backups, QA, launch and costs

## Environment variables and secrets

The full list with comments is in `.env.example`. Rules:

- Only `NEXT_PUBLIC_*` values reach the browser. `SUPABASE_SERVICE_ROLE_KEY`, gateway secrets, webhook secrets, `CRON_SECRET`, `IP_HASH_SALT` and API keys are server-only and live in the Vercel project's encrypted environment variables (separate values for Preview and Production).
- `src/lib/env.ts` validates server variables at first use and refuses to start with `PAYMENTS_SANDBOX_ENABLED=true` when `APP_STAGE` is `production` (the default for a production build). Staging and preview servers set `APP_STAGE=preview`.
- Generate secrets with `openssl rand -hex 32`. Rotate webhook and cron secrets when anyone who saw them leaves; rotate the service-role key from the Supabase dashboard if it is ever exposed.
- Never paste production keys into AI tools, tickets or chat.

## Owner bootstrap (once per environment)

1. Register through the site with the owner's email and confirm it.
2. In the Supabase SQL editor: `insert into public.user_roles (user_id, role) select id, 'admin' from auth.users where email = 'owner@your-domain';`
3. Sign in and open `/admin`; the app forces TOTP enrolment. Store the authenticator backup offline and protect the owner's email account with its own second factor.

## Monitoring

- **Errors**: Sentry is the recommended monitor but the SDK is **not wired yet**. Install `@sentry/nextjs`, run its wizard, and set `SENTRY_DSN`; scrub request bodies (they contain personal data). Until then, Vercel's runtime logs capture the structured `console.error` calls on webhook, checkout, upload and email failures.
- **Uptime**: an external check on `/en` and on `/api/cron/notifications` with the cron secret (expects 200 JSON).
- **Business signals to watch daily** (all visible in `/admin`): payments with `failure_reason`, refunds in `failed`, notifications in `dead`, `integration_events` in `failed`, files `not_scanned`, overdue orders.
- **Database**: Supabase dashboard advisors (security and performance) after every migration.

## Backups and recovery

- Supabase Pro daily backups plus the PITR add-on (point-in-time recovery to the second) for production.
- Weekly logical export (`supabase db dump --data-only` plus schema) to encrypted storage outside Supabase (e.g. an S3 bucket with object lock), retained 90 days.
- Storage objects: weekly sync of the `order-files` bucket via the S3-compatible endpoint to the same off-site bucket.
- Recovery drill each quarter: restore the latest dump into a scratch project, run `npm run test:db` against it, and open a known order end to end. Record the time taken.

## Retention and deletion

- Order files: keep for 12 months after completion unless the customer asks for earlier deletion (`files.retention_until` is in place for an automated purge job, which is **not implemented** yet — run it manually or with n8n: delete storage objects whose retention has passed, then mark rows `deleted`).
- Financial records (invoices, payments, refunds, audit logs): keep for the period required by Saudi commercial and tax law (confirm with the accountant).
- Account deletion requests appear on the admin dashboard. Procedure: delete files and messages not needed for financial records, anonymize the profile (name, phone), keep invoices, then delete the auth user when nothing references it.

## Automated tests

| Suite | Command | What it proves |
|---|---|---|
| Unit (Vitest) | `npm test` | Pricing engine, password policy, upload validation and sniffing, webhook signatures, sandbox adapter, time zones, redaction, CSV safety, dictionary parity, status map vs SQL |
| Database | `TEST_ADMIN_URL=postgresql://… npm run test:db` | ~90 assertions: isolation, MFA-gated admin, transitions, quotes, idempotent and out-of-order payments, refunds, revisions, immutability, KPIs, rate limiting. Runs on plain PostgreSQL 15+ (with the stub) or, via `psql -f`, on a Supabase database |
| End to end | `node e2e/full-flow.cjs` against `supabase start` + `npm run dev` | 22 browser checks over two users and the owner: registration, wizard, uploads, consent, realtime chat and receipts, TOTP, quote, deposit, underpayment, delivery lock, isolation, revision, refund, CSV, Arabic RTL, dark mode, 375 px |
| Static | `npm run typecheck`, `npm run lint`, `npm run build` | |

## Manual QA checklist (run on staging before launch, both languages)

- [ ] Register, confirm email, sign in, reset password; Google sign-in if enabled.
- [ ] Owner MFA enrolment; admin pages refuse access with an aal1 session.
- [ ] Wizard on a phone: every step, draft save and resume, time-zone selection, add-ons, promo code (valid, expired, exhausted).
- [ ] Upload each accepted type; try `.exe`, a renamed `.exe`, a 30 MB file, an EICAR test file (needs the scanner).
- [ ] Chat between two devices: delivery, unread badge, "Seen", typing, search, attachment.
- [ ] Quote → accept → deposit → balance via the real gateway sandbox (checklist in `04-payments.md`).
- [ ] Delivery, revision within allowance, revision beyond allowance (quoted, paid, delivered).
- [ ] Refund partial and full.
- [ ] Contact form with Turnstile; rate limit reached after 5 submissions.
- [ ] Screen reader pass (VoiceOver iOS in Arabic, NVDA in English): headings, labels, errors, chat log.
- [ ] Keyboard-only pass through the wizard and the admin order page.
- [ ] Lighthouse mobile ≥ 90 for performance and accessibility on home, pricing, login.
- [ ] Email notifications arrive, render RTL correctly, and contain no order content.
- [ ] Restore drill from backup.

## Launch runbook

1. Phase 0 approvals that gate launch are done (CR, gateway, policies reviewed by counsel).
2. Production Supabase project created; Auth, MFA, templates configured; `npx supabase db push`; Supabase advisors clean.
3. Vercel project: environment variables set; `APP_STAGE=production`; `PAYMENTS_SANDBOX_ENABLED` unset; domain and HTTPS; Vercel Cron → `/api/cron/notifications` every 5 minutes.
4. Gateway live keys set; adapter `verified` flipped only after the sandbox checklist passed; webhook URL registered; a 1 SAR live payment made and refunded, and both reconciled in the gateway dashboard.
5. Resend domain verified; ClamAV reachable; Turnstile keys set.
6. Owner bootstrap and MFA.
7. Smoke test on production with a real customer account (then refund).
8. Announce. For the first two weeks check the dashboard's failure signals daily.

Rollback: Vercel instant rollback to the previous deployment. Migrations are forward-only; write a compensating migration rather than editing an applied one, and take a manual backup before each migration.

## Monthly operating costs (indicative, USD, verify current pricing before budgeting)

| Item | Low volume (≈30 orders/mo) | Growing (≈300 orders/mo) | Notes |
|---|---|---|---|
| Vercel | 0–20 | 20 | Hobby plan is non-commercial; use Pro for a business |
| Supabase | 25 | 25–60 | Pro plan; PITR add-on extra; usage above quotas billed |
| Resend | 0 | 20 | Free tier covers low volume |
| Sentry | 0 | 26 | Developer plan free; Team for more events |
| ClamAV VPS | 5–12 | 12–24 | Smallest VM with 2 GB RAM |
| n8n | 0 | 0–25 | Optional; self-host on the same VPS or n8n Cloud |
| OpenAI | 0–5 | 10–30 | Only if enabled; intake summaries are small |
| WhatsApp | 0 | variable | Meta charges per template message by country; service replies within 24 h are free at the time of writing |
| Telegram, Turnstile | 0 | 0 | |
| Domain + DNS | ~1–2 | ~1–2 | Annual fee spread monthly |
| **Fixed subtotal** | **≈ 30–65** | **≈ 115–200** | |
| Gateway fees | per transaction | per transaction | mada and international cards have different rates; set by the merchant agreement |
| Professional services | — | — | Legal review, accountant/VAT, and Meta/gateway onboarding are one-off or annual costs outside this table |
