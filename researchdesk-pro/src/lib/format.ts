import type { Locale } from "@/lib/i18n";

const tag = (locale: Locale) => (locale === "ar" ? "ar-SA-u-nu-latn" : "en-GB");

export function formatMoney(amount: number | string | null | undefined, currency: string, locale: Locale): string {
  const value = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  return new Intl.NumberFormat(tag(locale), { style: "currency", currency, minimumFractionDigits: 2 }).format(value);
}

export function formatDateTime(value: string | Date | null | undefined, locale: Locale, timeZone = "Asia/Riyadh"): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(tag(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
    calendar: "gregory",
  }).format(new Date(value));
}

export function formatDate(value: string | Date | null | undefined, locale: Locale, timeZone = "Asia/Riyadh"): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone, calendar: "gregory" }).format(new Date(value));
}

export function formatPercent(value: number | null | undefined, locale: Locale): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(tag(locale), { style: "percent", maximumFractionDigits: 1 }).format(value);
}
