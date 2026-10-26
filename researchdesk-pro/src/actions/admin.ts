"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/actions/types";
import { aiConfigured, summarizeIntake } from "@/lib/ai/assist";
import { getViewer } from "@/lib/auth";
import { configValue } from "@/lib/config";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { ORDER_STATUSES } from "@/lib/orders/status";
import { adapterById } from "@/lib/payments/registry";
import { rateLimit } from "@/lib/security/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

function localeOf(form: FormData): Locale {
  const v = String(form.get("locale") ?? "");
  return isLocale(v) ? v : "en";
}

// Every write below goes through the caller's session, so Postgres checks
// is_admin() (role + aal2) on each one. This guard only produces a clean
// error before the round trip.
async function adminSession() {
  const viewer = await getViewer();
  if (!viewer?.isAdminRole) throw new Error("not allowed");
  return { viewer, supabase: await serverClient() };
}

function done(locale: Locale, orderId?: string) {
  revalidatePath(orderId ? `/${locale}/admin/orders/${orderId}` : `/${locale}/admin`);
}

function fail(error: { message: string } | null): ActionState {
  return error ? { error: error.message } : { ok: true };
}

export async function adminTransitionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const { supabase } = await adminSession();
  const orderId = uuid.parse(form.get("order_id"));
  const to = z.enum(ORDER_STATUSES).parse(form.get("to"));
  const note = z.string().trim().max(2000).optional().parse(form.get("note") || undefined);
  const { error } = await supabase.rpc("transition_order_status", { p_order: orderId, p_to: to, p_note: note ?? null });
  done(locale, orderId);
  return fail(error);
}

const quoteSchema = z.object({
  order_id: uuid,
  revision_id: uuid.optional().or(z.literal("")),
  currency: z.enum(["SAR", "USD"]),
  subtotal: z.coerce.number().positive().max(1_000_000),
  discount_amount: z.coerce.number().min(0).max(1_000_000).default(0),
  deposit_percent: z.coerce.number().int().min(10).max(100),
  valid_days: z.coerce.number().int().min(1).max(60),
  delivery_estimate: z.string().optional(),
  notes: z.string().trim().max(4000).optional(),
});

export async function sendQuoteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const dict = getDictionary(locale);
  const { viewer, supabase } = await adminSession();
  const parsed = quoteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: dict.errors.validation };
  const q = parsed.data;
  if (q.discount_amount > q.subtotal) return { error: dict.errors.validation };
  const delivery = q.delivery_estimate ? new Date(q.delivery_estimate) : null;
  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      order_id: q.order_id,
      revision_id: q.revision_id || null,
      currency: q.currency,
      subtotal: q.subtotal,
      discount_amount: q.discount_amount,
      deposit_percent: q.deposit_percent,
      valid_until: new Date(Date.now() + q.valid_days * 86_400_000).toISOString(),
      delivery_estimate: delivery && !Number.isNaN(delivery.getTime()) ? delivery.toISOString() : null,
      notes: q.notes || null,
      line_items: [{ description: "Quoted scope", amount: q.subtotal }],
      created_by: viewer.user.id,
    })
    .select("id")
    .single();
  if (error || !quote) return fail(error);
  const { error: sendError } = await supabase.rpc("send_quote", { p_quote: quote.id });
  if (sendError) await supabase.from("quotes").delete().eq("id", quote.id);
  done(locale, q.order_id);
  return sendError ? fail(sendError) : { ok: true, message: dict.admin.sendQuote };
}

export async function askQuestionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const { viewer, supabase } = await adminSession();
  const orderId = uuid.parse(form.get("order_id"));
  const question = z.string().trim().min(1).max(2000).parse(form.get("question"));
  const { data: order } = await supabase.from("orders").select("status, customer_id, ref").eq("id", orderId).single();
  const { error } = await supabase.from("order_requirements").insert({ order_id: orderId, question, asked_by: viewer.user.id });
  if (error) return fail(error);
  if (order && ["submitted", "awaiting_quote"].includes(order.status)) {
    await supabase.rpc("transition_order_status", { p_order: orderId, p_to: "needs_clarification", p_note: null });
  } else if (order) {
    await adminClient().rpc("notify_user", { p_user: order.customer_id, p_type: "order_status", p_payload: { ref: order.ref, to: "needs_clarification" }, p_link: `/portal/orders/${orderId}` });
  }
  done(locale, orderId);
  return { ok: true };
}

export async function addInternalNoteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const { viewer, supabase } = await adminSession();
  const orderId = uuid.parse(form.get("order_id"));
  const body = z.string().trim().min(1).max(20_000).parse(form.get("body"));
  const { error } = await supabase.from("order_internal_notes").insert({ order_id: orderId, author_id: viewer.user.id, body });
  done(locale, orderId);
  return fail(error);
}

