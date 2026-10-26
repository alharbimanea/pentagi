export type Currency = "SAR" | "USD";

export interface PricedService {
  id: string;
  unit: "word" | "page" | "hour" | "slide" | "fixed";
  base_price_sar: number;
  base_price_usd: number;
  min_price_sar: number;
  min_price_usd: number;
  default_turnaround_hours: number;
}

export interface PricingRule {
  service_id: string | null;
  kind: "level" | "complexity" | "deadline" | "addon";
  code: string;
  multiplier: number | null;
  flat_sar: number | null;
  flat_usd: number | null;
  min_hours: number | null;
  max_hours: number | null;
  active: boolean;
}

export interface Discount {
  code: string;
  kind: "percent" | "fixed";
  percent: number | null;
  amount_sar: number | null;
  amount_usd: number | null;
  valid_from: string | null;
  valid_until: string | null;
  max_redemptions: number | null;
  redemptions: number;
  active: boolean;
}

export interface EstimateInput {
  currency: Currency;
  quantity: number;
  level?: string | null;
  complexity?: string | null;
  deadline: Date;
  addons?: string[];
  expressEnabled?: boolean;
}

export type EstimateLine =
  | { type: "base"; quantity: number; unitPrice: number; amount: number }
  | { type: "minimum"; amount: number }
  | { type: "multiplier"; kind: "level" | "complexity" | "deadline"; code: string; multiplier: number; amount: number }
  | { type: "addon"; code: string; amount: number }
  | { type: "discount"; code: string; amount: number };

export type EstimateResult =
  | {
      ok: true;
      currency: Currency;
      lines: EstimateLine[];
      subtotal: number;
      discount: number;
      total: number;
      hoursUntilDeadline: number;
      express: boolean;
      discountRejected?: DiscountProblem;
    }
  | { ok: false; error: "deadline_past" | "deadline_too_soon" | "express_unavailable" | "invalid_quantity" };

export type DiscountProblem = "inactive" | "not_started" | "expired" | "exhausted" | "no_amount";

// Below this no service can be staffed, regardless of the deadline rules.
export const MIN_FEASIBLE_HOURS = 12;

const toCents = (v: number) => Math.round(v * 100);
const fromCents = (c: number) => c / 100;

function pickRule(rules: PricingRule[], serviceId: string, kind: PricingRule["kind"], code: string) {
  const candidates = rules.filter((r) => r.active && r.kind === kind && r.code === code);
  return candidates.find((r) => r.service_id === serviceId) ?? candidates.find((r) => r.service_id === null);
}

function pickDeadlineRule(rules: PricingRule[], serviceId: string, hours: number) {
  const matches = (r: PricingRule) =>
    r.active && r.kind === "deadline" && (r.min_hours ?? 0) <= hours && (r.max_hours === null || hours < r.max_hours);
  return rules.find((r) => matches(r) && r.service_id === serviceId) ?? rules.find((r) => matches(r) && r.service_id === null);
}

export function discountProblem(discount: Discount, currency: Currency, now: Date): DiscountProblem | null {
  if (!discount.active) return "inactive";
  if (discount.valid_from && new Date(discount.valid_from) > now) return "not_started";
  if (discount.valid_until && new Date(discount.valid_until) <= now) return "expired";
  if (discount.max_redemptions !== null && discount.redemptions >= discount.max_redemptions) return "exhausted";
  if (discount.kind === "fixed" && (currency === "SAR" ? discount.amount_sar : discount.amount_usd) === null) return "no_amount";
  return null;
}

export function estimate(
  service: PricedService,
  rules: PricingRule[],
  input: EstimateInput,
  discount: Discount | null,
  now: Date,
): EstimateResult {
  const hours = (input.deadline.getTime() - now.getTime()) / 3_600_000;
  if (hours <= 0) return { ok: false, error: "deadline_past" };
  if (hours < MIN_FEASIBLE_HOURS) return { ok: false, error: "deadline_too_soon" };
  const express = hours < service.default_turnaround_hours;
  if (express && input.expressEnabled === false) return { ok: false, error: "express_unavailable" };

  const quantity = service.unit === "fixed" ? 1 : input.quantity;
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: "invalid_quantity" };

  const sar = input.currency === "SAR";
  const unitPrice = sar ? service.base_price_sar : service.base_price_usd;
  const lines: EstimateLine[] = [];

  let cents = toCents(unitPrice * quantity);
  lines.push({ type: "base", quantity, unitPrice, amount: fromCents(cents) });

  const minimum = toCents(sar ? service.min_price_sar : service.min_price_usd);
  if (cents < minimum) {
    lines.push({ type: "minimum", amount: fromCents(minimum - cents) });
    cents = minimum;
  }

  const multiplied: Array<[PricingRule | undefined, "level" | "complexity" | "deadline"]> = [
    [input.level ? pickRule(rules, service.id, "level", input.level) : undefined, "level"],
    [input.complexity ? pickRule(rules, service.id, "complexity", input.complexity) : undefined, "complexity"],
    [pickDeadlineRule(rules, service.id, hours), "deadline"],
  ];
  for (const [rule, kind] of multiplied) {
    if (!rule?.multiplier || rule.multiplier === 1) continue;
    const next = Math.round(cents * rule.multiplier);
    lines.push({ type: "multiplier", kind, code: rule.code, multiplier: rule.multiplier, amount: fromCents(next - cents) });
    cents = next;
  }

  for (const code of new Set(input.addons ?? [])) {
    const rule = pickRule(rules, service.id, "addon", code);
    const flat = rule ? (sar ? rule.flat_sar : rule.flat_usd) : null;
    if (flat === null || flat === undefined) continue;
    const add = toCents(flat);
    lines.push({ type: "addon", code, amount: fromCents(add) });
    cents += add;
  }

  const subtotal = cents;
  let discountCents = 0;
  let discountRejected: DiscountProblem | undefined;
  if (discount) {
    const problem = discountProblem(discount, input.currency, now);
    if (problem) {
      discountRejected = problem;
    } else {
      discountCents =
        discount.kind === "percent"
          ? Math.round((subtotal * (discount.percent ?? 0)) / 100)
          : toCents((sar ? discount.amount_sar : discount.amount_usd) ?? 0);
      discountCents = Math.min(discountCents, subtotal);
      lines.push({ type: "discount", code: discount.code, amount: -fromCents(discountCents) });
    }
  }

  return {
    ok: true,
    currency: input.currency,
    lines,
    subtotal: fromCents(subtotal),
    discount: fromCents(discountCents),
    total: fromCents(subtotal - discountCents),
    hoursUntilDeadline: Math.floor(hours),
    express,
    ...(discountRejected ? { discountRejected } : {}),
  };
}
