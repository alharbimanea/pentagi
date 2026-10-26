import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { getRules } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import { localized } from "@/lib/i18n";
import { resolveLocale, type LocaleParams } from "@/lib/page";
import { availableAdapters, PLANNED_METHODS } from "@/lib/payments/registry";

export const dynamic = "force-dynamic";

const METHOD_LABELS: Record<string, string> = {
  card: "Visa / Mastercard / Amex",
  mada: "mada",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  stc_pay: "STC Pay",
  paypal: "PayPal",
  btc: "Bitcoin",
  regional_wallets: "Regional wallets",
};

export default async function PricingPage({ params }: { params: LocaleParams }) {
  const { locale, dict } = await resolveLocale(params);
  const rules = await getRules();
  const deadlines = rules.filter((r) => r.kind === "deadline" && r.service_id === null);
  const addons = rules.filter((r) => r.kind === "addon" && r.service_id === null);
  const methods = [...new Set(availableAdapters().flatMap((a) => a.methods))];
  const t = dict.pricing;

  return (
    <div className="container space-y-10 py-12">
      <header>
        <h1 className="text-3xl font-semibold">{t.title}</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">{t.intro}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.factorsTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 ps-5 text-sm">
              {t.factors.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">{t.estimateDisclaimer}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.deadlineTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <tbody>
                {deadlines.map((r) => (
                  <tr key={r.id}>
                    <Td>{localized(r, "label", locale)}</Td>
                    <Td className="text-end font-mono">×{r.multiplier?.toFixed(2)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.addonsTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th />
                <Th className="text-end">SAR</Th>
                <Th className="text-end">USD</Th>
              </tr>
            </thead>
            <tbody>
              {addons.map((r) => (
                <tr key={r.id}>
                  <Td>{localized(r, "label", locale)}</Td>
                  <Td className="text-end">{formatMoney(r.flat_sar, "SAR", locale)}</Td>
                  <Td className="text-end">{formatMoney(r.flat_usd, "USD", locale)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.paymentsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>{t.paymentsBody}</p>
          <div>
            <p className="font-medium">{t.paymentsAvailable}</p>
            {methods.length ? (
              <ul className="mt-1 flex flex-wrap gap-2">
                {methods.map((m) => (
                  <li key={m} className="rounded-md border px-2 py-1">
                    {METHOD_LABELS[m] ?? m}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">{t.none}</p>
            )}
          </div>
          <div>
            <p className="font-medium">{t.paymentsPlanned}</p>
            <ul className="mt-1 flex flex-wrap gap-2 text-muted-foreground">
              {PLANNED_METHODS.map((m) => (
                <li key={m.method} className="rounded-md border border-dashed px-2 py-1">
                  {METHOD_LABELS[m.method]}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-muted-foreground">{t.depositNote}</p>
          <Alert tone="warning">{t.noBankTransfer}</Alert>
          <Alert>{t.cryptoNote}</Alert>
        </CardContent>
      </Card>
    </div>
  );
}
