import { updateConfigAction, updateRuleAction, updateServiceAction } from "@/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireAdmin } from "@/lib/auth";
import { getRules, getServices } from "@/lib/catalog";
import { localized } from "@/lib/i18n";
import { resolveLocale, type LocaleParams } from "@/lib/page";
import { serverClient } from "@/lib/supabase/server";

const EDITABLE_CONFIG = ["require_admin_mfa", "revision_window_days", "quote_validity_days", "express_enabled", "ai_assist_enabled"];

export default async function PricingAdmin({ params }: { params: LocaleParams }) {
  const { locale, dict } = await resolveLocale(params);
  await requireAdmin(locale);
  const [services, rules] = await Promise.all([getServices(true), getRules(true)]);
  const supabase = await serverClient();
  const { data: config } = await supabase.from("app_config").select("key, value").in("key", EDITABLE_CONFIG);
  const a = dict.admin;
  const num = "h-8 w-24";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{a.pricingTitle}</h1>
        <p className="text-sm text-muted-foreground">{a.pricingIntro}</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{dict.services.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {services.map((s) => (
            <ActionForm key={s.id} action={updateServiceAction} hidden={{ locale, id: s.id }} className="rounded-md border p-3">
              <p className="text-sm font-medium">
                {localized(s, "name", locale)} <span className="text-xs text-muted-foreground">({dict.units[s.unit]})</span>
              </p>
              <div className="flex flex-wrap items-end gap-2 text-xs">
                {(
                  [
                    ["base_price_sar", `${a.basePrice} SAR`, s.base_price_sar, "0.001"],
                    ["base_price_usd", `${a.basePrice} USD`, s.base_price_usd, "0.001"],
                    ["min_price_sar", `${a.minPrice} SAR`, s.min_price_sar, "0.01"],
                    ["min_price_usd", `${a.minPrice} USD`, s.min_price_usd, "0.01"],
                    ["revisions_included", dict.workspace.revisionIncluded, s.revisions_included, "1"],
                    ["default_turnaround_hours", "h", s.default_turnaround_hours, "1"],
                  ] as const
                ).map(([name, label, value, step]) => (
                  <label key={name} className="space-y-1">
                    <span className="block text-muted-foreground">{label}</span>
                    <Input name={name} type="number" step={step} min="0" defaultValue={value} className={num} />
                  </label>
                ))}
                <label className="flex items-center gap-1">
                  <input type="checkbox" name="active" defaultChecked={s.active} /> {a.active}
                </label>
                <SubmitButton size="sm" variant="outline">
                  {dict.actions.save}
                </SubmitButton>
              </div>
            </ActionForm>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{dict.pricing.factorsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rules.map((r) => (
            <ActionForm key={r.id} action={updateRuleAction} hidden={{ locale, id: r.id }}>
              <div className="flex flex-wrap items-end gap-2 text-xs">
                <span className="w-48 text-sm">
                  <span className="text-muted-foreground">{r.kind}</span> · {localized(r, "label", locale)}
                </span>
                {r.kind !== "addon" ? (
                  <label className="space-y-1">
                    <span className="block text-muted-foreground">{a.multiplier}</span>
                    <Input name="multiplier" type="number" step="0.001" min="0.001" defaultValue={r.multiplier ?? ""} className={num} />
                  </label>
                ) : (
                  <>
                    <label className="space-y-1">
                      <span className="block text-muted-foreground">{a.flat} SAR</span>
                      <Input name="flat_sar" type="number" step="0.01" min="0" defaultValue={r.flat_sar ?? ""} className={num} />
                    </label>
                    <label className="space-y-1">
                      <span className="block text-muted-foreground">{a.flat} USD</span>
                      <Input name="flat_usd" type="number" step="0.01" min="0" defaultValue={r.flat_usd ?? ""} className={num} />
                    </label>
                  </>
                )}
                <label className="flex items-center gap-1">
                  <input type="checkbox" name="active" defaultChecked={r.active} /> {a.active}
                </label>
                <SubmitButton size="sm" variant="outline">
                  {dict.actions.save}
                </SubmitButton>
              </div>
            </ActionForm>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{dict.nav.settings}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {config?.map((c) => (
            <ActionForm key={c.key} action={updateConfigAction} hidden={{ locale, key: c.key }}>
              <div className="flex items-end gap-2 text-sm">
                <label className="space-y-1">
                  <span className="block font-mono text-xs text-muted-foreground">{c.key}</span>
                  <Input name="value" defaultValue={JSON.stringify(c.value)} className="h-8 w-40 font-mono" />
                </label>
                <SubmitButton size="sm" variant="outline">
                  {dict.actions.save}
                </SubmitButton>
              </div>
            </ActionForm>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
