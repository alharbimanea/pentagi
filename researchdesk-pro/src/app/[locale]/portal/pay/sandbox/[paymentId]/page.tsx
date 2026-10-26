import { notFound } from "next/navigation";
import { sandboxOutcomeAction } from "@/actions/payments";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { isLocale } from "@/lib/i18n";
import { sandboxAdapter } from "@/lib/payments/adapters/sandbox";
import { serverClient } from "@/lib/supabase/server";

// A stand-in for a hosted checkout page, available only when the sandbox
// adapter is enabled outside production.
export default async function SandboxCheckout({ params }: { params: Promise<{ locale: string; paymentId: string }> }) {
  const { locale, paymentId } = await params;
  if (!isLocale(locale) || !sandboxAdapter.isConfigured()) notFound();
  const supabase = await serverClient();
  const { data: payment } = await supabase.from("payments").select("id, amount, currency, kind, status").eq("id", paymentId).maybeSingle();
  if (!payment) notFound();
  return (
    <div className="flex justify-center py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sandbox checkout</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert tone="warning">TEST MODE — no money moves. Each button sends a signed webhook through the real payment pipeline.</Alert>
          <p className="text-2xl font-semibold">{formatMoney(payment.amount, payment.currency, locale)}</p>
          <p className="text-sm text-muted-foreground">
            {payment.kind} · {payment.status}
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["paid", "Approve payment", "accent"],
                ["failed", "Decline", "outline"],
                ["underpay", "Simulate underpayment", "ghost"],
              ] as const
            ).map(([outcome, label, variant]) => (
              <form key={outcome} action={sandboxOutcomeAction}>
                <input type="hidden" name="payment_id" value={payment.id} />
                <input type="hidden" name="outcome" value={outcome} />
                <input type="hidden" name="locale" value={locale} />
                <Button type="submit" variant={variant}>
                  {label}
                </Button>
              </form>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
