-- Privileges and row-level security. Supabase grants every new public table
-- to anon and authenticated by default; this migration starts from nothing
-- and grants back only what each role needs, so a table added later without
-- its own grants is closed rather than open.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Only the application's own functions: extension functions (citext's
-- operators) must stay executable by everyone.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant execute on function public.is_admin(), public.is_service_role(), public.owns_order(uuid),
  public.can_access_conversation(uuid), public.config_value(text), public.order_transition_allowed(text, public.order_status, public.order_status)
  to anon, authenticated;
grant execute on function
  public.transition_order_status(uuid, public.order_status, text),
  public.send_quote(uuid), public.accept_quote(uuid), public.decline_quote(uuid),
  public.create_payment_intent(uuid, text, text, text),
  public.request_refund(uuid, numeric, text), public.decide_refund(uuid, boolean),
  public.request_revision(uuid, text, text, timestamptz), public.decide_revision(uuid, boolean, text),
  public.start_revision_qc(uuid), public.deliver_version(uuid, uuid, text),
  public.mark_conversation_read(uuid), public.unread_counts(), public.admin_kpis(timestamptz, timestamptz, text, uuid)
  to authenticated;

alter table public.app_config enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.services enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.discounts enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.orders enable row level security;
alter table public.order_requirements enable row level security;
alter table public.order_status_history enable row level security;
alter table public.order_assignments enable row level security;
alter table public.files enable row level security;
alter table public.revisions enable row level security;
alter table public.deliverable_versions enable row level security;
alter table public.quotes enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.refunds enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.messages enable row level security;
alter table public.order_internal_notes enable row level security;
alter table public.support_tickets enable row level security;
alter table public.channel_identities enable row level security;
alter table public.channel_link_codes enable row level security;
alter table public.notifications enable row level security;
alter table public.consent_records enable row level security;
alter table public.integration_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.posts enable row level security;
alter table public.rate_limits enable row level security;

-- Public catalogue
grant select on public.services, public.pricing_rules, public.exchange_rates, public.posts to anon, authenticated;
grant select on public.app_config to authenticated;
create policy services_read on public.services for select using (active or public.is_admin());
create policy pricing_rules_read on public.pricing_rules for select using (active or public.is_admin());
create policy exchange_rates_read on public.exchange_rates for select using (true);
create policy posts_read on public.posts for select using ((published_at is not null and published_at <= now()) or public.is_admin());
create policy app_config_admin_read on public.app_config for select using (public.is_admin());

grant insert, update, delete on public.services, public.pricing_rules, public.discounts, public.exchange_rates, public.posts to authenticated;
grant select on public.discounts to authenticated;
grant update (value) on public.app_config to authenticated;
create policy services_admin on public.services for all using (public.is_admin()) with check (public.is_admin());
create policy pricing_rules_admin on public.pricing_rules for all using (public.is_admin()) with check (public.is_admin());
create policy discounts_admin on public.discounts for all using (public.is_admin()) with check (public.is_admin());
create policy exchange_rates_admin on public.exchange_rates for all using (public.is_admin()) with check (public.is_admin());
create policy posts_admin on public.posts for all using (public.is_admin()) with check (public.is_admin());
create policy app_config_admin on public.app_config for update using (public.is_admin()) with check (public.is_admin());

-- Identity: role is never writable from a client session
grant select on public.profiles, public.user_roles to authenticated;
grant update (full_name, locale, timezone, preferred_currency, phone, marketing_opt_in) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy user_roles_read on public.user_roles for select using (user_id = auth.uid() or public.is_admin());

-- Orders: customers edit only their own drafts and only intake fields
grant select, delete on public.orders to authenticated;
grant insert (customer_id, service_id, title, discipline, intended_use, scope, level, complexity, word_count, page_count,
              citation_style, references_notes, methodology, language, deadline, timezone, instructions, addons,
              express, promo_code, currency)
  on public.orders to authenticated;
grant update (service_id, title, discipline, intended_use, scope, level, complexity, word_count, page_count,
              citation_style, references_notes, methodology, language, deadline, timezone, instructions, addons,
              express, promo_code, currency, terms_accepted_at, acceptable_use_confirmed_at)
  on public.orders to authenticated;
create policy orders_read on public.orders for select using (customer_id = auth.uid() or public.is_admin());
create policy orders_insert on public.orders for insert with check (customer_id = auth.uid());
create policy orders_update_draft on public.orders for update
  using (customer_id = auth.uid() and status = 'draft')
  with check (customer_id = auth.uid() and status = 'draft');
create policy orders_update_admin on public.orders for update using (public.is_admin()) with check (public.is_admin());
create policy orders_delete_draft on public.orders for delete using (customer_id = auth.uid() and status = 'draft');

grant select, insert on public.order_requirements to authenticated;
grant update (answer) on public.order_requirements to authenticated;
grant update (status) on public.order_requirements to authenticated;
create policy requirements_read on public.order_requirements for select using (public.owns_order(order_id) or public.is_admin());
create policy requirements_insert on public.order_requirements for insert with check (public.is_admin());
create policy requirements_answer on public.order_requirements for update
  using (public.owns_order(order_id) and status = 'open')
  with check (public.owns_order(order_id) and status in ('open', 'answered'));
