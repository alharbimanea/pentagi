import { CalendarCheck, CreditCard, FileSearch, Lock, MessagesSquare, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { resolveLocale, type LocaleParams } from "@/lib/page";

const trustIcons = [Lock, ShieldCheck, MessagesSquare];
const howIcons = [FileSearch, CalendarCheck, CreditCard, MessagesSquare];

export default async function HomePage({ params }: { params: LocaleParams }) {
  const { locale, dict } = await resolveLocale(params);
  const t = dict.home;
  return (
    <>
      <section className="bg-gradient-to-b from-primary to-primary/90 text-primary-foreground dark:from-background dark:to-muted dark:text-foreground">
        <div className="container grid gap-8 py-20 md:py-28">
          <h1 className="max-w-3xl text-4xl font-bold leading-tight md:text-5xl">{t.heroTitle}</h1>
          <p className="max-w-2xl text-lg opacity-90">{t.heroBody}</p>
          <div className="flex flex-wrap gap-3">
            <Link href={`/${locale}/portal/orders/new`} className={buttonClass("accent", "lg")}>
              {t.ctaPrimary}
            </Link>
            <Link href={`/${locale}/pricing`} className={buttonClass("outline", "lg", "border-current/40 bg-transparent text-inherit hover:bg-white/10")}>
              {t.ctaSecondary}
            </Link>
          </div>
        </div>
      </section>

      <section className="container grid gap-4 py-14 md:grid-cols-3" aria-label={dict.brand.tagline}>
        {t.trust.map((item, i) => {
          const Icon = trustIcons[i] ?? ShieldCheck;
          return (
            <Card key={item.title}>
              <CardContent className="flex gap-4 pt-5">
                <Icon className="h-6 w-6 shrink-0 text-accent" aria-hidden />
                <div>
                  <h2 className="font-semibold">{item.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="bg-muted/50 py-14">
        <div className="container">
          <h2 className="text-2xl font-semibold">{t.howTitle}</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-4">
            {t.how.map((step, i) => {
              const Icon = howIcons[i] ?? FileSearch;
              return (
                <li key={step.title} className="space-y-2">
                  <span className="flex items-center gap-2 text-accent">
                    <Icon className="h-5 w-5" aria-hidden />
                    <span className="text-sm font-semibold">{i + 1}</span>
                  </span>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.body}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="container py-14">
        <div className="rounded-lg border-s-4 border-accent bg-card p-6 shadow-sm">
          <h2 className="text-xl font-semibold">{t.integrityTitle}</h2>
          <p className="mt-2 text-muted-foreground">{t.integrityBody}</p>
          <Link href={`/${locale}/legal/integrity`} className={buttonClass("link", "sm", "mt-2")}>
            {dict.legal.pages.integrity}
          </Link>
        </div>
      </section>
    </>
  );
}
