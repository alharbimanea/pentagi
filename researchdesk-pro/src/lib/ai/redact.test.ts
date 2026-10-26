import { describe, expect, it } from "vitest";
import { redact } from "@/lib/ai/redact";

describe("redact", () => {
  it("removes contact details and identifiers", () => {
    const text = "Mail sara.k@uni.edu.sa or call +966 50 123 4567 / 0501234567, ID 1098765432, IBAN SA0380000000608010167519, card 4111 1111 1111 1111, see https://x.y/z";
    const out = redact(text);
    expect(out).not.toMatch(/sara|4567|0501234567|1098765432|SA038|4111|https/);
    expect(out).toContain("[email]");
    expect(out).toContain("[phone]");
    expect(out).toContain("[national-id]");
    expect(out).toContain("[iban]");
    expect(out).toContain("[url]");
  });

  it("keeps ordinary research text intact", () => {
    expect(redact("A mixed-methods study of 120 nurses in 2024.")).toBe("A mixed-methods study of 120 nurses in 2024.");
  });
});
