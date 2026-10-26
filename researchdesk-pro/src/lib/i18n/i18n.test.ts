import { describe, expect, it } from "vitest";
import { ar } from "@/lib/i18n/ar";
import { en } from "@/lib/i18n/en";
import { fill, pickLocale } from "@/lib/i18n";
import { policies } from "@/lib/i18n/legal";

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]));
  return typeof value;
}

describe("dictionaries", () => {
  it("Arabic has exactly the English keys and list lengths", () => {
    expect(shape(ar)).toEqual(shape(en));
  });

  it("every policy has the same number of sections in both languages", () => {
    for (const text of Object.values(policies)) expect(text.ar.length).toBe(text.en.length);
  });
});

describe("pickLocale", () => {
  it.each([
    [null, "en"],
    ["ar-SA,ar;q=0.9,en;q=0.8", "ar"],
    ["en-US,en;q=0.9,ar;q=0.8", "en"],
    ["fr-FR,ar;q=0.5", "ar"],
    ["de-DE", "en"],
  ])("%s → %s", (header, expected) => {
    expect(pickLocale(header)).toBe(expected);
  });
});

describe("fill", () => {
  it("replaces known placeholders and leaves unknown ones visible", () => {
    expect(fill("{ref}: {to} {missing}", { ref: "RD-1", to: "Paid" })).toBe("RD-1: Paid {missing}");
  });
});
