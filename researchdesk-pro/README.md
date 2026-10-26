# ResearchDesk Pro

A bilingual (English/Arabic, RTL) platform for selling research and professional writing support — consulting, literature synthesis, methodology coaching, data analysis, editing, translation, reports and educational exemplars — run by a solo owner for customers in Saudi Arabia, the GCC and worldwide.

It is a working application, not a mock-up: Next.js 15 + TypeScript + Tailwind on the front, Supabase (PostgreSQL with row-level security, Auth with TOTP MFA, private Storage, Realtime) behind it, and a payment-adapter layer that accepts online payments only.

> This directory is a self-contained project. It does not depend on, and is not used by, the rest of the repository it sits in.

## What works

- Public site in both languages: home, services and pricing (from the database), FAQ, about, contact (Turnstile + rate limit), resources, six policy pages, light/dark mode, SEO metadata, sitemap.
- Accounts: email sign-up with confirmation, password reset, optional Google, TOTP MFA; the admin role is only effective with an MFA-verified session, enforced inside Postgres.
- Six-step order wizard with draft save, live server-side estimate, private uploads (type sniffing, size limit, scanner hook), and recorded consents for terms, acceptable use and optional AI processing.
- Order workspace: clarifications, real-time chat with unread counts, read receipts, typing indicator, search and attachments; files and versioned deliverables; quotes, invoices, deposits and balances; structured revisions with allowance and additional-scope quotes; immutable timeline.
- Owner dashboard: work queues, KPIs per currency, order management with legal transitions only, internal notes, clarification requests, quoting, QC-gated delivery, revision decisions, refund approval and execution, unified inbox (web, Telegram, WhatsApp threads, contact tickets), pricing and runtime settings editor, content editor, reports with CSV export, integration status.
- Payments: hosted-checkout adapters, signed webhooks, idempotent ledger with amount/currency validation and out-of-order protection, refunds — proven end to end with the sandbox gateway.

## What is not done, and what needs outside approval

See `docs/00-requirements-and-backlog.md` for the full list. In short: the Moyasar adapter is written but **unverified** (needs a merchant test account); other gateways, PayPal and all crypto are **not implemented** (crypto is legally gated); WhatsApp template messages and inbound email are **not implemented**; ZATCA e-invoicing, Sentry wiring, file-retention purge and n8n workflows are **not implemented**; policy texts need **legal review**; Telegram, WhatsApp, Resend, Turnstile, ClamAV and OpenAI are **inactive until their credentials are set** and have not been exercised against the real services.

## Quick start (local)

Requirements: Node 20+, Docker, and the Supabase CLI (`npx supabase`).

```bash
npm install
npx supabase start                     # Postgres, Auth, Storage, Realtime; applies supabase/migrations
cp .env.example .env.local             # fill the Supabase URL and keys printed by `supabase start`,
                                       # PAYMENTS_SANDBOX_ENABLED=true and a SANDBOX_WEBHOOK_SECRET
npm run dev                            # http://localhost:3000
```

Make yourself the owner: register, then run in the SQL editor (`http://127.0.0.1:54323` or `psql`):

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com';
```

Opening `/en/admin` then walks you through TOTP enrolment.

## AWS preview server

`deploy/aws-preview/` holds a one-server preview for AWS `us-east-1`: a bootstrap script for EC2 (Supabase in Docker, production build in preview mode, Caddy on port 80) and its instructions. It is for previews with test data only.

## Tests

```bash
npm test                                                     # unit tests (Vitest)
TEST_ADMIN_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run test:db   # database suite
SUPABASE_SERVICE_ROLE_KEY=… node e2e/full-flow.cjs           # browser run against supabase start + npm run dev
npm run typecheck && npm run lint && npm run build
```

## Layout

```
supabase/migrations/   schema, business-rule functions, RLS and grants, storage/realtime/seed
supabase/sql-tests/    database test suite (+ stub for plain PostgreSQL)
src/app/[locale]/      pages: public site, auth, portal, admin
src/app/api/           file downloads, payment/Telegram/WhatsApp webhooks, cron outbox, CSV export
src/actions/           Server Actions (validation, rate limits, authorization)
src/lib/               pricing engine, payments, i18n, security, integrations, Supabase clients
src/components/        UI primitives, site chrome, wizard, chat, uploader, admin forms
e2e/                   end-to-end acceptance script
docs/                  requirements and backlog, architecture and threat model, design system,
                       data model, payments, integrations, operations (QA, runbook, costs)
```

## Documentation

| Document | Contents |
|---|---|
| [00 — Requirements and backlog](docs/00-requirements-and-backlog.md) | Product summary, personas, page map, external approvals, prioritized backlog, phased schedule |
| [01 — Architecture](docs/01-architecture.md) | System diagram, request paths, deployment topology, STRIDE threat model |
| [02 — Design system](docs/02-design-system.md) | Tokens, RTL rules, components, accessibility, wireframes |
| [03 — Data model](docs/03-data-model.md) | Tables, state machine, RLS summary, tested guarantees |
| [04 — Payments](docs/04-payments.md) | Payment flow, adapter contract, sandbox checklist, crypto conditions |
| [05 — Integrations](docs/05-integrations.md) | Supabase, email, Telegram, WhatsApp, OpenAI, n8n, ClamAV, Turnstile setup |
| [06 — Operations](docs/06-operations.md) | Secrets, monitoring, backups, retention, QA checklist, launch runbook, monthly costs |

Nothing in this repository is a claim of legal or regulatory compliance; the documents list what must be verified by qualified advisers.
