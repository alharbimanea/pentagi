import { describe, expect, it } from "vitest";
import { checkPassword, passwordSchema } from "@/lib/password-policy";

describe("checkPassword", () => {
  it.each([
    ["Abcdef1!", null],
    ["Abcdefghijklmn1$", null],
    ["all lowercase passphrase here", null],
    ["Abcde1!", "too_short"],
    ["abcdefg1!", "needs_classes"],
    ["ABCDEFG1!", "needs_classes"],
    ["Abcdefgh!", "needs_classes"],
    ["Abcdefgh1", "needs_classes"],
    ["Abcdefg1%", "needs_classes"],
    ["a".repeat(72), null],
    ["a".repeat(73), "too_long"],
  ])("%s → %s", (password, expected) => {
    expect(checkPassword(password)).toBe(expected);
  });

  it("measures the upper limit in UTF-8 bytes", () => {
    // 36 Arabic letters are 72 bytes; 37 are 74.
    expect(checkPassword("ب".repeat(36))).toBeNull();
    expect(checkPassword("ب".repeat(37))).toBe("too_long");
  });

  it("reports the problem as the zod issue message", () => {
    const r = passwordSchema.safeParse("short");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("too_short");
  });
});
