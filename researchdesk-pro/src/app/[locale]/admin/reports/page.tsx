import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth";
import { getServices } from "@/lib/catalog";
import { formatMoney, formatPercent } from "@/lib/format";
import { localized } from "@/lib/i18n";
import { ORDER_STATUSES } from "@/lib/orders/status";
import { one, resolveLocale, type LocaleParams, type SearchParams } from "@/lib/page";
import { serverClient } from "@/lib/supabase/server";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReportsPage({ params, searchParams }: { params: LocaleParams; searchParams: SearchParams }) {
  const { locale, dict } = await resolveLocale(params);
  await requireAdmin(locale);
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const from = DATE.test(one(sp.from) ?? "") ? one(sp.from)! : monthAgo;
  const to = DATE.test(one(sp.to) ?? "") ? one(sp.to)! : today;
  const currency = one(sp.currency) === "USD" ? "USD" : "SAR";
  const service = /^[0-9a-f-]{36}$/i.test(one(sp.service) ?? "") ? one(sp.service)! : "";
  const status = (ORDER_STATUSES as readonly string[]).includes(one(sp.status) ?? "") ? one(sp.status)! : "";

  const supabase = await serverClient();
  const [{ data: kpis }, services] = await Promise.all([
    supabase.rpc("admin_kpis", { p_from: `${from}T00:00:00Z`, p_to: `${to}T23:59:59.999Z`, p_currency: currency, p_service: service || null }),
    getServices(true),
  ]);
  const k = dict.admin.kpis;
  const f = dict.admin.filters;
  const v = (kpis ?? {}) as Record<string, number | null>;
  const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : formatMoney(n, currency, locale));
  const rows: Array<[string, string]> = [
    [k.new_orders, String(v.new_orders ?? 0)],
    [k.active_orders, String(v.active_orders ?? 0)],
    [k.overdue_orders, String(v.overdue_orders ?? 0)],
    [k.conversion_rate, formatPercent(v.conversion_rate, locale)],
    [k.revenue, money(v.revenue)],
    [k.average_order_value, money(v.average_order_value)],
    [k.unpaid_balances, money(v.unpaid_balances)],
    [k.revision_rate, formatPercent(v.revision_rate, locale)],
    [k.avg_first_response_minutes, String(v.avg_first_response_minutes ?? "—")],
    [k.avg_completion_hours, String(v.avg_completion_hours ?? "—")],
    [k.repeat_customers, String(v.repeat_customers ?? 0)],
  ];
  const exportQuery = new URLSearchParams({ from, to, currency, ...(service ? { service } : {}), ...(status ? { status } : {}) }).toString();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{dict.admin.reportsTitle}</h1>
        <p className="text-sm text-muted-foreground">{dict.admin.reportsIntro}</p>
      </header>
      <form className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          {f.from}
          <Input type="date" name="from" defaultValue={from} />
        </label>
        <label className="text-xs">
          {f.to}
          <Input type="date" name="to" defaultValue={to} />
        </label>
        <label className="text-xs">
          {f.currency}
          <Select name="currency" defaultValue={currency}>
            <option>SAR</option>
            <option>USD</option>
          </Select>
        </label>
        <label className="text-xs">
          {f.service}
          <Select name="service" defaultValue={service}>
            <option value="">{f.all}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {localized(s, "name", locale)}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-xs">
          {f.status} (CSV)
          <Select name="status" defaultValue={status}>
            <option value="">{f.all}</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {dict.status[s]}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit">{dict.actions.apply}</Button>
        <a href={`/api/admin/reports/orders.csv?${exportQuery}`} className="inline-flex h-10 items-center rounded-md border px-4 text-sm hover:bg-muted">
          {dict.actions.exportCsv}
        </a>
      </form>
      <Card>
        <CardHeader>
          <CardTitle>
            {from} → {to} · {currency}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {rows.map(([label, value]) => (
              <div key={label} className="rounded-md border p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