create policy requirements_admin on public.order_requirements for update using (public.is_admin()) with check (public.is_admin());

grant select on public.order_status_history to authenticated;
create policy status_history_read on public.order_status_history for select using (public.owns_order(order_id) or public.is_admin());

grant select on public.order_assignments to authenticated;
create policy assignments_read on public.order_assignments for select using (public.is_admin() or assignee_id = auth.uid());

-- Files: every write goes through the server, which checks the order and
-- issues a signed upload URL. A deliverable is visible to the customer only
-- once a delivered version points at it.
grant select on public.files to authenticated;
create policy files_read on public.files for select using (
  public.is_admin()
  or (public.owns_order(order_id) and status = 'ready' and (
        kind <> 'deliverable'
        or exists (select 1 from public.deliverable_versions v where v.file_id = files.id and v.delivered_at is not null)))
);

grant select on public.deliverable_versions, public.revisions to authenticated;
create policy deliverables_read on public.deliverable_versions for select
  using (public.is_admin() or (public.owns_order(order_id) and delivered_at is not null));
create policy revisions_read on public.revisions for select using (public.owns_order(order_id) or public.is_admin());

-- Commerce: amounts are written only by SECURITY DEFINER functions
grant select on public.quotes, public.invoices, public.payments, public.refunds to authenticated;
grant insert, update, delete on public.quotes to authenticated;
create policy quotes_read on public.quotes for select using (public.is_admin() or (public.owns_order(order_id) and status <> 'draft'));
create policy quotes_admin_insert on public.quotes for insert with check (public.is_admin() and status = 'draft' and created_by = auth.uid());
create policy quotes_admin_update on public.quotes for update using (public.is_admin() and status = 'draft') with check (public.is_admin() and status = 'draft');
create policy quotes_admin_delete on public.quotes for delete using (public.is_admin() and status = 'draft');
create policy invoices_read on public.invoices for select using (customer_id = auth.uid() or public.is_admin());
create policy payments_read on public.payments for select using (public.owns_order(order_id) or public.is_admin());
create policy refunds_read on public.refunds for select using (public.owns_order(order_id) or public.is_admin());

grant select on public.payment_events, public.integration_events, public.audit_logs to authenticated;
create policy payment_events_admin on public.payment_events for select using (public.is_admin());
create policy integration_events_admin on public.integration_events for select using (public.is_admin());
create policy audit_logs_admin on public.audit_logs for select using (public.is_admin());

-- Messaging
grant select, insert on public.conversations to authenticated;
grant update (status, priority, assigned_to) on public.conversations to authenticated;
create policy conversations_read on public.conversations for select using (customer_id = auth.uid() or public.is_admin());
create policy conversations_insert on public.conversations for insert with check (
  public.is_admin()
  or (customer_id = auth.uid() and channel = 'web' and order_id is null)
);
create policy conversations_admin_update on public.conversations for update using (public.is_admin()) with check (public.is_admin());

grant select on public.conversation_reads to authenticated;
create policy conversation_reads_read on public.conversation_reads for select using (public.can_access_conversation(conversation_id));

grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, sender_kind, body, file_id) on public.messages to authenticated;
create policy messages_read on public.messages for select using (public.can_access_conversation(conversation_id));
create policy messages_insert on public.messages for insert with check (
  sender_id = auth.uid()
  and public.can_access_conversation(conversation_id)
  and sender_kind = case when public.is_admin() then 'admin' else 'customer' end
  and (file_id is null or exists (
        select 1 from public.files f join public.conversations c on c.id = messages.conversation_id
        where f.id = messages.file_id and f.order_id is not distinct from c.order_id and f.kind = 'message' and f.uploader_id = auth.uid()))
);

grant select, insert, delete on public.order_internal_notes to authenticated;
create policy internal_notes_admin on public.order_internal_notes for all using (public.is_admin()) with check (public.is_admin());

grant select on public.support_tickets to authenticated;
grant update (status, priority) on public.support_tickets to authenticated;
create policy tickets_read on public.support_tickets for select using (customer_id = auth.uid() or public.is_admin());
create policy tickets_admin on public.support_tickets for update using (public.is_admin()) with check (public.is_admin());

grant select on public.channel_identities to authenticated;
grant delete on public.channel_identities to authenticated;
create policy channel_identities_read on public.channel_identities for select using (user_id = auth.uid() or public.is_admin());
create policy channel_identities_unlink on public.channel_identities for delete using (user_id = auth.uid());

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_own on public.notifications for select using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert on public.consent_records to authenticated;
create policy consent_read on public.consent_records for select using (user_id = auth.uid() or public.is_admin());
create policy consent_insert on public.consent_records for insert with check (
  user_id = auth.uid() and (order_id is null or public.owns_order(order_id))
);
