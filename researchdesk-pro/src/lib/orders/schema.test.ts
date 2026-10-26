import { describe, expect, it } from "vitest";
import { missingForSubmission, orderDraftSchema, quantityFor } from "@/lib/orders/schema";

const service = "6f1f2a8e-0b7a-4e8b-9a52-2f4d6f0b9c11";

describe("orderDraftSchema", () => {
  it("normalizes empty optional fields to null and uppercases promo codes", () => {
    const r = orderDraftSchema.parse({ service_id: service, word_count: "", discipline: "  ", promo_code: "welcome10" });
    expect(r).toMatchObject({ word_count: null, discipline: null, promo_code: "WELCOME10", currency: "SAR", timezone: "Asia/Riyadh" });
  });

  it("coerces numeric strings and rejects out-of-range counts", () => {
    expect(orderDraftSchema.parse({ service_id: service, page_count: "12" }).page_count).toBe(12);
    expect(orderDraftSchema.safeParse({ service_id: service, word_count: "200001" }).success).toBe(false);
  });

  it("rejects unknown time zones, currencies and malformed deadlines", () => {
    expect(orderDraftSchema.safeParse({ service_id: service, timezone: "Mars/Olympus" }).success).toBe(false);
    expect(orderDraftSchema.safeParse({ service_id: service, currency: "EUR" }).success).toBe(false);
    expect(orderDraftSchema.safeParse({ service_id: service, deadline_local: "2026-10-30 10:00" }).success).toBe(false);
  });

  it("rejects add-on codes that are not identifiers", () => {
    expect(orderDraftSchema.safeParse({ service_id: service, addons: ["DROP TABLE"] }).success).toBe(false);
  });
});

describe("missingForSubmission", () => {
  const complete = {
    title: "Survey analysis",
    deadline: "2026-11-01T10:00:00Z",
    intended_use: "research_support",
    instructions: "Run descriptive statistics and a regression.",
    word_count: null,
    page_count: 4,
  };

  it("passes a complete hour-based request", () => {
    expect(missingForSubmission(complete, "hour")).toEqual([]);
  });

  it("lists every missing field", () => {
    expect(
      missingForSubmission({ title: "ab", deadline: null, intended_use: null, instructions: "short", word_count: null, page_count: null }, "word"),
    ).toEqual(["title", "deadline", "intended_use", "instructions", "quantity"]);
  });

  it("reads words for word-priced services and pages otherwise", () => {
    expect(quantityFor("word", { word_count: 900, page_count: 3 })).toBe(900);
    expect(quantityFor("slide", { word_count: 900, page_count: 3 })).toBe(3);
    expect(quantityFor("fixed", { word_count: null, page_count: null })).toBe(1);
  });
});
