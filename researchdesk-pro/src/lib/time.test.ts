import { describe, expect, it } from "vitest";
import { utcToWallTime, wallTimeToUtc } from "@/lib/time";

describe("wallTimeToUtc", () => {
  it("converts Riyadh wall time (+03:00, no DST)", () => {
    expect(wallTimeToUtc("2026-11-01T18:30", "Asia/Riyadh")?.toISOString()).toBe("2026-11-01T15:30:00.000Z");
  });

  it("handles both sides of a DST change", () => {
    expect(wallTimeToUtc("2026-03-07T12:00", "America/New_York")?.toISOString()).toBe("2026-03-07T17:00:00.000Z");
    expect(wallTimeToUtc("2026-03-09T12:00", "America/New_York")?.toISOString()).toBe("2026-03-09T16:00:00.000Z");
  });

  it("handles offsets across the date line", () => {
    expect(wallTimeToUtc("2026-01-01T00:00", "Pacific/Kiritimati")?.toISOString()).toBe("2025-12-31T10:00:00.000Z");
  });

  it("rejects malformed input and unknown zones", () => {
    expect(wallTimeToUtc("2026-01-01 00:00", "UTC")).toBeNull();
    expect(wallTimeToUtc("2026-01-01T00:00", "Nowhere/Land")).toBeNull();
  });

  it("round-trips through utcToWallTime", () => {
    const instant = wallTimeToUtc("2026-06-15T09:45", "Europe/London")!;
    expect(utcToWallTime(instant, "Europe/London")).toBe("2026-06-15T09:45");
  });
});
