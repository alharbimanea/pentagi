"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { isLocale, type Locale } from "@/lib/i18n";
import { SANDBOX_SIGNATURE_HEADER, sandboxAdapter, signSandboxEvent } from "@/lib/payments/adapters/sandbox";
import { processPaymentWebhook } from "@/lib/payments/process";
import { availableAdapters } from "@/lib/payments/registry";
import { rateLimit } from "@/lib/security/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";

const checkoutSchema = z.object({
  invoice_id: z.string().uuid(),
  order_id: z.string().uuid(),
  kind: z.enum(["deposit", "full"]),
  provider: z.string().min(2).max(40),
  idempotency_key: z.string().uuid(),
  locale: z.string(),
});

export async function startCheckoutAction(form: FormData) {
  const parsed = checkoutSchema.parse(Object.fromEntries(form));
  const locale: Locale = isLocale(parsed.locale) ? parsed.locale : "en";
  const back = `/${locale}/portal/orders/${parsed.order_id}?tab=billing`;
  const viewer = await getViewer();
  if (!viewer) redirect(`/${locale}/login`);
  if (!(await rateLimit("checkout", viewer.user.id))) redirect(`${back}&payment=rate_limited`);

  const adapter = availableAdapters().find((a) => a.id === parsed.provider);
  if (!adapter) redirect(`${back}&payment=unavailable`);

  // Runs as the customer: create_payment_intent checks invoice ownership and
  // computes the amount itself.
  const supabase = await serverClient();
  const { data: payment, error } = await supabase.rpc("create_payment_intent", {
    p_invoice: parsed.invoice_id,
    p_kind: parsed.kind,
    p_provider: adapter.id,
    p_idempotency_key: parsed.idempotency_key,
  });
  if (error || !payment) redirect(`${back}&payment=failed`);
  if (payment.checkout_url) redirect(payment.checkout_url);

  const { data: order } = await supabase.from("orders").select("ref").eq("id", parsed.order_id).maybeSingle();
  let session;
  try {
    session = await adapter.createCheckout({
      paymentId: payment.id,
      amount: Number(payment.amount),
      currency: payment.currency,
      description: `ResearchDesk Pro ${order?.ref ?? ""} (${payment.kind})`,
      customerEmail: viewer.user.email ?? "",
      successUrl: `${publicEnv.siteUrl}${back}&payment=returned`,
      cancelUrl: `${publicEnv.siteUrl}${back}&payment=cancelled`,
      locale,
    });
  } catch (err) {
    console.error("checkout creation failed", { provider: adapter.id, err });
    await adminClient().from("payments").update({ status: "failed", failure_reason: "checkout creation failed" }).eq("id", payment.id);
    redirect(`${back}&payment=failed`);
  }
  await adminClient()
    .from("payments")
    .update({ provider_payment_id: session.providerPaymentId, checkout_url: session.redirectUrl, status: "pending" })
    .eq("id", payment.id);
  redirect(session.redirectUrl);
}

// The sandbox "gateway" page posts here. The event still goes through the
// signed-webhook path, so a sandbox success exercises the same ledger logic
// a real provider's webhook would. The return redirect itself marks nothing.
export async function sandboxOutcomeAction(form: FormData) {
  if (!sandboxAdapter.isConfigured()) redirect("/");
  const paymentId = z.string().uuid().parse(form.get("payment_id"));
  const outcome = z.enum(["paid", "failed", "underpay"]).parse(form.get("outcome"));
  const locale = isLocale(String(form.get("locale"))) ? String(form.get("locale")) : "en";
  const supabase = await serverClient();
  const { data: payment } = await supabase.from("payments").select("id, order_id, amount, currency, provider, provider_payment_id").eq("id", paymentId).maybeSingle();
  if (!payment || payment.provider !== "sandbox") redirect(`/${locale}/portal`);

  const { raw, signature } = signSandboxEvent({
    id: `sbx_evt_${randomUUID()}`,
    type: `payment.${outcome === "underpay" ? "paid" : outcome}`,
    created_at: new Date().toISOString(),
    payment_id: payment.id,
    provider_payment_id: payment.provider_payment_id ?? "",
    status: outcome === "failed" ? "failed" : "paid",
    amount: outcome === "underpay" ? Math.max(1, Number(payment.amount) - 1) : Number(payment.amount),
    currency: payment.currency,
    method: "mada",
  });
  await processPaymentWebhook("sandbox", raw, new Headers({ [SANDBOX_SIGNATURE_HEADER]: signature }));
  redirect(`/${locale}/portal/orders/${payment.order_id}?tab=billing&payment=returned`);
}