export async function deliverAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const { supabase } = await adminSession();
  const orderId = uuid.parse(form.get("order_id"));
  const fileId = uuid.parse(form.get("file_id"));
  const note = z.string().trim().max(2000).optional().parse(form.get("note") || undefined);
  const { error } = await supabase.rpc("deliver_version", { p_order: orderId, p_file: fileId, p_note: note ?? null });
  done(locale, orderId);
  return fail(error);
}

export async function revisionDecisionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const { supabase } = await adminSession();
  const orderId = uuid.parse(form.get("order_id"));
  const revisionId = uuid.parse(form.get("revision_id"));
  const approve = form.get("decision") === "approve";
  const note = z.string().trim().max(2000).optional().parse(form.get("note") || undefined);
  const { error } = await supabase.rpc("decide_revision", { p_revision: revisionId, p_approve: approve, p_note: note ?? null });
  done(locale, orderId);
  return fail(error);
}

export async function startRevisionQcAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const { supabase } = await adminSession();
  const orderId = uuid.parse(form.get("order_id"));
  const { error } = await supabase.rpc("start_revision_qc", { p_order: orderId });
  done(locale, orderId);
  return fail(error);
}

export async function requestRefundAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const { supabase } = await adminSession();
  const orderId = uuid.parse(form.get("order_id"));
  const paymentId = uuid.parse(form.get("payment_id"));
  const amount = z.coerce.number().positive().parse(form.get("amount"));
  const reason = z.string().trim().min(3).max(2000).parse(form.get("reason"));
  const { error } = await supabase.rpc("request_refund", { p_payment: paymentId, p_amount: amount, p_reason: reason });
  done(locale, orderId);
  return fail(error);
}

// Approval and execution are one click for a solo owner, but two steps in
// the ledger: decide_refund records the approver under an aal2 session,
// then the gateway call runs and complete_refund records its outcome.
export async function decideRefundAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const { supabase } = await adminSession();
  const orderId = uuid.parse(form.get("order_id"));
  const refundId = uuid.parse(form.get("refund_id"));
  const approve = form.get("decision") === "approve";
  const { error } = await supabase.rpc("decide_refund", { p_refund: refundId, p_approve: approve });
  if (error || !approve) {
    done(locale, orderId);
    return fail(error);
  }

  const db = adminClient();
  const { data: refund } = await db.from("refunds").select("*, payments(*)").eq("id", refundId).single();
  const payment = refund?.payments as { provider: string; provider_payment_id: string | null; provider_charge_id: string | null } | null;
  const adapter = payment ? adapterById(payment.provider) : undefined;
  if (!refund || !payment || !adapter?.isConfigured()) {
    done(locale, orderId);
    return { error: "Refund approved, but the payment provider is not configured; it stays approved until it can be executed." };
  }
  await db.from("refunds").update({ status: "processing" }).eq("id", refundId);
  const result = await adapter.refund({
    providerPaymentId: payment.provider_payment_id,
    providerChargeId: payment.provider_charge_id,
    amount: Number(refund.amount),
    currency: refund.currency,
  });
  const { error: completeError } = await db.rpc("complete_refund", {
    p_refund: refundId,
    p_success: result.ok,
    p_provider_refund_id: result.providerRefundId ?? null,
    p_failure: result.error ?? null,
  });
  done(locale, orderId);
  if (completeError) return fail(completeError);
  return result.ok ? { ok: true } : { error: `Refund failed at the provider: ${result.error ?? "unknown"}` };
}

export async function aiSummaryAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const dict = getDictionary(locale);
  const { viewer, supabase } = await adminSession();
  const orderId = uuid.parse(form.get("order_id"));
  if (!(await configValue("ai_assist_enabled", false)) || !aiConfigured()) return { error: dict.admin.aiDisabled };
  if (!(await rateLimit("ai", viewer.user.id))) return { error: dict.errors.rateLimited };

  const { data: consent } = await supabase
    .from("consent_records")
    .select("granted")
    .eq("order_id", orderId)
    .eq("kind", "ai_processing")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!consent?.granted) return { error: dict.admin.aiNoConsent };

  const { data: order } = await supabase.from("orders").select("*, services(name_en, unit)").eq("id", orderId).single();
  if (!order) return { error: dict.errors.generic };
  const service = order.services as { name_en: string; unit: string };
  try {
    const summary = await summarizeIntake({
      service: service.name_en,
      title: order.title,
      discipline: order.discipline,
      intendedUse: order.intended_use,
      scope: order.scope,
      methodology: order.methodology,
      citationStyle: order.citation_style,
      quantity: service.unit === "word" ? order.word_count : order.page_count,
      deadline: order.deadline,
      instructions: order.instructions,
    });
    const { error } = await supabase.from("order_internal_notes").insert({ order_id: orderId, author_id: viewer.user.id, source: "ai", body: summary || "(empty)" });
    done(locale, orderId);
    return fail(error);
  } catch (err) {
    console.error("ai summary failed", err);
    return { error: dict.errors.generic };
  }
}

