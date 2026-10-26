import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getServices } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import { localized } from "@/lib/i18n";
import { resolveLocale, type LocaleParams } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function ServicesPage({ params }: { params: LocaleParams }) {
  const { locale, dict } = await resolveLocale(params);
  const services = await getServices();
  return (
    <div className="container py-12">
      <h1 className="text-3xl font-semibold">{dict.services.title}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">{dict.services.intro}</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <Card key={s.id} className="flex flex-col">
            <CardHeader>
              <CardTitle>{localized(s, "name", locale)}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <p className="text-sm text-muted-foreground">{localized(s, "description", locale)}</p>
              <p className="mt-auto text-sm">
                <span className="text-muted-foreground">{dict.services.from} </span>
                <strong>{formatMoney(s.base_price_sar, "SAR", locale)}</strong> / {formatMoney(s.base_price_usd, "USD", locale)}{" "}
                <span className="text-muted-foreground">{dict.units[s.unit]}</span>
                <br />
                <span className="text-xs text-muted-foreground">
                  {dict.services.minimum}: {formatMoney(s.min_price_sar, "SAR", locale)} · {dict.workspace.revisionIncluded}: {s.revisions_included}
                </span>
              </p>
              <Link href={`/${locale}/portal/orders/new?service=${s.slug}`} className={buttonClass("outline", "sm")}>
                {dict.services.order}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
