import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { themeBootScript } from "@/components/site/theme-toggle";
import { publicEnv } from "@/lib/env";
import { dir, getDictionary, isLocale, LOCALES } from "@/lib/i18n";
import { resolveLocale, type LocaleParams } from "@/lib/page";
import "../globals.css";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(isLocale(locale) ? locale : "en");
  return {
    metadataBase: new URL(publicEnv.siteUrl),
    title: { default: dict.meta.title, template: `%s · ${dict.brand.name}` },
    description: dict.meta.description,
    alternates: { languages: { en: "/en", ar: "/ar" } },
    openGraph: { title: dict.meta.title, description: dict.meta.description, locale: locale === "ar" ? "ar_SA" : "en_US", type: "website" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1222" },
  ],
};

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: LocaleParams }) {
  const { locale, dict } = await resolveLocale(params);
  return (
    <html lang={locale} dir={dir(locale)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body
        className="flex min-h-screen flex-col"
        style={{ ["--font-sans" as string]: locale === "ar" ? '"Noto Kufi Arabic", "Segoe UI", Tahoma, sans-serif' : '"Inter", "Segoe UI", system-ui, sans-serif' }}
      >
        <SiteHeader locale={locale} dict={dict} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter locale={locale} dict={dict} />
      </body>
    </html>
  );
}
