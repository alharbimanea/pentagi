import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { POLICY_SLUGS, POLICY_VERSION, policies, type PolicySlug } from "@/lib/i18n/legal";
import { formatDate } from "@/lib/format";

export function generateStaticParams() {
  return POLICY_SLUGS.map((slug) => ({ slug }));
}

export default async function PolicyPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !(POLICY_SLUGS as readonly string[]).includes(slug)) notFound();
  const dict = getDictionary(locale);
  const sections = policies[slug as PolicySlug][locale];
  return (
    <article className="container max-w-3xl py-12">
      <h1 className="text-3xl font-semibold">{dict.legal.pages[slug as PolicySlug]}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {dict.legal.updated}: {formatDate(POLICY_VERSION, locale)}
      </p>
      {sections.map((s) => (
        <section key={s.heading} className="mt-8 space-y-2">
          <h2 className="text-xl font-semibold">{s.heading}</h2>
          {s.paragraphs.map((p) => (
            <p key={p} className="text-muted-foreground">
              {p}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
