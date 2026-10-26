-- Business rules that must hold no matter which client calls: status
-- transitions, quotes, payments, refunds, revisions and delivery. Every
-- function that writes is SECURITY DEFINER with a pinned search_path and
-- decides authorization itself; 20261026000003 grants who may call it.

create or replace function public.config_value(p_key text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select value from public.app_config where key = p_key
$$;

-- Admin rights require an aal2 (MFA-verified) session unless the owner has
-- switched require_admin_mfa off, so a stolen password alone cannot act as admin.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
     and (coalesce((public.config_value('require_admin_mfa') #>> '{}')::boolean, true) = false
          or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
$$;

create or replace function public.is_service_role() returns boolean
language sql stable as $$
  select coalesce(auth.role(), '') = 'service_role'
$$;

create or replace function public.owns_order(p_order uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.orders where id = p_order and customer_id = auth.uid())
$$;

create or replace function public.can_access_conversation(p_conversation uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin()
      or exists (select 1 from public.conversations where id = p_conversation and customer_id = auth.uid())
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, email, full_name, locale)
  values (
    new.id,
    new.email,
    left(new.raw_user_meta_data ->> 'full_name', 120),
    case when new.raw_user_meta_data ->> 'locale' = 'ar' then 'ar' else 'en' end
  );
  insert into public.user_roles (user_id, role) values (new.id, 'customer');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

create or replace function public.notify_user(p_user uuid, p_type text, p_payload jsonb, p_link text)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.notifications (user_id, type, payload, link) values (p_user, p_type, p_payload, p_link)
$$;

create or replace function public.notify_admins(p_type text, p_payload jsonb, p_link text)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.notifications (user_id, type, payload, link)
  select user_id, p_type, p_payload, p_link from public.user_roles where role = 'admin'
$$;

create or replace function public.orders_before_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.ref := 'RD-' || to_char(now() at time zone 'Asia/Riyadh', 'YYYY') || '-'
             || lpad(nextval('public.order_ref_seq')::text, 6, '0');
  select revisions_included into new.revisions_included from public.services where id = new.service_id;
  if not public.is_service_role() then
    new.status := 'draft';
  end if;
  return new;
end $$;

create trigger orders_before_insert before insert on public.orders
  for each row execute function public.orders_before_insert();

create or replace function public.orders_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.conversations (order_id, customer_id, channel, subject)
  values (new.id, new.customer_id, 'web', new.ref);
  insert into public.order_status_history (order_id, from_status, to_status, actor_id, actor_kind)
  values (new.id, null, new.status, auth.uid(), case when public.is_service_role() then 'system' else 'customer' end);
  return new;
end $$;

create trigger orders_after_insert after insert on public.orders
  for each row execute function public.orders_after_insert();

create or replace function public.orders_guard_update() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('app.status_transition', true), '') <> 'on' then
    raise exception 'order status changes only through transition_order_status' using errcode = '42501';
  end if;
  if new.customer_id is distinct from old.customer_id or new.ref is distinct from old.ref then
    raise exception 'order owner and reference are immutable' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger orders_guard_update before update on public.orders
  for each row execute function public.orders_guard_update();

create or replace function public.prevent_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;

create trigger order_status_history_immutable before update or delete on public.order_status_history
  for each row execute function public.prevent_mutation();
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.prevent_mutation();
create trigger consent_records_immutable before update or delete on public.consent_records
  for each row execute function public.prevent_mutation();

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_logs (actor_id, actor_role, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(), auth.role(), tg_op, tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id', v_row ->> 'key'),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['orders', 'quotes', 'invoices', 'payments', 'refunds', 'user_roles',
                           'services', 'pricing_rules', 'discounts', 'app_config', 'deliverable_versions', 'files']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- Who may move an order from one status to another. Statuses missing from
-- the admin list (paid, refunded, delivered, revision_*) are entered only
-- through the purpose-built functions below or by the payment webhook.
create or replace function public.order_transition_allowed(p_actor text, p_from public.order_status, p_to public.order_status)
returns boolean language sql immutable as $$
  select case p_actor
    when 'customer' then (p_from, p_to) in (
      ('draft', 'submitted'), ('draft', 'cancelled'), ('submitted', 'cancelled'),
      ('needs_clarification', 'submitted'), ('needs_clarification', 'cancelled'),
      ('awaiting_quote', 'cancelled'), ('awaiting_payment', 'cancelled'), ('delivered', 'completed'))
    when 'admin' then (p_from, p_to) in (
      ('submitted', 'needs_clarification'), ('submitted', 'awaiting_quote'), ('submitted', 'cancelled'),
      ('needs_clarification', 'awaiting_quote'), ('needs_clarification', 'cancelled'),
      ('awaiting_quote', 'needs_clarification'), ('awaiting_quote', 'cancelled'),
      ('awaiting_payment', 'awaiting_quote'), ('awaiting_payment', 'cancelled'),
      ('paid', 'in_review'), ('in_review', 'in_progress'), ('in_progress', 'quality_check'),
      ('quality_check', 'in_progress'), ('delivered', 'completed'))
    else false
  end
$$;

create or replace function public._apply_order_status(p_order uuid, p_to public.order_status, p_actor text, p_note text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_from public.order_status;
  v_customer uuid;
  v_ref text;
begin
  select status, customer_id, ref into v_from, v_customer, v_ref from public.orders where id = p_order for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_from = p_to then
    return;
  end if;

  perform set_config('app.status_transition', 'on', true);
  update public.orders set
    status = p_to,
    submitted_at = case when p_to = 'submitted' then coalesce(submitted_at, now()) else submitted_at end,
    delivered_at = case when p_to = 'delivered' and v_from = 'quality_check' then now() else delivered_at end,
    completed_at = case when p_to = 'completed' then now() else completed_at end
  where id = p_order;
  perform set_config('app.status_transition', 'off', true);

  insert into public.order_status_history (order_id, from_status, to_status, actor_id, actor_kind, note)
  values (p_order, v_from, p_to, case when p_actor = 'system' then null else auth.uid() end, p_actor, p_note);

  if p_actor <> 'customer' then
    perform public.notify_user(v_customer, 'order_status',
      jsonb_build_object('ref', v_ref, 'from', v_from, 'to', p_to), '/portal/orders/' || p_order);
  end if;
  if p_actor <> 'admin' then
    perform public.notify_admins('order_status',
      jsonb_build_object('ref', v_ref, 'from', v_from, 'to', p_to), '/admin/orders/' || p_order);
  end if;
end $$;

create or replace function public.transition_order_status(p_order uuid, p_to public.order_status, p_note text default null)
returns public.order_status language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_actor text;
begin
  select * into v_order from public.orders where id = p_order;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if public.is_service_role() then
    v_actor := 'admin';
  elsif public.is_admin() then
    v_actor := 'admin';
  elsif v_order.customer_id = auth.uid() then
    v_actor := 'customer';
  else
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not public.order_transition_allowed(v_actor, v_order.status, p_to) then
    raise exception 'transition % -> % is not allowed', v_order.status, p_to using errcode = '22023';
  end if;

  if p_to = 'submitted' then
    if v_order.terms_accepted_at is null or v_order.acceptable_use_confirmed_at is null then
      raise exception 'terms and acceptable use must be accepted before submission' using errcode = '22023';
    end if;
    if char_length(trim(v_order.title)) < 3 or v_order.deadline is null then
      raise exception 'title and deadline are required' using errcode = '22023';
    end if;
  end if;

  if p_to = 'completed' then
    update public.revisions set status = 'accepted' where order_id = p_order and status = 'delivered';
  end if;

  perform public._apply_order_status(p_order, p_to, case when public.is_service_role() then 'system' else v_actor end, p_note);
  return p_to;
end $$;

create or replace function public.send_quote(p_quote uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_quote public.quotes%rowtype;
  v_order public.orders%rowtype;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_quote from public.quotes where id = p_quote for update;
  if not found or v_quote.status <> 'draft' then
    raise exception 'only a draft quote can be sent' using errcode = '22023';
  end if;
  if v_quote.valid_until <= now() then
    raise exception 'quote validity is in the past' using errcode = '22023';
  end if;
  if v_quote.total <= 0 then
    raise exception 'quote total must be positive' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id = v_quote.order_id for update;

  update public.quotes set status = 'superseded', decided_at = now()
  where order_id = v_quote.order_id and id <> p_quote and status = 'sent'
    and revision_id is not distinct from v_quote.revision_id;

  if v_quote.revision_id is null then
    if v_order.status not in ('submitted', 'needs_clarification', 'awaiting_quote', 'awaiting_payment') then
      raise exception 'order in status % cannot receive a quote', v_order.status using errcode = '22023';
    end if;
    if v_order.status = 'awaiting_payment' then
      if exists (select 1 from public.invoices where order_id = v_order.id and amount_paid > 0 and status <> 'void') then
        raise exception 'a paid invoice cannot be re-quoted' using errcode = '22023';
      end if;
      update public.invoices set status = 'void' where order_id = v_order.id and status = 'open';
    end if;
    perform public._apply_order_status(v_order.id, 'awaiting_quote', 'admin', 'quote sent');
  else
    if v_order.status <> 'revision_requested' then
      raise exception 'additional-scope quotes need a pending revision' using errcode = '22023';
    end if;
    update public.revisions set status = 'quoted', quote_id = p_quote where id = v_quote.revision_id;
  end if;

  update public.quotes set status = 'sent', sent_at = now() where id = p_quote;
  perform public.notify_user(v_order.customer_id, 'quote_sent',
    jsonb_build_object('ref', v_order.ref, 'total', v_quote.total, 'currency', v_quote.currency),
    '/portal/orders/' || v_order.id);
end $$;

create or replace function public.accept_quote(p_quote uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_quote public.quotes%rowtype;
  v_order public.orders%rowtype;
  v_invoice uuid;
begin
  select * into v_quote from public.quotes where id = p_quote for update;
  if not found then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;
  select * into v_order from public.orders where id = v_quote.order_id for update;
  if v_order.customer_id is distinct from auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'quote is not open for acceptance' using errcode = '22023';
  end if;
  if v_quote.valid_until <= now() then
    update public.quotes set status = 'expired', decided_at = now() where id = p_quote;
    return null;
  end if;
  if v_quote.revision_id is null and v_order.status <> 'awaiting_quote' then
    raise exception 'order is not awaiting a quote' using errcode = '22023';
  end if;

  update public.quotes set status = 'accepted', decided_at = now() where id = p_quote;

  insert into public.invoices (number, order_id, quote_id, customer_id, currency, total, deposit_amount, due_at)
  values (
    'INV-' || to_char(now() at time zone 'Asia/Riyadh', 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0'),
    v_order.id, p_quote, v_order.customer_id, v_quote.currency, v_quote.total,
    round(v_quote.total * v_quote.deposit_percent / 100.0, 2), now() + interval '3 days'
  ) returning id into v_invoice;

  if v_quote.revision_id is null then
    if v_order.promo_code is not null then
      update public.discounts set redemptions = redemptions + 1
      where code = v_order.promo_code and active
        and (max_redemptions is null or redemptions < max_redemptions);
    end if;
    perform public._apply_order_status(v_order.id, 'awaiting_payment', 'customer', 'quote accepted');
  else
    perform public.notify_admins('revision_quote_accepted', jsonb_build_object('ref', v_order.ref), '/admin/orders/' || v_order.id);
  end if;
  return v_invoice;
end $$;

create or replace function public.decline_quote(p_quote uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.orders%rowtype;
begin
  select o.* into v_order from public.orders o join public.quotes q on q.order_id = o.id where q.id = p_quote;
  if v_order.customer_id is distinct from auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.quotes set status = 'declined', decided_at = now() where id = p_quote and status = 'sent';
  if not found then
    raise exception 'quote is not open' using errcode = '22023';
  end if;
  perform public.notify_admins('quote_declined', jsonb_build_object('ref', v_order.ref), '/admin/orders/' || v_order.id);
end $$;

-- The charge amount is computed here from the invoice, never taken from the
-- client: a deposit when nothing is paid yet and one was asked for, else the
-- outstanding balance. Repeating a key returns the same payment.
create or replace function public.create_payment_intent(p_invoice uuid, p_kind text, p_provider text, p_idempotency_key text)
returns public.payments language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_invoice public.invoices%rowtype;
  v_payment public.payments%rowtype;
  v_amount numeric(12, 2);
  v_kind text;
begin
  select * into v_payment from public.payments where idempotency_key = p_idempotency_key;
  if found then
    if not public.is_service_role() and not public.owns_order(v_payment.order_id) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    return v_payment;
  end if;

  select * into v_invoice from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;
  if not public.is_service_role() and v_invoice.customer_id is distinct from auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_invoice.status not in ('open', 'partially_paid') then
    raise exception 'invoice is not payable' using errcode = '22023';
  end if;

  if p_kind = 'deposit' and v_invoice.amount_paid = 0 and v_invoice.deposit_amount < v_invoice.total then
    v_amount := v_invoice.deposit_amount;
    v_kind := 'deposit';
  else
    v_amount := v_invoice.total - v_invoice.amount_paid;
    v_kind := case when v_invoice.amount_paid = 0 then 'full' else 'balance' end;
  end if;

  update public.payments set status = 'cancelled'
  where invoice_id = p_invoice and status = 'initiated';

  insert into public.payments (invoice_id, order_id, provider, kind, amount, currency, idempotency_key)
  values (p_invoice, v_invoice.order_id, p_provider, v_kind, v_amount, v_invoice.currency, p_idempotency_key)
  returning * into v_payment;
  return v_payment;
end $$;

-- Applies one verified gateway event. Duplicates are absorbed by the unique
-- (provider, event_id); events older than the last one applied cannot
-- regress a payment, and a paid payment is final except for refunds.
create or replace function public.apply_payment_event(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_payment_id uuid,
  p_provider_payment_id text,
  p_status text,
  p_amount numeric,
  p_currency text,
  p_occurred_at timestamptz,
  p_payload jsonb,
  p_method text default null,
  p_fee numeric default null,
  p_settlement_amount numeric default null,
  p_settlement_currency text default null,
  p_failure_reason text default null,
  p_provider_charge_id text default null
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_event uuid;
  v_payment public.payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_quote public.quotes%rowtype;
  v_order public.orders%rowtype;
  v_result text;
begin
  if not public.is_service_role() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'authorized', 'paid', 'failed', 'cancelled', 'expired') then
    raise exception 'unknown payment status %', p_status using errcode = '22023';
  end if;

  insert into public.payment_events (provider, event_id, event_type, occurred_at, payload)
  values (p_provider, p_event_id, p_event_type, p_occurred_at, p_payload)
  on conflict (provider, event_id) do nothing
  returning id into v_event;
  if v_event is null then
    return 'duplicate';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    v_result := 'unknown_payment';
  elsif v_payment.provider <> p_provider
     or (v_payment.provider_payment_id is not null and p_provider_payment_id is not null
         and v_payment.provider_payment_id <> p_provider_payment_id) then
    v_result := 'reference_mismatch';
  elsif v_payment.status in ('paid', 'partially_refunded', 'refunded') then
    v_result := case when p_status = 'paid' then 'already_paid' else 'ignored_final' end;
  elsif p_status <> 'paid' and p_occurred_at is not null and v_payment.last_event_at is not null
        and p_occurred_at < v_payment.last_event_at then
    v_result := 'stale';
  elsif p_status = 'paid' and (p_amount is distinct from v_payment.amount or p_currency is distinct from v_payment.currency) then
    update public.payments set
      failure_reason = format('amount mismatch: expected %s %s, gateway reported %s %s',
                              v_payment.amount, v_payment.currency, p_amount, p_currency),
      provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
      last_event_at = coalesce(p_occurred_at, now())
    where id = v_payment.id;
    perform public.notify_admins('payment_mismatch',
      jsonb_build_object('payment_id', v_payment.id, 'expected', v_payment.amount, 'reported', p_amount),
      '/admin/orders/' || v_payment.order_id);
    v_result := 'amount_mismatch';
  elsif p_status = 'paid' then
    update public.payments set
      status = 'paid', paid_at = coalesce(p_occurred_at, now()),
      provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
      provider_charge_id = coalesce(p_provider_charge_id, provider_charge_id),
      method = coalesce(p_method, method), processor_fee = p_fee,
      settlement_amount = p_settlement_amount, settlement_currency = p_settlement_currency,
      payment_amount = p_amount, payment_currency = p_currency,
      last_event_at = coalesce(p_occurred_at, now()), failure_reason = null
    where id = v_payment.id;

    update public.invoices set
      amount_paid = amount_paid + v_payment.amount,
      status = case when amount_paid + v_payment.amount >= total then 'paid' else 'partially_paid' end
    where id = v_payment.invoice_id
    returning * into v_invoice;

    select * into v_quote from public.quotes where id = v_invoice.quote_id;
    select * into v_order from public.orders where id = v_payment.order_id;
    if v_quote.revision_id is not null then
      if v_invoice.amount_paid >= v_invoice.deposit_amount then
        update public.revisions set status = 'approved', decided_at = now()
        where id = v_quote.revision_id and status = 'quoted';
        if found and v_order.status = 'revision_requested' then
          perform public._apply_order_status(v_order.id, 'revision_in_progress', 'system', 'additional scope paid');
        end if;
      end if;
    elsif v_order.status = 'awaiting_payment' and v_invoice.amount_paid >= v_invoice.deposit_amount then
      perform public._apply_order_status(v_order.id, 'paid', 'system', p_provider || ' ' || coalesce(p_provider_payment_id, ''));
    end if;
    perform public.notify_user(v_order.customer_id, 'payment_received',
      jsonb_build_object('ref', v_order.ref, 'amount', v_payment.amount, 'currency', v_payment.currency),
      '/portal/orders/' || v_order.id);
    v_result := 'applied';
  else
    update public.payments set
      status = p_status,
      provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
      failure_reason = case when p_status in ('failed', 'cancelled', 'expired') then p_failure_reason else failure_reason end,
      last_event_at = coalesce(p_occurred_at, now())
    where id = v_payment.id;
    v_result := 'status_' || p_status;
  end if;

  update public.payment_events set payment_id = v_payment.id, processed_at = now(), result = v_result
  where id = v_event;
  return v_result;
end $$;

create or replace function public.request_refund(p_payment uuid, p_amount numeric, p_reason text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_payment public.payments%rowtype;
  v_reserved numeric;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_payment from public.payments where id = p_payment for update;
  if not found or v_payment.status not in ('paid', 'partially_refunded') then
    raise exception 'only a paid payment can be refunded' using errcode = '22023';
  end if;
  select coalesce(sum(amount), 0) into v_reserved from public.refunds
  where payment_id = p_payment and status not in ('rejected', 'failed');
  if p_amount <= 0 or p_amount + v_reserved > v_payment.amount then
    raise exception 'refund exceeds the refundable amount (%)', v_payment.amount - v_reserved using errcode = '22023';
  end if;
  insert into public.refunds (payment_id, order_id, amount, currency, reason, requested_by)
  values (p_payment, v_payment.order_id, p_amount, v_payment.currency, p_reason, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.decide_refund(p_refund uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.refunds set
    status = case when p_approve then 'approved' else 'rejected' end,
    approved_by = auth.uid(), approved_at = now()
  where id = p_refund and status = 'requested';
  if not found then
    raise exception 'refund is not awaiting a decision' using errcode = '22023';
  end if;
end $$;

create or replace function public.complete_refund(p_refund uuid, p_success boolean, p_provider_refund_id text, p_failure text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_refund public.refunds%rowtype;
  v_payment public.payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_refunded numeric;
begin
  if not public.is_service_role() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_refund from public.refunds where id = p_refund for update;
  if not found or v_refund.status not in ('approved', 'processing') then
    raise exception 'refund is not approved' using errcode = '22023';
  end if;
  if not p_success then
    update public.refunds set status = 'failed', failure_reason = p_failure, completed_at = now() where id = p_refund;
    perform public.notify_admins('refund_failed', jsonb_build_object('refund_id', p_refund), '/admin/orders/' || v_refund.order_id);
    return;
  end if;

  update public.refunds set status = 'succeeded', provider_refund_id = p_provider_refund_id, completed_at = now()
  where id = p_refund;
  select * into v_payment from public.payments where id = v_refund.payment_id for update;
  select coalesce(sum(amount), 0) into v_refunded from public.refunds
  where payment_id = v_payment.id and status = 'succeeded';
  update public.payments set status = case when v_refunded >= amount then 'refunded' else 'partially_refunded' end
  where id = v_payment.id;

  update public.invoices set
    amount_refunded = amount_refunded + v_refund.amount,
    status = case when amount_refunded + v_refund.amount >= amount_paid then 'refunded' else 'partially_refunded' end
  where id = v_payment.invoice_id
  returning * into v_invoice;

  if v_invoice.status = 'refunded'
     and not exists (select 1 from public.invoices where order_id = v_refund.order_id
                     and status in ('paid', 'partially_paid', 'partially_refunded')) then
    perform public._apply_order_status(v_refund.order_id, 'refunded', 'system', 'refund ' || coalesce(p_provider_refund_id, ''));
  end if;
  perform public.notify_user(v_invoice.customer_id, 'refund_succeeded',
    jsonb_build_object('amount', v_refund.amount, 'currency', v_refund.currency), '/portal/orders/' || v_refund.order_id);
end $$;

create or replace function public.request_revision(p_order uuid, p_description text, p_changes text, p_proposed_deadline timestamptz)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_window integer := coalesce((public.config_value('revision_window_days') #>> '{}')::integer, 14);
  v_used integer;
  v_number integer;
  v_id uuid;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found or v_order.customer_id is distinct from auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_order.status not in ('delivered', 'completed') then
    raise exception 'revisions can be requested only for a delivered order' using errcode = '22023';
  end if;
  if v_order.delivered_at is null or v_order.delivered_at + make_interval(days => v_window) < now() then
    raise exception 'the revision window has closed' using errcode = '22023';
  end if;
  if exists (select 1 from public.revisions where order_id = p_order and status in ('requested', 'approved', 'quoted', 'in_progress')) then
    raise exception 'a revision is already open' using errcode = '22023';
  end if;

  select count(*) filter (where not additional_scope and status <> 'declined'), coalesce(max(number), 0) + 1
    into v_used, v_number
  from public.revisions where order_id = p_order;

  insert into public.revisions (order_id, number, description, requested_changes, proposed_deadline, additional_scope, requested_by)
  values (p_order, v_number, p_description, p_changes, p_proposed_deadline, v_used >= v_order.revisions_included, auth.uid())
  returning id into v_id;

  perform public._apply_order_status(p_order, 'revision_requested', 'customer', 'revision #' || v_number);
  return v_id;
end $$;

create or replace function public.decide_revision(p_revision uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_revision public.revisions%rowtype;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_revision from public.revisions where id = p_revision for update;
  if not found or v_revision.status not in ('requested', 'quoted') then
    raise exception 'revision is not awaiting a decision' using errcode = '22023';
  end if;
  if p_approve and v_revision.additional_scope then
    raise exception 'additional-scope revisions are approved by paying their quote' using errcode = '22023';
  end if;

  update public.revisions set
    status = case when p_approve then 'approved' else 'declined' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = p_note
  where id = p_revision;
  if v_revision.status = 'quoted' then
    update public.quotes set status = 'superseded', decided_at = now() where id = v_revision.quote_id and status = 'sent';
  end if;
  perform public._apply_order_status(v_revision.order_id,
    case when p_approve then 'revision_in_progress' else 'delivered' end::public.order_status, 'admin', p_note);
end $$;

create or replace function public.start_revision_qc(p_order uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.orders where id = p_order and status = 'revision_in_progress') then
    raise exception 'order is not in revision' using errcode = '22023';
  end if;
  update public.revisions set status = 'in_progress' where order_id = p_order and status = 'approved';
  perform public._apply_order_status(p_order, 'quality_check', 'admin', 'revision ready for QC');
end $$;

create or replace function public.deliver_version(p_order uuid, p_file uuid, p_note text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_file public.files%rowtype;
  v_version integer;
  v_revision uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order for update;
  if not found or v_order.status <> 'quality_check' then
    raise exception 'delivery requires the order to pass quality check' using errcode = '22023';
  end if;
  select * into v_file from public.files where id = p_file;
  if not found or v_file.order_id <> p_order or v_file.kind <> 'deliverable' or v_file.status <> 'ready' then
    raise exception 'file is not a ready deliverable of this order' using errcode = '22023';
  end if;
  if v_file.scan_status in ('infected', 'pending', 'error') then
    raise exception 'file has not passed the malware scan' using errcode = '22023';
  end if;

  select id into v_revision from public.revisions where order_id = p_order and status = 'in_progress' order by number desc limit 1;
  select coalesce(max(version), 0) + 1 into v_version from public.deliverable_versions where order_id = p_order;

  insert into public.deliverable_versions (order_id, version, file_id, revision_id, note, created_by, delivered_at)
  values (p_order, v_version, p_file, v_revision, p_note, auth.uid(), now());
  if v_revision is not null then
    update public.revisions set status = 'delivered' where id = v_revision;
  end if;

  perform public._apply_order_status(p_order, 'delivered', 'admin', 'version ' || v_version);
  return v_version;
end $$;

create or replace function public.messages_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_conversation public.conversations%rowtype;
  v_link text;
begin
  update public.conversations set last_message_at = new.created_at,
    status = case when new.sender_kind in ('customer', 'external') then 'open' else status end
  where id = new.conversation_id
  returning * into v_conversation;

  if new.sender_id is not null then
    insert into public.conversation_reads (conversation_id, user_id, last_read_at)
    values (new.conversation_id, new.sender_id, new.created_at)
    on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
  end if;

  if new.sender_kind in ('customer', 'external') then
    v_link := case when v_conversation.order_id is not null then '/admin/orders/' || v_conversation.order_id else '/admin/inbox' end;
    perform public.notify_admins('message', jsonb_build_object('conversation_id', new.conversation_id, 'channel', new.channel), v_link);
  elsif new.sender_kind = 'admin' and v_conversation.customer_id is not null then
    v_link := case when v_conversation.order_id is not null then '/portal/orders/' || v_conversation.order_id else '/portal' end;
    perform public.notify_user(v_conversation.customer_id, 'message',
      jsonb_build_object('conversation_id', new.conversation_id), v_link);
  end if;
  return null;
end $$;

create trigger messages_after_insert after insert on public.messages
  for each row execute function public.messages_after_insert();

create or replace function public.mark_conversation_read(p_conversation uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.can_access_conversation(p_conversation) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (p_conversation, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set last_read_at = now();
end $$;

create or replace function public.unread_counts() returns table (conversation_id uuid, unread bigint)
language sql stable security invoker set search_path = public, pg_temp as $$
  select m.conversation_id, count(*)
  from public.messages m
  left join public.conversation_reads r on r.conversation_id = m.conversation_id and r.user_id = auth.uid()
  where m.sender_id is distinct from auth.uid()
    and (r.last_read_at is null or m.created_at > r.last_read_at)
  group by m.conversation_id
$$;

create or replace function public.answer_requirement() returns trigger
language plpgsql as $$
begin
  if new.answer is distinct from old.answer and new.answer is not null then
    new.status := 'answered';
    new.answered_by := auth.uid();
    new.answered_at := now();
  end if;
  return new;
end $$;

create trigger order_requirements_answer before update on public.order_requirements
  for each row execute function public.answer_requirement();

create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into v_count;
  return v_count <= p_limit;
end $$;

create or replace function public.admin_kpis(p_from timestamptz, p_to timestamptz, p_currency text, p_service uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  with scoped as (
    select * from public.orders where p_service is null or service_id = p_service
  ),
  submitted as (
    select * from scoped where submitted_at >= p_from and submitted_at < p_to
  ),
  paid_payments as (
    select p.* from public.payments p join scoped o on o.id = p.order_id
    where p.currency = p_currency and p.paid_at >= p_from and p.paid_at < p_to
      and p.status in ('paid', 'partially_refunded', 'refunded')
  ),
  refunded as (
    select coalesce(sum(r.amount), 0) as amount from public.refunds r join scoped o on o.id = r.order_id
    where r.currency = p_currency and r.status = 'succeeded' and r.completed_at >= p_from and r.completed_at < p_to
  ),
  delivered as (
    select * from scoped where delivered_at >= p_from and delivered_at < p_to
  ),
  responses as (
    select extract(epoch from (
      select min(a.created_at) from public.messages a
      where a.conversation_id = c.conversation_id and a.sender_kind = 'admin' and a.created_at > c.created_at
    ) - c.created_at) / 60.0 as minutes
    from public.messages c
    where c.sender_kind in ('customer', 'external') and c.created_at >= p_from and c.created_at < p_to
  )
  select jsonb_build_object(
    'new_orders', (select count(*) from submitted),
    'active_orders', (select count(*) from scoped where status in ('paid', 'in_review', 'in_progress', 'quality_check', 'revision_requested', 'revision_in_progress')),
    'overdue_orders', (select count(*) from scoped where deadline < now() and status in ('paid', 'in_review', 'in_progress', 'quality_check', 'revision_requested', 'revision_in_progress')),
    'conversion_rate', (select case when count(*) = 0 then null else round(count(*) filter (where exists (
        select 1 from public.order_status_history h where h.order_id = submitted.id and h.to_status = 'paid'))::numeric / count(*), 4) end from submitted),
    'revenue', (select coalesce(sum(amount), 0) from paid_payments) - (select amount from refunded),
    'average_order_value', (select case when count(distinct order_id) = 0 then null else round(sum(amount) / count(distinct order_id), 2) end from paid_payments),
    'unpaid_balances', (select coalesce(sum(i.total - i.amount_paid), 0) from public.invoices i join scoped o on o.id = i.order_id
                        where i.currency = p_currency and i.status in ('open', 'partially_paid')),
    'revision_rate', (select case when count(*) = 0 then null else round(count(*) filter (where exists (
        select 1 from public.revisions r where r.order_id = delivered.id))::numeric / count(*), 4) end from delivered),
    'avg_first_response_minutes', (select round(avg(minutes)::numeric, 1) from responses where minutes is not null),
    'avg_completion_hours', (select round(avg(extract(epoch from (completed_at - submitted_at)) / 3600.0)::numeric, 1)
                             from scoped where completed_at >= p_from and completed_at < p_to),
    'repeat_customers', (select count(*) from (
        select customer_id from scoped o where exists (select 1 from public.invoices i where i.order_id = o.id and i.amount_paid > 0)
        group by customer_id having count(*) >= 2) x)
  ) into v;
  return v;
end $$;
