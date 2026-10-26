import { moyasarAdapter } from "@/lib/payments/adapters/moyasar";
import { sandboxAdapter } from "@/lib/payments/adapters/sandbox";
import type { PaymentAdapter, PaymentMethod } from "@/lib/payments/types";
import { isProductionStage } from "@/lib/stage";

const adapters: PaymentAdapter[] = [sandboxAdapter, moyasarAdapter];

export function adapterById(id: string): PaymentAdapter | undefined {
  return adapters.find((a) => a.id === id);
}

// Unverified adapters stay hidden in production even when their keys are set.
export function availableAdapters(): PaymentAdapter[] {
  const production = isProductionStage();
  return adapters.filter((a) => a.isConfigured() && (a.verified || !production));
}

// Listed on the pricing page as "not yet available" so customers are never
// shown a method that cannot be completed. Bank transfer is deliberately
// absent: it is not a supported payment path.
export const PLANNED_METHODS: Array<{ method: PaymentMethod | "regional_wallets"; requires: string }> = [
  { method: "paypal", requires: "merchant and country eligibility" },
  { method: "google_pay", requires: "gateway support confirmation" },
  { method: "regional_wallets", requires: "HyperPay / Tap / PayTabs merchant onboarding" },
  { method: "btc", requires: "legal review, licensed processor, AML/KYC and accounting sign-off" },
];
