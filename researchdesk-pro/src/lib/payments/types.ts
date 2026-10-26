import type { Currency } from "@/lib/pricing/engine";

export type PaymentMethod = "card" | "mada" | "apple_pay" | "google_pay" | "stc_pay" | "paypal" | "btc";

export type GatewayStatus = "pending" | "authorized" | "paid" | "failed" | "cancelled" | "expired";

export interface CheckoutRequest {
  paymentId: string;
  amount: number;
  currency: Currency;
  description: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  locale: "en" | "ar";
}

export interface CheckoutSession {
  providerPaymentId: string | null;
  redirectUrl: string;
}

// Amounts are in major units (SAR, not halalas) once normalized.
export interface GatewayEvent {
  eventId: string;
  eventType: string;
  paymentId: string;
  providerPaymentId: string | null;
  providerChargeId: string | null;
  status: GatewayStatus;
  amount: number;
  currency: string;
  occurredAt: Date | null;
  method: string | null;
  fee: number | null;
  settlementAmount: number | null;
  settlementCurrency: string | null;
  failureReason: string | null;
  payload: unknown;
}

export interface RefundResult {
  ok: boolean;
  providerRefundId?: string;
  error?: string;
}

export interface PaymentAdapter {
  id: string;
  methods: PaymentMethod[];
  currencies: Currency[];
  // True only after the adapter has passed the sandbox checklist in
  // docs/04-payments.md against the provider's test environment.
  verified: boolean;
  isConfigured(): boolean;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  // Throws SignatureError when the request cannot be authenticated; returns
  // null for event types that carry no payment state.
  parseWebhook(rawBody: string, headers: Headers): Promise<GatewayEvent | null>;
  refund(payment: { providerPaymentId: string | null; providerChargeId: string | null; amount: number; currency: string }): Promise<RefundResult>;
}

export class SignatureError extends Error {
  constructor(message = "invalid webhook signature") {
    super(message);
    this.name = "SignatureError";
  }
}
