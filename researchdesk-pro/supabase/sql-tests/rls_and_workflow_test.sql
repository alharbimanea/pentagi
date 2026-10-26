\set ON_ERROR_STOP 1
\set QUIET 1

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'FAIL %', p_label;
  end if;
end $$;

create function tests.expect_error(p_sql text, p_state text, p_label text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL %: expected SQLSTATE % but the statement succeeded', p_label, p_state;
exception when others then
  if sqlerrm like 'FAIL %' then
    raise;
  end if;
  if sqlstate <> p_state then
    raise exception 'FAIL %: expected SQLSTATE %, got % (%)', p_label, p_state, sqlstate, sqlerrm;
  end if;
end $$;

create function tests.affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

create table tests.ids (name text primary key, id uuid not null);
grant select, insert on tests.ids to authenticated, service_role;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name": "Alice", "locale": "ar"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{}'),
  ('00000000-0000-0000-0000-0000000000ff', 'owner@example.com', '{}');
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000ff', 'admin');

select tests.check((select locale from public.profiles where email = 'alice@example.com') = 'ar', 'signup creates a profile');
select tests.check((select count(*) from public.user_roles where user_id = '00000000-0000-0000-0000-00000000000a') = 1, 'signup grants only customer');

\set as_alice 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal1"}'', false); set role authenticated;'
\set as_bob 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated","aal":"aal1"}'', false); set role authenticated;'
\set as_owner_aal1 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated","aal":"aal1"}'', false); set role authenticated;'
\set as_owner 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated","aal":"aal2"}'', false); set role authenticated;'
\set as_service 'reset role; select set_config(''request.jwt.claims'', ''{"role":"service_role"}'', false); set role service_role;'
\set as_anon 'reset role; select set_config(''request.jwt.claims'', ''{"role":"anon"}'', false); set role anon;'

-- Intake and isolation
:as_alice
insert into public.orders (customer_id, service_id, title, word_count, currency)
select '00000000-0000-0000-0000-00000000000a', id, 'Edit my thesis chapter', 6000, 'SAR'
from public.services where slug = 'editing-proofreading';
insert into tests.ids select 'order', id from public.orders;
insert into tests.ids select 'conversation', id from public.conversations;
select tests.check((select ref ~ '^RD-[0-9]{4}-[0-9]{6}$' and status = 'draft' and revisions_included = 1 from public.orders), 'new order gets a reference and starts as draft');
select tests.check((select count(*) from public.conversations) = 1, 'each order gets its own conversation');
select tests.expect_error($$insert into public.orders (customer_id, service_id) select '00000000-0000-0000-0000-00000000000b', id from public.services limit 1$$, '42501', 'cannot create an order for someone else');
select tests.expect_error($$insert into public.orders (customer_id, service_id, status) select '00000000-0000-0000-0000-00000000000a', id, 'paid' from public.services limit 1$$, '42501', 'cannot choose the initial status');
select tests.expect_error($$update public.orders set estimate_amount = 1$$, '42501', 'estimate is not client-writable');
select tests.expect_error($$update public.orders set revisions_included = 9$$, '42501', 'revision allowance is not client-writable');
select tests.expect_error($$update public.user_roles set role = 'admin'$$, '42501', 'roles are not client-writable');
select tests.expect_error($$insert into public.user_roles values ('00000000-0000-0000-0000-00000000000a', 'admin')$$, '42501', 'roles cannot be self-granted');
select tests.expect_error($$update public.profiles set email = 'x@example.com'$$, '42501', 'profile email is not client-writable');
select tests.check(tests.affected($$update public.profiles set full_name = 'Alice A'$$) = 1, 'own profile is editable');
select tests.check(public.is_admin() = false, 'customer is not admin');

:as_bob
select tests.check((select count(*) from public.orders) = 0, 'other customers see no orders');
select tests.check((select count(*) from public.conversations) = 0, 'other customers see no conversations');
select tests.check((select count(*) from public.profiles) = 1, 'other customers see only their own profile');
select tests.check(tests.affected($$update public.orders set title = 'hijack'$$) = 0, 'other customers cannot edit an order');
select tests.check(tests.affected($$delete from public.orders$$) = 0, 'other customers cannot delete an order');
select tests.expect_error(format('select public.transition_order_status(%L, ''cancelled'')', (select id from tests.ids where name = 'order')), '42501', 'other customers cannot cancel an order');
select tests.expect_error(format('insert into public.messages (conversation_id, sender_id, sender_kind, body) values (%L, auth.uid(), ''customer'', ''hi'')', (select id from tests.ids where name = 'conversation')), '42501', 'other customers cannot post into a conversation');

:as_anon
select tests.check((select count(*) from public.services) = 9, 'anonymous visitors see the catalogue');
select tests.expect_error($$select count(*) from public.orders$$, '42501', 'anonymous visitors cannot query orders');

-- Submission
:as_alice
select tests.expect_error(format('select public.transition_order_status(%L, ''submitted'')', (select id from tests.ids where name = 'order')), '22023', 'submission requires accepted terms');
update public.orders set terms_accepted_at = now(), acceptable_use_confirmed_at = now(), deadline = now() + interval '10 days';
select public.transition_order_status((select id from tests.ids where name = 'order'), 'submitted');
select tests.check((select status = 'submitted' and submitted_at is not null from public.orders), 'customer submits a draft');
select tests.check(tests.affected($$update public.orders set title = 'changed after submit'$$) = 0, 'a submitted order is no longer editable');
select tests.expect_error($$update public.orders set status = 'paid'$$, '42501', 'status is not a writable column');
select tests.expect_error(format('select public.transition_order_status(%L, ''awaiting_quote'')', (select id from tests.ids where name = 'order')), '22023', 'customers cannot advance the workflow');
select tests.check((select count(*) from public.order_status_history) = 2, 'history records creation and submission');

:as_owner_aal1
select tests.check(public.is_admin() = false, 'admin without MFA is not admin');
select tests.check((select count(*) from public.orders) = 0, 'admin without MFA sees no customer orders');

-- Quote
:as_owner
select tests.check(public.is_admin(), 'admin with MFA is admin');
select tests.check((select count(*) from public.orders) = 1, 'admin sees every order');
insert into public.order_requirements (order_id, question, asked_by)
select id, 'Which citation style?', auth.uid() from public.orders;
insert into public.quotes (order_id, currency, subtotal, discount_amount, deposit_percent, valid_until, created_by)
select id, 'SAR', 600, 100, 50, now() + interval '7 days', auth.uid() from public.orders;
insert into tests.ids select 'quote', id from public.quotes;
insert into public.order_internal_notes (order_id, author_id, body) select id, auth.uid(), 'Customer seems in a hurry; check scope.' from public.orders;

:as_alice
select tests.check((select count(*) from public.quotes) = 0, 'draft quotes are hidden from the customer');
select tests.check((select count(*) from public.order_internal_notes) = 0, 'internal notes are hidden from the customer');
update public.order_requirements set answer = 'APA 7';
select tests.check((select status = 'answered' and answered_by = auth.uid() from public.order_requirements), 'answering a requirement marks it answered');
select tests.expect_error(format('select public.send_quote(%L)', (select id from tests.ids where name = 'quote')), '42501', 'customers cannot send quotes');

:as_owner
select public.send_quote((select id from tests.ids where name = 'quote'));
select tests.check((select status from public.orders) = 'awaiting_quote', 'sending a quote moves the order to awaiting_quote');

:as_bob
select tests.expect_error(format('select public.accept_quote(%L)', (select id from tests.ids where name = 'quote')), '42501', 'only the customer accepts a quote');

:as_alice
select tests.check((select total from public.quotes) = 500, 'customer sees the sent quote with its total');
insert into tests.ids select 'invoice', public.accept_quote((select id from tests.ids where name = 'quote'));
select tests.check((select status from public.orders) = 'awaiting_payment', 'accepting a quote awaits payment');
select tests.check((select total = 500 and deposit_amount = 250 and number ~ '^INV-' from public.invoices), 'invoice carries total and deposit');

-- Chat
:as_alice
insert into public.messages (conversation_id, sender_id, sender_kind, body)
select id, auth.uid(), 'customer', 'Hello, a question about the deadline' from public.conversations;
select tests.expect_error($$insert into public.messages (conversation_id, sender_id, sender_kind, body) select id, auth.uid(), 'admin', 'spoof' from public.conversations$$, '42501', 'customers cannot post as admin');
select tests.expect_error($$insert into public.messages (conversation_id, sender_id, sender_kind, body) select id, '00000000-0000-0000-0000-0000000000ff', 'customer', 'spoof' from public.conversations$$, '42501', 'customers cannot post as someone else');
select tests.expect_error($$update public.messages set body = 'edited'$$, '42501', 'messages are immutable');

:as_owner
insert into public.messages (conversation_id, sender_id, sender_kind, body)
select id, auth.uid(), 'admin', 'Thanks — the deadline works.' from public.conversations;
select tests.check((select count(*) from public.notifications where type = 'message') = 1, 'customer messages notify the admin');

:as_alice
select tests.check((select unread from public.unread_counts()) = 1, 'customer has one unread admin reply');
select public.mark_conversation_read((select id from public.conversations));
select tests.check((select count(*) from public.unread_counts()) = 0, 'marking read clears unread');

:as_bob
select tests.check((select count(*) from public.messages) = 0, 'other customers read no messages');
select tests.check((select count(*) from public.notifications) = 0, 'other customers see no notifications');

-- Payments
:as_alice
insert into tests.ids select 'payment', id from public.create_payment_intent((select id from tests.ids where name = 'invoice'), 'deposit', 'sandbox', 'key-1');
select tests.check((select amount = 250 and kind = 'deposit' from public.payments), 'deposit amount comes from the invoice');
select tests.check((select id from public.create_payment_intent((select id from tests.ids where name = 'invoice'), 'deposit', 'sandbox', 'key-1')) = (select id from tests.ids where name = 'payment'), 'repeating an idempotency key returns the same payment');
select tests.expect_error(format('select public.apply_payment_event(''sandbox'', ''e'', ''x'', %L, null, ''paid'', 250, ''SAR'', now(), ''{}'')', (select id from tests.ids where name = 'payment')), '42501', 'customers cannot apply payment events');

:as_bob
select tests.expect_error(format('select public.create_payment_intent(%L, ''full'', ''sandbox'', ''key-b'')', (select id from tests.ids where name = 'invoice')), '42501', 'other customers cannot pay an invoice');

:as_service
select tests.check(public.apply_payment_event('sandbox', 'evt-1', 'payment.paid', (select id from tests.ids where name = 'payment'), 'pay_1', 'paid', 200, 'SAR', now(), '{}') = 'amount_mismatch', 'underpayment is not credited');
select tests.check((select status from public.orders) = 'awaiting_payment', 'mismatched payment leaves the order unpaid');
select tests.check(public.apply_payment_event('sandbox', 'evt-2', 'payment.paid', (select id from tests.ids where name = 'payment'), 'pay_1', 'paid', 250, 'SAR', now(), '{}', 'mada') = 'applied', 'matching payment is applied');
select tests.check(public.apply_payment_event('sandbox', 'evt-2', 'payment.paid', (select id from tests.ids where name = 'payment'), 'pay_1', 'paid', 250, 'SAR', now(), '{}') = 'duplicate', 'duplicate webhook is absorbed');
select tests.check(public.apply_payment_event('sandbox', 'evt-0', 'payment.failed', (select id from tests.ids where name = 'payment'), 'pay_1', 'failed', 250, 'SAR', now() - interval '1 hour', '{}') = 'ignored_final', 'late failure cannot undo a payment');
select tests.check(public.apply_payment_event('other', 'evt-9', 'payment.paid', (select id from tests.ids where name = 'payment'), 'pay_1', 'paid', 250, 'SAR', now(), '{}') = 'reference_mismatch', 'event from another provider is rejected');
select tests.check((select status from public.orders) = 'paid', 'deposit marks the order paid');
select tests.check((select amount_paid = 250 and status = 'partially_paid' from public.invoices), 'invoice records the deposit');
select tests.check((select count(*) from public.order_status_history where to_status = 'paid') = 1, 'paid is recorded once');

:as_alice
select tests.check((select amount = 250 and kind = 'balance' from public.create_payment_intent((select id from tests.ids where name = 'invoice'), 'deposit', 'sandbox', 'key-2')), 'after the deposit only the balance is payable');

-- Delivery
:as_owner
select public.transition_order_status((select id from tests.ids where name = 'order'), 'in_review');
select public.transition_order_status((select id from tests.ids where name = 'order'), 'in_progress');
select tests.expect_error(format('select public.transition_order_status(%L, ''delivered'')', (select id from tests.ids where name = 'order')), '22023', 'delivery cannot skip quality check');
select public.transition_order_status((select id from tests.ids where name = 'order'), 'quality_check');

:as_alice
select tests.expect_error($$insert into public.files (order_id, uploader_id, kind, path, original_name, mime_type, size_bytes) select id, auth.uid(), 'attachment', 'x', 'x.pdf', 'application/pdf', 1 from public.orders$$, '42501', 'files are registered only by the server');

:as_service
insert into public.files (order_id, uploader_id, kind, path, original_name, mime_type, size_bytes, status, scan_status)
select id, '00000000-0000-0000-0000-0000000000ff', 'deliverable', id || '/v1.docx', 'v1.docx', 'application/pdf', 1000, 'ready', 'clean' from public.orders;
insert into tests.ids select 'file1', id from public.files where original_name = 'v1.docx';

:as_alice
select tests.check((select count(*) from public.files) = 0, 'undelivered deliverables are hidden');

:as_owner
select tests.check(public.deliver_version((select id from tests.ids where name = 'order'), (select id from tests.ids where name = 'file1'), 'first version') = 1, 'first delivery is version 1');

:as_alice
select tests.check((select status from public.orders) = 'delivered', 'order is delivered');
select tests.check((select count(*) from public.files) = 1, 'delivered file becomes visible');

-- Revisions
insert into tests.ids select 'rev1', public.request_revision((select id from tests.ids where name = 'order'), 'Please tighten chapter two.', 'Shorten section 2.3', null);
select tests.check((select status from public.orders) = 'revision_requested' and (select not additional_scope from public.revisions), 'first revision is included');
select tests.expect_error(format('select public.request_revision(%L, ''Another change please'', ''x'', null)', (select id from tests.ids where name = 'order')), '22023', 'only one revision can be open');

:as_owner
select public.decide_revision((select id from tests.ids where name = 'rev1'), true, 'ok');
select public.start_revision_qc((select id from tests.ids where name = 'order'));

:as_service
insert into public.files (order_id, uploader_id, kind, path, original_name, mime_type, size_bytes, status, scan_status)
select id, '00000000-0000-0000-0000-0000000000ff', 'deliverable', id || '/v2.docx', 'v2.docx', 'application/pdf', 1000, 'ready', 'infected' from public.orders;
insert into tests.ids select 'file2', id from public.files where original_name = 'v2.docx';

:as_owner
select tests.expect_error(format('select public.deliver_version(%L, %L, null)', (select id from tests.ids where name = 'order'), (select id from tests.ids where name = 'file2')), '22023', 'infected files cannot be delivered');
reset role;
update public.files set scan_status = 'clean' where original_name = 'v2.docx';
:as_owner
select tests.check(public.deliver_version((select id from tests.ids where name = 'order'), (select id from tests.ids where name = 'file2'), 'revised') = 2, 'revision delivers version 2');
select tests.check((select status from public.revisions) = 'delivered', 'revision is marked delivered');

:as_alice
insert into tests.ids select 'rev2', public.request_revision((select id from tests.ids where name = 'order'), 'One more round of changes.', 'Restructure chapter 3', null);
select tests.check((select additional_scope from public.revisions where number = 2), 'revision beyond the allowance is additional scope');

:as_owner
select tests.expect_error(format('select public.decide_revision(%L, true, null)', (select id from tests.ids where name = 'rev2')), '22023', 'additional scope needs a paid quote');
select public.decide_revision((select id from tests.ids where name = 'rev2'), false, 'out of scope');
select tests.check((select status from public.orders) = 'delivered', 'declined revision returns to delivered');

:as_alice
select public.transition_order_status((select id from tests.ids where name = 'order'), 'completed');
select tests.check((select status from public.orders) = 'completed' and (select status from public.revisions where number = 1) = 'accepted', 'completion accepts the delivered revision');

-- Refunds
:as_alice
select tests.expect_error(format('select public.request_refund(%L, 10, ''please'')', (select id from tests.ids where name = 'payment')), '42501', 'customers cannot create refunds');

:as_owner
select tests.expect_error(format('select public.request_refund(%L, 300, ''too much'')', (select id from tests.ids where name = 'payment')), '22023', 'refund cannot exceed the payment');
insert into tests.ids select 'refund', public.request_refund((select id from tests.ids where name = 'payment'), 100, 'goodwill');

:as_service
select tests.expect_error(format('select public.complete_refund(%L, true, ''re_1'')', (select id from tests.ids where name = 'refund')), '22023', 'unapproved refunds cannot complete');

:as_owner
select public.decide_refund((select id from tests.ids where name = 'refund'), true);

:as_service
select public.complete_refund((select id from tests.ids where name = 'refund'), true, 're_1');
select tests.check((select status = 'partially_refunded' and amount_refunded = 100 from public.invoices), 'partial refund is recorded on the invoice');
select tests.check((select status from public.payments where id = (select id from tests.ids where name = 'payment')) = 'partially_refunded', 'payment shows the partial refund');

-- Audit, immutability, reporting, rate limits
reset role;
select tests.expect_error($$update public.order_status_history set note = 'rewritten'$$, '42501', 'status history is append-only');
select tests.expect_error($$delete from public.audit_logs$$, '42501', 'audit log is append-only');
select tests.check((select count(*) from public.audit_logs where table_name = 'payments') >= 2, 'payments are audited');

:as_owner
select tests.check((public.admin_kpis(now() - interval '1 day', now() + interval '1 day', 'SAR') ->> 'new_orders')::int = 1, 'KPIs count new orders');
select tests.check((public.admin_kpis(now() - interval '1 day', now() + interval '1 day', 'SAR') ->> 'revenue')::numeric = 150, 'KPI revenue nets refunds');

:as_alice
select tests.expect_error($$select public.admin_kpis(now() - interval '1 day', now(), 'SAR')$$, '42501', 'customers cannot read KPIs');
select tests.expect_error($$select public.check_rate_limit('k', 1, 60)$$, '42501', 'customers cannot call the rate limiter');

:as_service
select tests.check(public.check_rate_limit('login:1', 2, 60) and public.check_rate_limit('login:1', 2, 60) and not public.check_rate_limit('login:1', 2, 60), 'rate limiter blocks the third call');

reset role;
\echo 'all database assertions passed'
