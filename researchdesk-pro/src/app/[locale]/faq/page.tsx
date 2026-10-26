import { resolveLocale, type LocaleParams } from "@/lib/page";

export default async function FaqPage({ params }: { params: LocaleParams }) {
  const { dict } = await resolveLocale(params);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: dict.faq.items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
  return (
    <div className="container max-w-3xl py-12">
      <h1 className="text-3xl font-semibold">{dict.faq.title}</h1>
      <div className="mt-8 divide-y rounded-lg border">
        {dict.faq.items.map((item) => (
          <details key={item.q} className="group p-4">
            <summary className="cursor-pointer list-none font-medium marker:hidden">
              <span className="me-2 inline-block text-accent transition-transform group-open:rotate-90 rtl:group-open:-rotate-90" aria-hidden>
                ›
              </span>
              {item.q}
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </div>
  );
}
