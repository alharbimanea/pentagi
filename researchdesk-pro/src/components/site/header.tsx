import { LogOut } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { signOutAction } from "@/actions/auth";
import { LocaleSwitcher } from "@/components/site/locale-switcher";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { buttonClass } from "@/components/ui/button";
import { getViewer } from "@/lib/auth";
import type { Dictionary, Locale } from "@/lib/i18n";

export async function SiteHeader({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const viewer = await getViewer();
  const nav = [
    ["services", dict.nav.services],
    ["pricing", dict.nav.pricing],
    ["faq", dict.nav.faq],
    ["blog", dict.nav.blog],
    ["about", dict.nav.about],
    ["contact", dict.nav.contact],
  ] as const;

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-foreground">
        {dict.nav.skip}
      </a>
      <div className="container flex h-16 items-center gap-4">
        <Link href={`/${locale}`} className="flex shrink-0 items-center gap-2 font-semibold text-primary" aria-label={dict.brand.name}>
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground" aria-hidden>
            RD
          </span>
          <span className="hidden sm:inline">{dict.brand.name}</span>
        </Link>
        <nav aria-label="Primary" className="hidden flex-1 items-center gap-1 lg:flex">
          {nav.map(([href, label]) => (
            <Link key={href} href={`/${locale}/${href}`} className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
              {label}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex min-w-0 items-center gap-1">
          <Suspense>
            <LocaleSwitcher locale={locale} label={dict.language.switchTo} />
          </Suspense>
          <ThemeToggle labels={dict.theme} />
          {viewer ? (
            <>
              {viewer.isAdminRole ? (
                <Link href={`/${locale}/admin`} className={buttonClass("ghost", "sm", "hidden sm:inline-flex")}>
                  {dict.nav.admin}
                </Link>
              ) : null}
              <Link href={`/${locale}/portal`} className={buttonClass("outline", "sm")}>
                {dict.nav.portal}
              </Link>
              <form action={signOutAction}>
                <input type="hidden" name="locale" value={locale} />
                <button type="submit" className={buttonClass("ghost", "sm")} aria-label={dict.nav.logout} title={dict.nav.logout}>
                  <LogOut className="h-4 w-4 sm:hidden rtl:-scale-x-100" aria-hidden />
                  <span className="hidden sm:inline">{dict.nav.logout}</span>
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href={`/${locale}/login`} className={buttonClass("ghost", "sm")}>
                {dict.nav.login}
              </Link>
              <Link href={`/${locale}/register`} className={buttonClass("accent", "sm", "hidden sm:inline-flex")}>
                {dict.nav.register}
              </Link>
            </>
          )}
        </div>
      </div>
      <nav aria-label={dict.nav.menu} className="container flex gap-1 overflow-x-auto pb-2 lg:hidden">
        {viewer?.isAdminRole ? (
          <Link href={`/${locale}/admin`} className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-accent hover:bg-muted sm:hidden">
            {dict.nav.admin}
          </Link>
        ) : null}
        {nav.map(([href, label]) => (
          <Link key={href} href={`/${locale}/${href}`} className="shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
