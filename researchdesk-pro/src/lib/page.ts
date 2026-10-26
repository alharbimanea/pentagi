import { notFound } from "next/navigation";
import { getDictionary, isLocale, type Dictionary, type Locale } from "@/lib/i18n";

export type LocaleParams = Promise<{ locale: string }>;

export async function resolveLocale(params: LocaleParams): Promise<{ locale: Locale; dict: Dictionary }> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { locale, dict: getDictionary(locale) };
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
