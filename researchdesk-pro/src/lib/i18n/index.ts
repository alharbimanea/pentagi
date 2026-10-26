import { ar } from "@/lib/i18n/ar";
import { en } from "@/lib/i18n/en";

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? Widen<U>[]
    : { [K in keyof T]: Widen<T[K]> };

export type Dictionary = Widen<typeof en>;

export function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "ar";
}

export function getDictionary(locale: Locale): Dictionary {
  return locale === "ar" ? ar : en;
}

export function dir(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

export function pickLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag = "", q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((x) => x.tag && !Number.isNaN(x.q))
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function localized(row: object, field: string, locale: Locale): string {
  const r = row as Record<string, unknown>;
  const value = r[`${field}_${locale}`] ?? r[`${field}_en`];
  return typeof value === "string" ? value : "";
}
