"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/actions/types";
import { getViewer } from "@/lib/auth";
import { configValue } from "@/lib/config";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { POLICY_VERSION } from "@/lib/i18n/legal";
import { missingForSubmission, orderDraftSchema, quantityFor, type OrderDraft } from "@/lib/orders/schema";
import { estimate, type Discount, type EstimateResult, type PricedService, type PricingRule } from "@/lib/pricing/engine";
import { rateLimit } from "@/lib/security/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";
import { wallTimeToUtc } from "@/lib/time";

const uuid = z.string().uuid();

function localeOf(form: FormData): Locale {
  const v = String(form.get("locale") ?? "");
  return isLocale(v) ? v : "en";
}

function draftFromForm(form: FormData) {
  return orderDraftSchema.safeParse({
    ...Object.fromEntries([...form.entries()].filter(([k]) => k !== "addons")),
    addons: form.getAll("addons").map(String),
  });
}

async function loadPricing(serviceId: string) {
  const db = adminClient();
  const [{ data: service }, { data: rules }] = await Promise.all([
    db.from("services").select("*").eq("id", serviceId).eq("active", true).maybeSingle(),
    db.from("pricing_rules").select("*").eq("active", true).or(`service_id.is.null,service_id.eq.${serviceId}`),
  ]);
  if (!service) return null;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const priced: PricedService & { unit: string } = {
    id: service.id,
    unit: service.unit,
    base_price_sar: Number(service.base_price_sar),
    base_price_usd: Number(service.base_price_usd),
    min_price_sar: Number(service.min_price_sar),
    min_price_usd: Number(service.min_price_usd),
    default_turnaround_hours: service.default_turnaround_hours,
  };
  const parsedRules: PricingRule[] = (rules ?? []).map((r) => ({
    ...r,
    multiplier: num(r.multiplier),
    flat_sar: num(r.flat_sar),
    flat_usd: num(r.flat_usd),
  }));
  return { service: priced, rules: parsedRules };
}

async function computeEstimate(draft: OrderDraft, deadline: Date | null): Promise<EstimateResult | null> {
  if (!deadline) return null;
  const pricing = await loadPricing(draft.service_id);
  if (!pricing) return null;
  let discount: Discount | null = null;
  if (draft.promo_code) {
    const { data } = await adminClient().from("discounts").select("*").eq("code", draft.promo_code).maybeSingle();
    discount = data
      ? { ...data, percent: data.percent === null ? null : Number(data.percent), amount_sar: data.amount_sar === null ? null : Number(data.amount_sar), amount_usd: data.amount_usd === null ? null : Number(data.amount_usd) }
      : { code: draft.promo_code, kind: "percent", percent: 0, amount_sar: null, amount_usd: null, valid_from: null, valid_until: null, max_redemptions: null, redemptions: 0, active: false };
  }
  return estimate(
    pricing.service,
    pricing.rules,
    {
      currency: draft.currency,
      quantity: quantityFor(pricing.service.unit, draft),
      level: draft.level,
      complexity: draft.complexity,
      deadline,
      addons: draft.addons,
      expressEnabled: await configValue("express_enabled", true),
    },
    discount,
    new Date(),
  );
}

export async function previewEstimateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewer) return {};
  const parsed = draftFromForm(form);
  if (!parsed.success) return {};
  if (!(await rateLimit("orderWrite", viewer.user.id))) return { error: getDictionary(localeOf(form)).errors.rateLimited };
  const deadline = parsed.data.deadline_local ? wallTimeToUtc(parsed.data.deadline_local, parsed.data.timezone) : null;
  const result = await computeEstimate(parsed.data, deadline);
  return { ok: true, data: { estimate: result } };
}

type Persisted = { ok: true; orderId: string; estimate: EstimateResult | null } | { ok: false; state: ActionState };

async function persistDraft(form: FormData, locale: Locale): Promise<Persisted> {
  const dict = getDictionary(locale);
  const viewer = await getViewer();
  if (!viewer) return { ok: false, state: { error: dict.errors.unauthorized } };
  if (!(await rateLimit("orderWrite", viewer.user.id))) return { ok: false, state: { error: dict.errors.rateLimited } };

  const parsed = draftFromForm(form);
  if (!parsed.success) {
    return {
      ok: false,
      state: { error: dict.errors.validation, fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), dict.errors.validation])) },
    };
  }
  const draft = parsed.data;
  const deadline = draft.deadline_local ? wallTimeToUtc(draft.deadline_local, draft.timezone) : null;
  const row = { ...draft, deadline_local: undefined, deadline: deadline?.toISOString() ?? null };
  delete row.deadline_local;

  const supabase = await serverClient();
  const existing = uuid.safeParse(form.get("order_id"));
  let orderId: string;
  if (existing.success) {
    const { data, error } = await supabase.from("orders").update(row).eq("id", existing.data).select("id").maybeSingle();
    if (error || !data) return { ok: false, state: { error: dict.errors.generic } };
    orderId = data.id;
  } else {
    const { data, error } = await supabase.from("orders").insert({ ...row, customer_id: viewer.user.id }).select("id").single();
    if (error || !data) {
      console.error("order insert failed", error?.message);
      return { ok: false, state: { error: dict.errors.generic } };
    }
    orderId = data.id;
  }

  const result = await computeEstimate(draft, deadline);
  await adminClient()
    .from("orders")
    .update({ estimate_amount: result?.ok ? result.total : null, estimate_breakdown: result ?? null })
    .eq("id", orderId)
    .eq("customer_id", viewer.user.id);
  return { ok: true, orderId, estimate: result };
}

