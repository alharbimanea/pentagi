import type { Dictionary, Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";
import type { EstimateResult } from "@/lib/pricing/engine";

export function EstimateView({ result, dict, locale }: { result: EstimateResult | null | undefined; dict: Dictionary; locale: Locale }) {
  const t = dict.wizard;
  if (!result) return <p className="text-sm text-muted-foreground">{t.estimateErrors.invalid_quantity}</p>;
  if (!result.ok) return <p className="text-sm text-warning">{t.estimateErrors[result.error]}</p>;
  return (
    <div className="space-y-2 text-sm" aria-live="polite">
      <dl className="space-y-1">
        {result.lines.map((line, i) => {
          const label =
            line.type === "multiplier"
              ? `${t.lines[line.kind]} ×${line.multiplier}`
              : line.type === "addon"
                ? `${t.lines.addon}: ${line.code}`
                : line.type === "discount"
                  ? `${t.lines.discount}: ${line.code}`
                  : line.type === "base"
                    ? `${t.lines.base} (${line.quantity} × ${line.unitPrice})`
                    : t.lines.minimum;
          return (
            <div key={i} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="tabular-nums">{formatMoney(line.amount, result.currency, locale)}</dd>
            </div>
          );
        })}
      </dl>
      <div className="flex justify-between border-t pt-2 font-semibold">
        <span>{t.total}</span>
        <span className="tabular-nums">{formatMoney(result.total, result.currency, locale)}</span>
      </div>
      {result.express ? <p className="text-xs text-accent">{t.express}</p> : null}
      {result.discountRejected ? <p className="text-xs text-warning">{t.discountRejected}</p> : null}
      <p className="text-xs text-muted-foreground">{t.estimateNote}</p>
    </div>
  );
}
