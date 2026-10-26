"use client";

import { Languages } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/i18n";

export function LocaleSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const target: Locale = locale === "ar" ? "en" : "ar";
  const rest = pathname.replace(/^\/(en|ar)(?=\/|$)/, "");
  const query = search.toString();
  return (
    <a
      href={`/${target}${rest}${query ? `?${query}` : ""}`}
      hrefLang={target}
      aria-label={label}
      lang={target}
      onClick={() => {
        document.cookie = `locale=${target}; path=/; max-age=31536000; samesite=lax`;
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-muted"
    >
      <Languages className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden" aria-hidden>
        {target === "ar" ? "ع" : "EN"}
      </span>
    </a>
  );
}
