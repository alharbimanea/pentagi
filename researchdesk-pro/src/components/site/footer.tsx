import Link from "next/link";
import type { Dictionary, Locale } from "@/lib/i18n";
import { POLICY_SLUGS } from "@/lib/i18n/legal";

export function SiteFooter({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  return (
    <footer className="mt-16 border-t bg-muted/40">
      <div className="container grid gap-8 py-10 md:grid-cols-3">
        <div className="space-y-2">
          <p className="font-semibold text-primary">{dict.brand.name}</p>
          <p className="text-sm text-muted-foreground">{dict.brand.tagline}</p>
          <p className="text-xs text-muted-foreground">{dict.footer.integrity}</p>
        </div>
        <nav aria-label={dict.footer.policies}>
          <p className="mb-2 text-sm font-medium">{dict.footer.policies}</p>
          <ul className="space-y-1 text-sm">
            {POLICY_SLUGS.map((slug) => (
              <li key={slug}>
                <Link className="text-muted-foreground hover:text-foreground" href={`/${locale}/legal/${slug}`}>
                  {dict.legal.pages[slug]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-1 text-sm">
          <Link className="block text-muted-foreground hover:text-foreground" href={`/${locale}/contact`}>
            {dict.nav.contact}
          </Link>
          <Link className="block text-muted-foreground hover:text-foreground" href={`/${locale}/faq`}>
            {dict.nav.faq}
          </Link>
          <p className="pt-4 text-xs text-muted-foreground">
            © {new Date().getFullYear()} {dict.brand.name}. {dict.footer.rights}
          </p>
        </div>
      </div>
    </footer>
  );
}