export async function saveDraftAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const saved = await persistDraft(form, locale);
  if (!saved.ok) return saved.state;
  revalidatePath(`/${locale}/portal`);
  return { ok: true, message: getDictionary(locale).wizard.saved, data: { orderId: saved.orderId, estimate: saved.estimate } };
}

export async function submitOrderAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const dict = getDictionary(locale);
  if (form.get("accept_terms") !== "on" || form.get("accept_acceptable_use") !== "on") {
    return { error: dict.errors.validation, fieldErrors: { consent: dict.errors.validation } };
  }
  const saved = await persistDraft(form, locale);
  if (!saved.ok) return saved.state;
  const viewer = (await getViewer())!;
  const orderId = saved.orderId;

  const supabase = await serverClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, title, deadline, intended_use, instructions, word_count, page_count, status, services(unit)")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.status !== "draft") return { error: dict.errors.generic, data: { orderId } };
  const unit = (order.services as unknown as { unit: string } | null)?.unit ?? "fixed";
  const missing = missingForSubmission(order, unit);
  if (missing.length) return { error: dict.wizard.missing, data: { missing, orderId, estimate: saved.estimate } };

  const now = new Date().toISOString();
  const { error: consentError } = await supabase
    .from("orders")
    .update({ terms_accepted_at: now, acceptable_use_confirmed_at: now })
    .eq("id", orderId);
  if (consentError) return { error: dict.errors.generic, data: { orderId } };

  await supabase.from("consent_records").insert([
    { user_id: viewer.user.id, order_id: orderId, kind: "terms", version: POLICY_VERSION, granted: true },
    { user_id: viewer.user.id, order_id: orderId, kind: "acceptable_use", version: POLICY_VERSION, granted: true },
    { user_id: viewer.user.id, order_id: orderId, kind: "ai_processing", version: POLICY_VERSION, granted: form.get("consent_ai") === "on" },
  ]);

  const { error } = await supabase.rpc("transition_order_status", { p_order: orderId, p_to: "submitted", p_note: null });
  if (error) return { error: error.message, data: { orderId } };
  redirect(`/${locale}/portal/orders/${orderId}?submitted=1`);
}

export async function deleteDraftAction(form: FormData) {
  const locale = localeOf(form);
  const orderId = uuid.safeParse(form.get("order_id"));
  if (orderId.success) {
    const supabase = await serverClient();
    await supabase.from("orders").delete().eq("id", orderId.data).eq("status", "draft");
  }
  redirect(`/${locale}/portal`);
}

export async function customerTransitionAction(form: FormData) {
  const locale = localeOf(form);
  const orderId = uuid.parse(form.get("order_id"));
  const to = z.enum(["cancelled", "completed", "submitted"]).parse(form.get("to"));
  const supabase = await serverClient();
  const { error } = await supabase.rpc("transition_order_status", { p_order: orderId, p_to: to, p_note: null });
  if (error) console.error("customer transition failed", error.message);
  revalidatePath(`/${locale}/portal/orders/${orderId}`);
}

export async function quoteDecisionAction(form: FormData) {
  const locale = localeOf(form);
  const quoteId = uuid.parse(form.get("quote_id"));
  const orderId = uuid.parse(form.get("order_id"));
  const accept = form.get("decision") === "accept";
  const supabase = await serverClient();
  const { error } = await supabase.rpc(accept ? "accept_quote" : "decline_quote", { p_quote: quoteId });
  if (error) console.error("quote decision failed", error.message);
  revalidatePath(`/${locale}/portal/orders/${orderId}`);
  redirect(`/${locale}/portal/orders/${orderId}?tab=billing`);
}

const revisionSchema = z.object({
  order_id: uuid,
  description: z.string().trim().min(10).max(4000),
  requested_changes: z.string().trim().min(1).max(10_000),
  proposed_deadline: z.string().optional(),
  timezone: z.string().default("Asia/Riyadh"),
});

export async function requestRevisionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const dict = getDictionary(locale);
  const parsed = revisionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: dict.errors.validation };
  const deadline = parsed.data.proposed_deadline ? wallTimeToUtc(parsed.data.proposed_deadline, parsed.data.timezone) : null;
  const supabase = await serverClient();
  const { error } = await supabase.rpc("request_revision", {
    p_order: parsed.data.order_id,
    p_description: parsed.data.description,
    p_changes: parsed.data.requested_changes,
    p_proposed_deadline: deadline?.toISOString() ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/${locale}/portal/orders/${parsed.data.order_id}`);
  return { ok: true, message: dict.workspace.revisionSubmitted };
}

export async function answerRequirementAction(form: FormData) {
  const locale = localeOf(form);
  const id = uuid.parse(form.get("requirement_id"));
  const orderId = uuid.parse(form.get("order_id"));
  const answer = z.string().trim().min(1).max(10_000).parse(form.get("answer"));
  const supabase = await serverClient();
  await supabase.from("order_requirements").update({ answer }).eq("id", id);
  const { data: open } = await supabase.from("order_requirements").select("id").eq("order_id", orderId).eq("status", "open");
  const { data: order } = await supabase.from("orders").select("status").eq("id", orderId).maybeSingle();
  if (order?.status === "needs_clarification" && (open ?? []).length === 0) {
    await supabase.rpc("transition_order_status", { p_order: orderId, p_to: "submitted", p_note: "clarifications answered" });
  }
  revalidatePath(`/${locale}/portal/orders/${orderId}`);
}
