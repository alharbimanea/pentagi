import { OrderWizard } from "@/components/orders/order-wizard";
import { requireViewer } from "@/lib/auth";
import { one, resolveLocale, type LocaleParams, type SearchParams } from "@/lib/page";
import { wizardCatalog } from "@/lib/wizard-data";

export default async function NewOrderPage({ params, searchParams }: { params: LocaleParams; searchParams: SearchParams }) {
  const { locale, dict } = await resolveLocale(params);
  const viewer = await requireViewer(locale, `/${locale}/portal/orders/new`);
  const catalog = await wizardCatalog(locale);
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">{dict.wizard.title}</h1>
      <OrderWizard
        locale={locale}
        dict={dict}
        {...catalog}
        order={null}
        files={[]}
        defaultServiceSlug={one((await searchParams).service)}
        defaultTimezone={viewer.profile?.timezone ?? "Asia/Riyadh"}
        defaultCurrency={viewer.profile?.preferred_currency === "USD" ? "USD" : "SAR"}
        initialEstimate={null}
      />
    </>
  );
}
