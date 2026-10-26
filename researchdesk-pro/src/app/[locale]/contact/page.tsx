import { ContactForm } from "@/components/site/contact-form";
import { Card, CardContent } from "@/components/ui/card";
import { resolveLocale, type LocaleParams } from "@/lib/page";

export default async function ContactPage({ params }: { params: LocaleParams }) {
  const { locale, dict } = await resolveLocale(params);
  return (
    <div className="container grid max-w-5xl gap-8 py-12 lg:grid-cols-[2fr_1fr]">
      <div>
        <h1 className="text-3xl font-semibold">{dict.contact.title}</h1>
        <p className="mt-2 text-muted-foreground">{dict.contact.intro}</p>
        <Card className="mt-6">
          <CardContent className="pt-5">
            <ContactForm locale={locale} dict={dict} />
          </CardContent>
        </Card>
      </div>
      <aside className="space-y-2 text-sm">
        <h2 className="font-semibold">{dict.contact.channels}</h2>
        <p className="text-muted-foreground">{dict.contact.channelsInactive}</p>
      </aside>
    </div>
  );
}
