import { z } from "zod";
import { isValidTimeZone } from "@/lib/time";

export const INTENDED_USES = ["personal_learning", "research_support", "professional", "publication_prep", "business", "other"] as const;
export const CITATION_STYLES = ["none", "apa7", "mla9", "chicago", "harvard", "ieee", "vancouver", "other"] as const;
export const LANGUAGES = ["en", "ar", "en_ar", "other"] as const;
export const CURRENCIES = ["SAR", "USD"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const optionalInt = (max: number) =>
  z
    .union([z.literal(""), z.coerce.number().int().min(0).max(max)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));

export const orderDraftSchema = z.object({
  service_id: z.string().uuid(),
  title: z.string().trim().max(300).default(""),
  discipline: optionalText(120),
  intended_use: z.enum(INTENDED_USES).optional().nullable(),
  scope: optionalText(4000),
  level: optionalText(40),
  complexity: optionalText(40),
  word_count: optionalInt(200_000),
  page_count: optionalInt(1000),
  citation_style: z.enum(CITATION_STYLES).optional().nullable(),
  references_notes: optionalText(4000),
  methodology: optionalText(4000),
  language: z.enum(LANGUAGES).default("en"),
  deadline_local: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .optional()
    .or(z.literal("")),
  timezone: z.string().refine(isValidTimeZone, "invalid_timezone").default("Asia/Riyadh"),
  instructions: optionalText(20_000),
  addons: z.array(z.string().regex(/^[a-z0-9_]{2,40}$/)).max(10).default([]),
  promo_code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{3,32}$/)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v.toUpperCase() : null)),
  currency: z.enum(CURRENCIES).default("SAR"),
});

export type OrderDraftInput = z.input<typeof orderDraftSchema>;
export type OrderDraft = z.output<typeof orderDraftSchema>;

export const submitConsentSchema = z.object({
  accept_terms: z.literal(true),
  accept_acceptable_use: z.literal(true),
});

export type MissingField = "title" | "deadline" | "quantity" | "intended_use" | "instructions";

// Fields the owner needs before quoting. Used both to block submission and
// as a deterministic, AI-free missing-requirements check in the admin view.
export function missingForSubmission(
  order: {
    title: string | null;
    deadline: string | null;
    intended_use: string | null;
    instructions: string | null;
    word_count: number | null;
    page_count: number | null;
  },
  unit: string,
): MissingField[] {
  const missing: MissingField[] = [];
  if (!order.title || order.title.trim().length < 3) missing.push("title");
  if (!order.deadline) missing.push("deadline");
  if (!order.intended_use) missing.push("intended_use");
  if (!order.instructions || order.instructions.trim().length < 20) missing.push("instructions");
  if (unit !== "fixed" && !quantityFor(unit, order)) missing.push("quantity");
  return missing;
}

// Word-priced services count words; page, slide and hour services keep
// their quantity in page_count.
export function quantityFor(unit: string, order: { word_count: number | null; page_count: number | null }) {
  if (unit === "fixed") return 1;
  return (unit === "word" ? order.word_count : order.page_count) ?? 0;
}
