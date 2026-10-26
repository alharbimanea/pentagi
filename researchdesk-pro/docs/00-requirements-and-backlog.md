# Phase 0 — Requirements, page map and backlog

## Product summary

ResearchDesk Pro is a bilingual (English/Arabic, RTL) platform through which a solo owner sells research and professional writing support — consulting, literature search and synthesis, methodology coaching, data-analysis assistance, citation management, editing, proofreading, translation, professional reports, presentations and annotated educational exemplars — to customers in Saudi Arabia, the GCC and worldwide.

The owner personally approves every order, sets every final price, approves every delivery after a quality check and authorizes every refund. The software automates the rest: intake, estimates, status tracking, notifications, payment reconciliation and reporting.

### Integrity boundary

The platform does not offer, and its copy never implies, assessed work written for submission under the customer's name. This is enforced in four places: the service catalogue (exemplars are labelled "for study only"), the acceptable-use confirmation recorded with every submitted order (`consent_records.kind = 'acceptable_use'`), the policies under `/legal/*`, and the AI intake prompt, which is instructed to flag requests that look like contract cheating for the owner's attention.

## Personas

| Persona | Needs | Constraints |
|---|---|---|
| Graduate researcher (KSA) | Methodology feedback, statistics help, Arabic⇄English editing | Arabic UI, mada payment, deadlines in Riyadh time |
| Professional / organization (GCC) | Reports, briefs, decks, translation | Invoices, card or Apple Pay, confidentiality |
| International academic | Editing and citation clean-up of own manuscript | USD pricing, own time zone |
| Owner (admin) | One queue for everything, fast quoting, no surprises in payments | Works alone; must not be able to act as admin from a stolen password |

## Page map

| Area | Route (`/en` or `/ar` prefix) | Status |
|---|---|---|
| Home | `/` | Implemented |
| Services | `/services` | Implemented (from `services` table) |
| Pricing | `/pricing` | Implemented (rules, add-ons, live payment-method list) |
| FAQ | `/faq` | Implemented (with FAQPage JSON-LD) |
| About | `/about` | Implemented |
| Contact | `/contact` | Implemented (Turnstile, honeypot, rate limit → `support_tickets`) |
| Resources | `/blog`, `/blog/[slug]` | Implemented (admin-managed `posts`) |
| Policies | `/legal/{terms,privacy,integrity,acceptable-use,revisions,refunds}` | Implemented — **text requires legal review** |
| Sign in / register / reset | `/login`, `/register`, `/forgot-password`, `/reset-password` | Implemented (Supabase Auth) |
| MFA | `/mfa` | Implemented (TOTP; mandatory for admin) |
| Customer portal | `/portal` | Implemented (orders, unread counts, notifications) |
| Order wizard | `/portal/orders/new`, `/portal/orders/[id]` (draft) | Implemented (6 steps, draft save, live estimate, uploads) |
| Order workspace | `/portal/orders/[id]?tab=…` | Implemented (overview, messages, files, billing, revisions, timeline) |
| Settings | `/portal/settings` | Implemented (profile, MFA, Telegram linking, deletion request) |
| Sandbox checkout | `/portal/pay/sandbox/[paymentId]` | Development only |
| Admin dashboard | `/admin` | Implemented (queues, KPIs, integration status) |
| Admin orders | `/admin/orders`, `/admin/orders/[id]` | Implemented |
| Unified inbox | `/admin/inbox` | Implemented (web, Telegram, WhatsApp threads + contact tickets) |
| Pricing editor | `/admin/pricing` | Implemented (services, rules, runtime config) |
| Content | `/admin/content` | Implemented |
| Reports | `/admin/reports` + CSV | Implemented |

## Phase 0 validation checklist — external approvals

Nothing in this list can be completed by code. Each item blocks the feature named beside it in production.

| # | Item | Blocks | Owner action |
|---|---|---|---|
| 1 | Commercial registration (CR) or freelance licence covering the services offered | Payment gateway onboarding, invoices | Ministry of Commerce / Saudi Business Center or freelance platform |
| 2 | VAT registration decision (mandatory above the ZATCA threshold) and e-invoicing (FATOORA) obligations | Tax-compliant invoices | Tax adviser; current invoices are **not** ZATCA e-invoices |
| 3 | Payment gateway merchant approval (Moyasar, HyperPay, Tap or PayTabs) with mada, Visa/Mastercard, Amex and Apple Pay enabled | Live payments | Gateway onboarding with CR and bank account for settlement |
| 4 | PayPal merchant eligibility for the registered entity and country | PayPal | PayPal business onboarding |
| 5 | Legal opinion on accepting cryptocurrency as a Saudi-based merchant, a licensed processor, AML/KYC, accounting and custody | Any crypto acceptance | Lawyer + accountant; crypto stays disabled until signed off |
| 6 | PDPL review: privacy notice, lawful basis, cross-border transfer safeguards for each processor (all hosting is in the USA by owner decision: Supabase/AWS `us-east-2`, Vercel or Amplify, Resend, OpenAI), records of processing, breach procedure; registration with SDAIA's national data governance platform if applicable | Launch | Privacy counsel |
| 7 | Consumer-protection and e-commerce law review of terms, refund and cancellation policy | Launch | Lawyer |
| 8 | Meta Business verification, WhatsApp Business Platform number and approved message templates | WhatsApp channel | Meta Business Manager |
| 9 | Telegram bot creation (BotFather) and webhook | Telegram channel | Owner |
| 10 | Sender domain verification (SPF, DKIM, DMARC) at the email provider | Email delivery | DNS |
| 11 | Malware-scanning service deployment (ClamAV) | Accepting customer uploads at scale | Ops |
| 12 | Accessibility review (WCAG 2.2 AA) by a human tester with a screen reader in both languages | Launch quality bar | QA |

