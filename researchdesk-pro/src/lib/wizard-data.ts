import "server-only";
import type { WizardOption, WizardService } from "@/components/orders/order-wizard";
import { getRules, getServices } from "@/lib/catalog";
import { localized, type Locale } from "@/lib/i18n";

export async function wizardCatalog(locale: Locale) {
  const [services, rules] = await Promise.all([getServices(), getRules()]);
  const global = rules.filter((r) => r.service_id === null);
  const option = (kind: string): WizardOption[] =>
    global.filter((r) => r.kind === kind).map((r) => ({ code: r.code, label: localized(r, "label", locale) }));
  return {
    services: services.map<WizardService>((s) => ({
      id: s.id,
      slug: s.slug,
      unit: s.unit,
      name: localized(s, "name", locale),
      description: localized(s, "description", locale),
      revisions_included: s.revisions_included,
    })),
    levels: option("level"),
    complexities: option("complexity"),
    addons: option("addon"),
  };
}
