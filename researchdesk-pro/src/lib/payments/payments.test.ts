import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hmacSha256Hex, verifyHmacSha256 } from "@/lib/payments/hmac";
import { SANDBOX_SIGNATURE_HEADER, sandboxAdapter, signSandboxEvent } from "@/lib/payments/adapters/sandbox";
import { SignatureError } from "@/lib/payments/types";

const SECRET = "test-secret-that-is-long-enough";

describe("verifyHmacSha256", () => {
  it("accepts the right signature with or without the sha256= prefix", () => {
    const sig = hmacSha256Hex(SECRET, '{"a":1}');
    expect(verifyHmacSha256(SECRET, '{"a":1}', sig)).toBe(true);
    expect(verifyHmacSha256(SECRET, '{"a":1}', `sha256=${sig.toUpperCase()}`)).toBe(true);
  });

  it("rejects a tampered body, a wrong secret, a missing signature and an empty secret", () => {
    const sig = hmacSha256Hex(SECRET, '{"a":1}');
    expect(verifyHmacSha256(SECRET, '{"a":2}', sig)).toBe(false);
    expect(verifyHmacSha256("another-secret-value-here", '{"a":1}', sig)).toBe(false);
    expect(verifyHmacSha256(SECRET, '{"a":1}', null)).toBe(false);
    expect(verifyHmacSha256("", '{"a":1}', hmacSha256Hex("", '{"a":1}'))).toBe(false);
  });
});

describe("sandbox adapter", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.SANDBOX_WEBHOOK_SECRET = SECRET;
    process.env.PAYMENTS_SANDBOX_ENABLED = "true";
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  const body = {
    id: "evt_1",
    type: "payment.paid",
    created_at: "2026-10-26T10:00:00.000Z",
    payment_id: "5d2b4c4e-1111-4a5b-9c8d-123456789abc",
    provider_payment_id: "sbx_1",
    status: "paid" as const,
    amount: 250,
    currency: "SAR",
    method: "mada",
  };

  it("normalizes a correctly signed event", async () => {
    const { raw, signature } = signSandboxEvent(body);
    const event = await sandboxAdapter.parseWebhook(raw, new Headers({ [SANDBOX_SIGNATURE_HEADER]: signature }));
    expect(event).toMatchObject({ eventId: "evt_1", paymentId: body.payment_id, status: "paid", amount: 250, currency: "SAR", method: "mada" });
  });

  it("throws SignatureError for a forged body", async () => {
    const { signature } = signSandboxEvent(body);
    const forged = JSON.stringify({ ...body, amount: 1 });
    await expect(sandboxAdapter.parseWebhook(forged, new Headers({ [SANDBOX_SIGNATURE_HEADER]: signature }))).rejects.toBeInstanceOf(SignatureError);
  });

  it("is never configured in production", () => {
    expect(sandboxAdapter.isConfigured()).toBe(true);
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(sandboxAdapter.isConfigured()).toBe(false);
  });
});