## Prioritized MVP backlog

Priority: P0 = launch blocker, P1 = launch, P2 = soon after. Status reflects this repository.

| ID | Priority | Item | Status |
|---|---|---|---|
| B-01 | P0 | Schema, migrations, RLS for all core tables | Done — `supabase/migrations/` |
| B-02 | P0 | Database test suite for isolation, workflow, payments, refunds | Done — `supabase/sql-tests/` |
| B-03 | P0 | Auth: register, verify email, sign in, reset, Google, TOTP MFA; admin requires aal2 in the database | Done |
| B-04 | P0 | Shared password policy (UI and server) | Done — `src/lib/password-policy.ts` |
| B-05 | P0 | Bilingual UI with RTL, locale routing, dark mode | Done |
| B-06 | P0 | Service catalogue and configurable pricing engine | Done |
| B-07 | P0 | Order wizard with draft save, estimate, consents | Done |
| B-08 | P0 | Private uploads: signed URLs, type sniffing, size limits, scan hook | Done (scanner itself: item 11 above) |
| B-09 | P0 | Order workspace, timeline, immutable status history | Done |
| B-10 | P0 | Real-time order chat with unread counts, read receipts, typing, search, attachments | Done |
| B-11 | P0 | Admin dashboard, order management, internal notes, clarifications | Done |
| B-12 | P0 | Manual quotes, deposits, quote acceptance → invoice | Done |
| B-13 | P0 | Security headers, rate limiting, Turnstile, CSRF via Server Actions origin check | Done |
| B-14 | P1 | Payment adapter layer, signed webhooks, idempotent ledger, sandbox gateway | Done |
| B-15 | P1 | Moyasar adapter (cards, mada, Apple Pay) | Written, **unverified** — needs sandbox account |
| B-16 | P1 | Versioned delivery and structured revisions with allowance and additional-scope quotes | Done |
| B-17 | P1 | Refund request → approval → gateway execution | Done (sandbox); live depends on B-15 |
| B-18 | P1 | Notification email outbox with retries and dead-lettering | Done; needs Resend key and domain |
| B-19 | P1 | Reports: KPIs and CSV export | Done |
| B-20 | P1 | Unified inbox with web + contact form | Done |
| B-21 | P2 | Telegram bot: verified account linking and inbound messages, admin replies | Done, inactive until configured |
| B-22 | P2 | WhatsApp: verified webhook, inbound messages, in-window replies | Receive done; template sending **not implemented** |
| B-23 | P2 | Inbound support email (parse replies into inbox) | **Not implemented** |
| B-24 | P2 | AI intake summary (opt-in, redacted, owner-only draft) | Done, off by default |
| B-25 | P2 | AI drafts for support replies, ticket categorization, QA checklists, analytics summaries | **Not implemented** |
| B-26 | P2 | ZATCA e-invoice generation | **Not implemented** (depends on item 2) |
| B-27 | P2 | n8n workflows (reminders, overdue alerts, dead-letter digest) | **Not implemented** — integration points documented |
| B-28 | P2 | Additional gateways (HyperPay, Tap, PayTabs, PayPal) | **Not implemented** — interface ready |
| B-29 | P3 | BTC via BTCPay Server or licensed processor | **Not implemented**; legally gated (item 5) |
| B-30 | P3 | Contractor and support-agent roles behind `contractors_enabled` | Roles and `order_assignments` table exist; no policies or UI |
| B-31 | P2 | Playwright end-to-end suite in CI | **Not implemented** — manual QA checklist in `06-operations.md` |
| B-32 | P2 | Sentry SDK | **Not wired** — see monitoring plan |

## Phased schedule (solo owner + one developer, indicative)

| Phase | Scope | Duration | Exit criteria |
|---|---|---|---|
| 0 | Approvals 1–7 started, policies drafted, this document, schema and threat model | 2–4 weeks (approvals run in parallel and often take longer) | CR in hand, gateway application submitted |
| 1 | MVP in this repository: deploy, configure Supabase, Resend, Turnstile; run QA checklist | 1–2 weeks after Phase 0 | All P0 items green on staging; owner MFA enrolled |
| 2 | Payment gateway sandbox verification, live keys, refunds, email domain, scanner | 2–3 weeks (gated by gateway approval) | Sandbox checklist in `04-payments.md` passes; first live transaction reconciled |
| 3 | Telegram, WhatsApp templates, inbound email, AI support drafts | 3–4 weeks | Linked-identity tests pass; templates approved by Meta |
| 4 | Conditional crypto, contractor roles, n8n automations, performance hardening | Only after legal sign-off | Legal memo on file; testnet suite passes |
