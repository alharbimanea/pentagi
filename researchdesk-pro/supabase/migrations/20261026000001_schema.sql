-- ResearchDesk Pro core schema. Applied by `supabase db push` (or the SQL
-- editor) in filename order; every later migration assumes this one.

create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.app_role as enum ('customer', 'admin', 'support_agent', 'contractor');

create type public.order_status as enum (
  'draft', 'submitted', 'needs_clarification', 'awaiting_quote', 'awaiting_payment',
  'paid', 'in_review', 'in_progress', 'quality_check', 'delivered',
  'revision_requested', 'revision_in_progress', 'completed', 'cancelled', 'refunded'
);

create type public.channel_kind as enum ('web', 'email', 'whatsapp', 'telegram');

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null,
  full_name text check (char_length(full_name) <= 120),
  locale text not null default 'en' check (locale in ('en', 'ar')),
  timezone text not null default 'Asia/Riyadh' check (char_length(timezone) <= 64),
  preferred_currency text not null default 'SAR' check (preferred_currency ~ '^[A-Z]{3}$'),
  phone text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  marketing_opt_in boolean not null default false,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- A user may hold several roles; support_agent and contractor exist so later
-- phases need no enum migration, and grant nothing until policies name them.
create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,64}$'),
  category text not null,
  name_en text not null,
  name_ar text not null,
  description_en text not null default '',
  description_ar text not null default '',
  unit text not null check (unit in ('word', 'page', 'hour', 'slide', 'fixed')),
  base_price_sar numeric(12, 2) not null check (base_price_sar >= 0),
  base_price_usd numeric(12, 2) not null check (base_price_usd >= 0),
  min_price_sar numeric(12, 2) not null default 0 check (min_price_sar >= 0),
  min_price_usd numeric(12, 2) not null default 0 check (min_price_usd >= 0),
  default_turnaround_hours integer not null default 120 check (default_turnaround_hours > 0),
  revisions_included integer not null default 1 check (revisions_included between 0 and 10),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger services_updated_at before update on public.services
  for each row execute function public.set_updated_at();