const serviceSchema = z.object({
  id: uuid,
  base_price_sar: z.coerce.number().min(0),
  base_price_usd: z.coerce.number().min(0),
  min_price_sar: z.coerce.number().min(0),
  min_price_usd: z.coerce.number().min(0),
  revisions_included: z.coerce.number().int().min(0).max(10),
  default_turnaround_hours: z.coerce.number().int().min(1),
  active: z.literal("on").optional(),
});

export async function updateServiceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const { supabase } = await adminSession();
  const parsed = serviceSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: getDictionary(locale).errors.validation };
  const { id, active, ...fields } = parsed.data;
  const { error } = await supabase.from("services").update({ ...fields, active: active === "on" }).eq("id", id);
  revalidatePath(`/${locale}/admin/pricing`);
  return fail(error);
}

const ruleSchema = z.object({
  id: uuid,
  multiplier: z.union([z.literal(""), z.coerce.number().positive().max(10)]).optional(),
  flat_sar: z.union([z.literal(""), z.coerce.number().min(0)]).optional(),
  flat_usd: z.union([z.literal(""), z.coerce.number().min(0)]).optional(),
  active: z.literal("on").optional(),
});

export async function updateRuleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const { supabase } = await adminSession();
  const parsed = ruleSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: getDictionary(locale).errors.validation };
  const n = (v: number | "" | undefined) => (v === "" || v === undefined ? null : v);
  const { error } = await supabase
    .from("pricing_rules")
    .update({ multiplier: n(parsed.data.multiplier), flat_sar: n(parsed.data.flat_sar), flat_usd: n(parsed.data.flat_usd), active: parsed.data.active === "on" })
    .eq("id", parsed.data.id);
  revalidatePath(`/${locale}/admin/pricing`);
  return fail(error);
}

const configSchema = z.object({
  key: z.enum(["require_admin_mfa", "revision_window_days", "quote_validity_days", "express_enabled", "ai_assist_enabled"]),
  value: z.string().max(100),
});

export async function updateConfigAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const { supabase } = await adminSession();
  const parsed = configSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: getDictionary(locale).errors.validation };
  let value: unknown;
  try {
    value = JSON.parse(parsed.data.value);
  } catch {
    return { error: getDictionary(locale).errors.validation };
  }
  const { error } = await supabase.from("app_config").update({ value, updated_at: new Date().toISOString() }).eq("key", parsed.data.key);
  revalidatePath(`/${locale}/admin/pricing`);
  return fail(error);
}

const postSchema = z.object({
  id: uuid.optional().or(z.literal("")),
  slug: z.string().regex(/^[a-z0-9-]{2,80}$/),
  title_en: z.string().trim().min(2).max(200),
  title_ar: z.string().trim().min(2).max(200),
  excerpt_en: z.string().trim().max(500).default(""),
  excerpt_ar: z.string().trim().max(500).default(""),
  body_en: z.string().max(100_000).default(""),
  body_ar: z.string().max(100_000).default(""),
  publish: z.literal("on").optional(),
});

export async function savePostAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const { viewer, supabase } = await adminSession();
  const parsed = postSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: getDictionary(locale).errors.validation };
  const { id, publish, ...fields } = parsed.data;
  const row = { ...fields, published_at: publish === "on" ? new Date().toISOString() : null, author_id: viewer.user.id };
  const { error } = id ? await supabase.from("posts").update(row).eq("id", id) : await supabase.from("posts").insert(row);
  revalidatePath(`/${locale}/admin/content`);
  revalidatePath(`/${locale}/blog`);
  return error ? fail(error) : { ok: true, message: getDictionary(locale).admin.publish };
}

export async function updateConversationAction(form: FormData) {
  const locale = localeOf(form);
  const { supabase } = await adminSession();
  const id = uuid.parse(form.get("conversation_id"));
  const status = z.enum(["open", "pending", "closed"]).optional().parse(form.get("status") || undefined);
  const priority = z.enum(["low", "normal", "high", "urgent"]).optional().parse(form.get("priority") || undefined);
  await supabase
    .from("conversations")
    .update({ ...(status ? { status } : {}), ...(priority ? { priority } : {}) })
    .eq("id", id);
  revalidatePath(`/${locale}/admin/inbox`);
}

export async function updateTicketAction(form: FormData) {
  const locale = localeOf(form);
  const { supabase } = await adminSession();
  const id = uuid.parse(form.get("ticket_id"));
  const status = z.enum(["open", "pending", "closed"]).parse(form.get("status"));
  await supabase.from("support_tickets").update({ status }).eq("id", id);
  revalidatePath(`/${locale}/admin/inbox`);
}
