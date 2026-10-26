import { safeEqual } from "@/lib/payments/hmac";
import { SignatureError, type GatewayStatus, type PaymentAdapter } from "@/lib/payments/types";

const API = "https://api.moyasar.com/v1";

interface MoyasarPayment {
  id: string;
  status: string;
  amount: number;
  fee?: number;
  currency: string;
  invoice_id?: string | null;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, string> | null;
  source?: { type?: string; company?: string; message?: string | null } | null;
}

interface MoyasarWebhook {
  id: string;
  type: string;
  created_at: string;
  secret_token?: string;
  data: MoyasarPayment;
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${process.env.MOYASAR_SECRET_KEY ?? ""}:`).toString("base64");
}

// Moyasar amounts are integers in the smallest unit (halalas, cents).
const toMinor = (amount: number) => Math.round(amount * 100);
const toMajor = (minor: number) => minor / 100;

function mapStatus(status: string): GatewayStatus | null {
  switch (status) {
    case "paid":
    case "captured":
      return "paid";
    case "authorized":
      return "authorized";
    case "initiated":
      return "pending";
    case "failed":
      return "failed";
    case "voided":
      return "cancelled";
    default:
      return null;
  }
}

function methodOf(source: MoyasarPayment["source"]): string | null {
  if (!source?.type) return null;
  if (source.type === "creditcard") return source.company === "mada" ? "mada" : `card:${source.company ?? "unknown"}`;
  return source.type;
}

// UNVERIFIED: written against Moyasar's public API documentation and not yet
// run against a Moyasar test account. Keep `verified` false until the
// sandbox checklist in docs/04-payments.md passes.
export const moyasarAdapter: PaymentAdapter = {
  id: "moyasar",
  methods: ["card", "mada", "apple_pay", "stc_pay"],
  currencies: ["SAR", "USD"],
  verified: false,
  isConfigured() {
    return Boolean(process.env.MOYASAR_SECRET_KEY && process.env.MOYASAR_WEBHOOK_SECRET);
  },
  async createCheckout(request) {
    const res = await fetch(`${API}/invoices`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: toMinor(request.amount),
        currency: request.currency,
        description: request.description,
        success_url: request.successUrl,
        back_url: request.cancelUrl,
        metadata: { payment_id: request.paymentId },
      }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`moyasar invoice creation failed with HTTP ${res.status}`);
    const invoice = (await res.json()) as { id: string; url: string };
    return { providerPaymentId: invoice.id, redirectUrl: invoice.url };
  },
  async parseWebhook(rawBody) {
    const body = JSON.parse(rawBody) as MoyasarWebhook;
    if (!body.secret_token || !safeEqual(body.secret_token, process.env.MOYASAR_WEBHOOK_SECRET ?? "")) {
      throw new SignatureError();
    }
    // The webhook proves origin; the payment's state is still re-read from
    // the API so a replayed or reordered body cannot assert a status.
    const res = await fetch(`${API}/payments/${encodeURIComponent(body.data.id)}`, {
      headers: { Authorization: authHeader() },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`moyasar payment fetch failed with HTTP ${res.status}`);
    const payment = (await res.json()) as MoyasarPayment;
    const status = mapStatus(payment.status);
    const paymentId = payment.metadata?.payment_id ?? body.data.metadata?.payment_id;
    if (!status || !paymentId) return null;
    return {
      eventId: body.id,
      eventType: body.type,
      paymentId,
      providerPaymentId: payment.invoice_id ?? null,
      providerChargeId: payment.id,
      status,
      amount: toMajor(payment.amount),
      currency: payment.currency,
      occurredAt: new Date(payment.updated_at ?? body.created_at),
      method: methodOf(payment.source),
      fee: payment.fee !== undefined ? toMajor(payment.fee) : null,
      settlementAmount: null,
      settlementCurrency: null,
      failureReason: status === "failed" ? (payment.source?.message ?? null) : null,
      payload: body,
    };
  },
  async refund(payment) {
    if (!payment.providerChargeId) return { ok: false, error: "missing provider charge id" };
    const res = await fetch(`${API}/payments/${encodeURIComponent(payment.providerChargeId)}/refund`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ amount: toMinor(payment.amount) }),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const body = (await res.json()) as { id: string };
    return { ok: true, providerRefundId: body.id };
  },
};