-- service_id null means the rule applies to every service. Deadline rules
-- match when the hours until the deadline fall in [min_hours, max_hours).
create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services (id) on delete cascade,
  kind text not null check (kind in ('level', 'complexity', 'deadline', 'addon')),
  code text not null check (code ~ '^[a-z0-9_]{2,40}$'),
  label_en text not null,
  label_ar text not null,
  multiplier numeric(6, 3) check (multiplier > 0),
  flat_sar numeric(12, 2) check (flat_sar >= 0),
  flat_usd numeric(12, 2) check (flat_usd >= 0),
  min_hours integer check (min_hours >= 0),
  max_hours integer check (max_hours > 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  check (multiplier is not null or (flat_sar is not null and flat_usd is not null)),
  check (kind <> 'deadline' or min_hours is not null)
);
create unique index pricing_rules_scope_code on public.pricing_rules
  (coalesce(service_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, code);
create trigger pricing_rules_updated_at before update on public.pricing_rules
  for each row execute function public.set_updated_at();

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  code citext not null unique check (code ~ '^[A-Za-z0-9_-]{3,32}$'),
  kind text not null check (kind in ('percent', 'fixed')),
  percent numeric(5, 2) check (percent > 0 and percent <= 100),
  amount_sar numeric(12, 2) check (amount_sar > 0),
  amount_usd numeric(12, 2) check (amount_usd > 0),
  valid_from timestamptz,
  valid_until timestamptz,
  max_redemptions integer check (max_redemptions > 0),
  redemptions integer not null default 0 check (redemptions >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((kind = 'percent' and percent is not null) or (kind = 'fixed' and amount_sar is not null and amount_usd is not null))
);

-- Display-only conversion for currencies beyond SAR/USD. Charges are always
-- created in the invoice currency, never from this table.
create table public.exchange_rates (
  base text not null check (base ~ '^[A-Z]{3}$'),
  quote text not null check (quote ~ '^[A-Z]{3}$'),
  rate numeric(18, 8) not null check (rate > 0),
  as_of timestamptz not null default now(),
  primary key (base, quote)
);

create sequence public.order_ref_seq;
create sequence public.invoice_number_seq;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  service_id uuid not null references public.services (id),
  status public.order_status not null default 'draft',
  title text not null default '' check (char_length(title) <= 300),
  discipline text check (char_length(discipline) <= 120),
  intended_use text check (intended_use in ('personal_learning', 'research_support', 'professional', 'publication_prep', 'business', 'other')),
  scope text check (char_length(scope) <= 4000),
  level text check (char_length(level) <= 40),
  complexity text check (char_length(complexity) <= 40),
  word_count integer check (word_count between 0 and 200000),
  page_count integer check (page_count between 0 and 1000),
  citation_style text check (char_length(citation_style) <= 40),
  references_notes text check (char_length(references_notes) <= 4000),
  methodology text check (char_length(methodology) <= 4000),
  language text not null default 'en' check (language in ('en', 'ar', 'en_ar', 'other')),
  deadline timestamptz,
  timezone text not null default 'Asia/Riyadh',
  instructions text check (char_length(instructions) <= 20000),
  addons text[] not null default '{}',
  express boolean not null default false,
  promo_code citext,
  currency text not null default 'SAR' check (currency in ('SAR', 'USD')),
  estimate_amount numeric(12, 2) check (estimate_amount >= 0),
  estimate_breakdown jsonb,
  revisions_included integer not null default 1 check (revisions_included between 0 and 10),
  terms_accepted_at timestamptz,
  acceptable_use_confirmed_at timestamptz,
  submitted_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_status_idx on public.orders (status, deadline);
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_requirements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 2000),
  answer text check (char_length(answer) <= 10000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  asked_by uuid references public.profiles (id),
  answered_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index order_requirements_order_idx on public.order_requirements (order_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_id uuid references public.profiles (id),
  actor_kind text not null check (actor_kind in ('customer', 'admin', 'system')),
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

create table public.order_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  assignee_id uuid not null references public.profiles (id),
  role public.app_role not null check (role in ('support_agent', 'contractor')),
  assigned_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index order_assignments_active on public.order_assignments (order_id, assignee_id) where revoked_at is null;

create table public.files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders (id) on delete cascade,
  uploader_id uuid not null references public.profiles (id),
  kind text not null check (kind in ('attachment', 'deliverable', 'message', 'revision')),
  bucket text not null default 'order-files',
  path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending_upload' check (status in ('pending_upload', 'ready', 'rejected', 'deleted')),
  scan_status text not null default 'pending' check (scan_status in ('pending', 'clean', 'infected', 'not_scanned', 'error')),
  retention_until timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index files_order_idx on public.files (order_id, created_at);

create table public.revisions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  number integer not null check (number > 0),
  description text not null check (char_length(description) between 10 and 4000),
  requested_changes text not null check (char_length(requested_changes) between 1 and 10000),
  proposed_deadline timestamptz,
  additional_scope boolean not null default false,
  status text not null default 'requested' check (status in ('requested', 'approved', 'declined', 'quoted', 'in_progress', 'delivered', 'accepted')),
  quote_id uuid,
  requested_by uuid not null references public.profiles (id),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 2000),
  created_at timestamptz not null default now(),
  unique (order_id, number)
);

create table public.deliverable_versions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  version integer not null check (version > 0),
  file_id uuid not null references public.files (id),
  revision_id uuid references public.revisions (id),
  note text check (char_length(note) <= 2000),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (order_id, version)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  revision_id uuid references public.revisions (id),
  currency text not null check (currency in ('SAR', 'USD')),
  line_items jsonb not null default '[]',
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  total numeric(12, 2) generated always as (subtotal - discount_amount) stored,
  deposit_percent integer not null default 100 check (deposit_percent between 10 and 100),
  delivery_estimate timestamptz,
  valid_until timestamptz not null,
  notes text check (char_length(notes) <= 4000),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined', 'expired', 'superseded')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  decided_at timestamptz,
  check (discount_amount <= subtotal)
);
create index quotes_order_idx on public.quotes (order_id, created_at desc);
alter table public.revisions add constraint revisions_quote_fk foreign key (quote_id) references public.quotes (id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  order_id uuid not null references public.orders (id) on delete restrict,
  quote_id uuid not null unique references public.quotes (id),
  customer_id uuid not null references public.profiles (id),
  currency text not null check (currency in ('SAR', 'USD')),
  total numeric(12, 2) not null check (total > 0),
  deposit_amount numeric(12, 2) not null check (deposit_amount > 0),
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  amount_refunded numeric(12, 2) not null default 0 check (amount_refunded >= 0),
  status text not null default 'open' check (status in ('open', 'partially_paid', 'paid', 'void', 'partially_refunded', 'refunded')),
  issued_at timestamptz not null default now(),
  due_at timestamptz,
  check (deposit_amount <= total),
  check (amount_paid <= total),
  check (amount_refunded <= amount_paid)
);
create index invoices_order_idx on public.invoices (order_id);

