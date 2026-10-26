import { randomUUID } from "node:crypto";
import { publicEnv } from "@/lib/env";
import { hmacSha256Hex, verifyHmacSha256 } from "@/lib/payments/hmac";
import { isProductionStage } from "@/lib/stage";
import { SignatureError, type GatewayEvent, type GatewayStatus, type PaymentAdapter } from "@/lib/payments/types";

export const SANDBOX_SIGNATURE_HEADER = "x-sandbox-signature";

export interface SandboxEventBody {
  id: string;
  type: string;
  created_at: string;
  payment_id: string;
  provider_payment_id: string;
  status: GatewayStatus;
  amount: number;
  currency: string;
  method: string;
}

function secret(): string {
  return process.env.SANDBOX_WEBHOOK_SECRET ?? "";
}

// A fake gateway for development and acceptance tests. Its events are signed
// with SANDBOX_WEBHOOK_SECRET and travel through the same verification and
// ledger path as a real provider's. Refused outright when APP_STAGE is production.
export const sandboxAdapter: PaymentAdapter = {
  id: "sandbox",
  methods: ["card", "mada", "apple_pay"],
  currencies: ["SAR", "USD"],
  verified: true,
  isConfigured() {
    return (
      !isProductionStage() &&
      process.env.PAYMENTS_SANDBOX_ENABLED === "true" &&
      secret().length >= 24
    );
  },
  async createCheckout(request) {
    const providerPaymentId = `sbx_${randomUUID()}`;
    const url = new URL(`/${request.locale}/portal/pay/sandbox/${request.paymentId}`, publicEnv.siteUrl);
    url.searchParams.set("ref", providerPaymentId);
    return { providerPaymentId, redirectUrl: url.toString() };
  },
  async parseWebhook(rawBody, headers) {
    if (!verifyHmacSha256(secret(), rawBody, headers.get(SANDBOX_SIGNATURE_HEADER))) throw new SignatureError();
    const body = JSON.parse(rawBody) as SandboxEventBody;
    const event: GatewayEvent = {
      eventId: body.id,
      eventType: body.type,
      paymentId: body.payment_id,
      providerPaymentId: body.provider_payment_id,
      providerChargeId: body.provider_payment_id,
      status: body.status,
      amount: body.amount,
      currency: body.currency,
      occurredAt: new Date(body.created_at),
      method: body.method,
      fee: null,
      settlementAmount: body.status === "paid" ? body.amount : null,
      settlementCurrency: body.status === "paid" ? body.currency : null,
      failureReason: body.status === "failed" ? "sandbox decline" : null,
      payload: body,
    };
    return event;
  },
  async refund(payment) {
    return { ok: true, providerRefundId: `sbx_re_${payment.providerChargeId ?? randomUUID()}` };
  },
};

export function signSandboxEvent(body: SandboxEventBody): { raw: string; signature: string } {
  const raw = JSON.stringify(body);
  return { raw, signature: hmacSha256Hex(secret(), raw) };
}
