import { describe, expect, it } from "vitest";
import { estimate, type Discount, type PricedService, type PricingRule } from "@/lib/pricing/engine";

const now = new Date("2026-10-26T09:00:00Z");
const inHours = (h: number) => new Date(now.getTime() + h * 3_600_000);

const editing: PricedService = {
  id: "svc-edit",
  unit: "word",
  base_price_sar: 0.12,
  base_price_usd: 0.032,
  min_price_sar: 150,
  min_price_usd: 40,
  default_turnaround_hours: 72,
};

const rule = (r: Partial<PricingRule> & Pick<PricingRule, "kind" | "code">): PricingRule => ({
  service_id: null,
  multiplier: null,
  flat_sar: null,
  flat_usd: null,
  min_hours: null,
  max_hours: null,
  active: true,
  ...r,
});

const rules: PricingRule[] = [
  rule({ kind: "level", code: "masters", multiplier: 1.15 }),
  rule({ kind: "level", code: "masters", multiplier: 1.25, service_id: "svc-edit" }),
  rule({ kind: "complexity", code: "technical", multiplier: 1.2 }),
  rule({ kind: "deadline", code: "rush", multiplier: 1.8, min_hours: 0, max_hours: 24 }),
  rule({ kind: "deadline", code: "express", multiplier: 1.4, min_hours: 24, max_hours: 72 }),
  rule({ kind: "deadline", code: "standard", multiplier: 1, min_hours: 168 }),
  rule({ kind: "addon", code: "report", flat_sar: 60, flat_usd: 16 }),
  rule({ kind: "addon", code: "retired", flat_sar: 999, flat_usd: 999, active: false }),
];

const discount = (d: Partial<Discount>): Discount => ({
  code: "WELCOME",
  kind: "percent",
  percent: 10,
  amount_sar: null,
  amount_usd: null,
  valid_from: null,
  valid_until: null,
  max_redemptions: null,
  redemptions: 0,
  active: true,
  ...d,
});

describe("estimate", () => {
  it("prices words at the unit rate with no multipliers for a standard deadline", () => {
    const r = estimate(editing, rules, { currency: "SAR", quantity: 5000, deadline: inHours(200) }, null, now);
    expect(r).toMatchObject({ ok: true, subtotal: 600, discount: 0, total: 600, express: false });
  });

  it("raises a small job to the service minimum", () => {
    const r = estimate(editing, rules, { currency: "USD", quantity: 100, deadline: inHours(200) }, null, now);
    expect(r).toMatchObject({ ok: true, total: 40 });
    if (r.ok) expect(r.lines).toContainEqual({ type: "minimum", amount: 36.8 });
  });

  it("prefers a service-specific rule over the global one and compounds multipliers", () => {
    const r = estimate(
      editing,
      rules,
      { currency: "SAR", quantity: 5000, level: "masters", complexity: "technical", deadline: inHours(48) },
      null,
      now,
    );
    // 600 × 1.25 = 750; × 1.2 = 900; × 1.4 = 1260
    expect(r).toMatchObject({ ok: true, subtotal: 1260, express: true });
  });

  it("adds active add-ons once each and ignores inactive ones", () => {
    const r = estimate(
      editing,
      rules,
      { currency: "SAR", quantity: 5000, deadline: inHours(200), addons: ["report", "report", "retired", "unknown"] },
      null,
      now,
    );
    expect(r).toMatchObject({ ok: true, total: 660 });
  });

  it("applies a percentage discount after add-ons", () => {
    const r = estimate(editing, rules, { currency: "SAR", quantity: 5000, deadline: inHours(200), addons: ["report"] }, discount({}), now);
    expect(r).toMatchObject({ ok: true, subtotal: 660, discount: 66, total: 594 });
  });

  it("caps a fixed discount at the subtotal", () => {
    const r = estimate(
      editing,
      rules,
      { currency: "SAR", quantity: 100, deadline: inHours(200) },
      discount({ kind: "fixed", percent: null, amount_sar: 500, amount_usd: 130 }),
      now,
    );
    expect(r).toMatchObject({ ok: true, subtotal: 150, discount: 150, total: 0 });
  });

  it.each([
    ["inactive", { active: false }],
    ["not_started", { valid_from: "2026-11-01T00:00:00Z" }],
    ["expired", { valid_until: "2026-10-26T09:00:00Z" }],
    ["exhausted", { max_redemptions: 5, redemptions: 5 }],
  ] as const)("rejects a %s discount without failing the estimate", (problem, override) => {
    const r = estimate(editing, rules, { currency: "SAR", quantity: 5000, deadline: inHours(200) }, discount(override), now);
    expect(r).toMatchObject({ ok: true, total: 600, discountRejected: problem });
  });

  it("refuses deadlines in the past or under 12 hours", () => {
    expect(estimate(editing, rules, { currency: "SAR", quantity: 1, deadline: inHours(-1) }, null, now)).toEqual({ ok: false, error: "deadline_past" });
    expect(estimate(editing, rules, { currency: "SAR", quantity: 1, deadline: inHours(11) }, null, now)).toEqual({ ok: false, error: "deadline_too_soon" });
  });

  it("refuses express turnaround when it is switched off", () => {
    const r = estimate(editing, rules, { currency: "SAR", quantity: 5000, deadline: inHours(48), expressEnabled: false }, null, now);
    expect(r).toEqual({ ok: false, error: "express_unavailable" });
  });

  it("requires a positive quantity for metered services", () => {
    expect(estimate(editing, rules, { currency: "SAR", quantity: 0, deadline: inHours(200) }, null, now)).toEqual({ ok: false, error: "invalid_quantity" });
  });

  it("charges a fixed service once regardless of quantity", () => {
    const fixed = { ...editing, unit: "fixed" as const, base_price_sar: 900, min_price_sar: 0 };
    expect(estimate(fixed, rules, { currency: "SAR", quantity: 0, deadline: inHours(200) }, null, now)).toMatchObject({ ok: true, total: 900 });
  });

  it("keeps cent precision on fractional unit prices", () => {
    const r = estimate(editing, rules, { currency: "USD", quantity: 3333, deadline: inHours(200) }, null, now);
    expect(r).toMatchObject({ ok: true, total: 106.66 });
  });
});