-- amount/currency are what the invoice expects; payment_* is what the
-- customer was charged in, settlement_* what the merchant receives.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  order_id uuid not null references public.orders (id) on delete restrict,
  provider text not null,
  provider_payment_id text,
  provider_charge_id text,
  kind text not null check (kind in ('deposit', 'balance', 'full')),
  method text,
  status text not null default 'initiated' check (status in ('initiated', 'pending', 'authorized', 'paid', 'failed', 'cancelled', 'expired', 'partially_refunded', 'refunded')),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency in ('SAR', 'USD')),
  payment_amount numeric(18, 8),
  payment_currency text,
  exchange_rate numeric(18, 8),
  settlement_amount numeric(12, 2),
  settlement_currency text,
  processor_fee numeric(12, 2),
  idempotency_key text not null unique,
  checkout_url text,
  failure_reason text,
  last_event_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index payments_invoice_idx on public.payments (invoice_id);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  payment_id uuid references public.payments (id),
  occurred_at timestamptz,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result text,
  unique (provider, event_id)
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  order_id uuid not null references public.orders (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null,
  reason text not null check (char_length(reason) between 3 and 2000),
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'processing', 'succeeded', 'failed')),
  requested_by uuid not null references public.profiles (id),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  provider_refund_id text,
  failure_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders (id) on delete cascade,
  customer_id uuid references public.profiles (id),
  channel public.channel_kind not null default 'web',
  external_thread_id text,
  subject text check (char_length(subject) <= 200),
  status text not null default 'open' check (status in ('open', 'pending', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references public.profiles (id),
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index conversations_order_web on public.conversations (order_id) where channel = 'web' and order_id is not null;
create unique index conversations_external on public.conversations (channel, external_thread_id) where external_thread_id is not null;
create index conversations_inbox_idx on public.conversations (status, last_message_at desc);

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id),
  sender_kind text not null check (sender_kind in ('customer', 'admin', 'system', 'external')),
  body text not null check (char_length(body) between 1 and 10000),
  file_id uuid references public.files (id),
  channel public.channel_kind not null default 'web',
  external_message_id text,
  delivery_status text not null default 'sent' check (delivery_status in ('queued', 'sent', 'delivered', 'failed')),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_body_search on public.messages using gin (to_tsvector('simple', body));

-- A separate table, not a flag on messages, so no customer-facing query or
-- realtime subscription can ever select an internal note by mistake.
create table public.order_internal_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  author_id uuid references public.profiles (id),
  source text not null default 'manual' check (source in ('manual', 'ai')),
  body text not null check (char_length(body) between 1 and 20000),
  created_at timestamptz not null default now()
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles (id),
  conversation_id uuid references public.conversations (id),
  order_id uuid references public.orders (id),
  name text check (char_length(name) <= 120),
  email citext not null,
  subject text not null check (char_length(subject) between 3 and 200),
  body text not null check (char_length(body) between 10 and 5000),
  category text check (char_length(category) <= 40),
  channel public.channel_kind not null default 'web',
  status text not null default 'open' check (status in ('open', 'pending', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

-- An external identity is trusted only once verified_at is set by the
-- link-code flow; an unverified row never resolves to a customer.
create table public.channel_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel public.channel_kind not null check (channel <> 'web'),
  external_id text not null,
  display text,
  opted_in_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (channel, external_id)
);

create table public.channel_link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel public.channel_kind not null check (channel <> 'web'),
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  link text check (link ~ '^/'),
  read_at timestamptz,
  email_status text not null default 'pending' check (email_status in ('skipped', 'pending', 'sent', 'failed', 'dead')),
  email_attempts integer not null default 0,
  email_last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_outbox_idx on public.notifications (next_attempt_at) where email_status in ('pending', 'failed');

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid references public.orders (id) on delete cascade,
  kind text not null check (kind in ('terms', 'privacy', 'acceptable_use', 'ai_processing', 'marketing', 'whatsapp_opt_in', 'telegram_opt_in')),
  version text not null,
  granted boolean not null,
  created_at timestamptz not null default now()
);
create index consent_records_user_idx on public.consent_records (user_id, kind, created_at desc);

create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  event_type text not null,
  external_id text not null,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed', 'dead', 'ignored')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, direction, external_id)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_role text,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id, created_at desc);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  title_en text not null,
  title_ar text not null,
  excerpt_en text not null default '',
  excerpt_ar text not null default '',
  body_en text not null default '',
  body_ar text not null default '',
  published_at timestamptz,
  author_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger posts_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);
