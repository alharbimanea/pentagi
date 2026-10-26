import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { adapterById } from "@/lib/payments/registry";
import { SignatureError } from "@/lib/payments/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WebhookOutcome =
  | { status: 200; result: string }
  | { status: 401 | 404 | 422 | 500; result: string };

export async function processPaymentWebhook(providerId: string, rawBody: string, headers: Headers): Promise<WebhookOutcome> {
  const adapter = adapterById(providerId);
  if (!adapter || !adapter.isConfigured()) return { status: 404, result: "unknown_provider" };

  let event;
  try {
    event = await adapter.parseWebhook(rawBody, headers);
  } catch (err) {
    if (err instanceof SignatureError) return { status: 401, result: "bad_signature" };
    if (err instanceof SyntaxError) return { status: 422, result: "malformed" };
    console.error("payment webhook parse failed", { providerId, err });
    return { status: 500, result: "parse_failed" };
  }
  if (!event) return { status: 200, result: "ignored" };
  if (!UUID.test(event.paymentId)) return { status: 200, result: "unknown_payment" };

  const { data, error } = await adminClient().rpc("apply_payment_event", {
    p_provider: adapter.id,
    p_event_id: event.eventId,
    p_event_type: event.eventType,
    p_payment_id: event.paymentId,
    p_provider_payment_id: event.providerPaymentId,
    p_status: event.status,
    p_amount: event.amount,
    p_currency: event.currency,
    p_occurred_at: event.occurredAt?.toISOString() ?? null,
    p_payload: event.payload,
    p_method: event.method,
    p_fee: event.fee,
    p_settlement_amount: event.settlementAmount,
    p_settlement_currency: event.settlementCurrency,
    p_failure_reason: event.failureReason,
    p_provider_charge_id: event.providerChargeId,
  });
  // A 5xx makes the gateway retry; the unique event id keeps the retry harmless.
  if (error) {
    console.error("apply_payment_event failed", { providerId, eventId: event.eventId, error: error.message });
    return { status: 500, result: "apply_failed" };
  }
  return { status: 200, result: String(data) };
}
