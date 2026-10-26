import Link from "next/link";
import { StatusBadge } from "@/components/site/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth";
import { getServices } from "@/lib/catalog";
import { formatDateTime, formatMoney } from "@/lib/format";
import { localized } from "@/lib/i18n";
import { ACTIVE_STATUSES, isOrderStatus, ORDER_STATUSES } from "@/lib/orders/status";
import { one, resolveLocale, type LocaleParams, type SearchParams } from "@/lib/page";
import { serverClient } from "@/lib/supabase/server";

export default async function AdminOrders({ params, searchParams }: { params: LocaleParams; searchParams: SearchParams }) {
  const { locale, dict } = await resolveLocale(params);
  const viewer = await requireAdmin(locale);
  const tz = viewer.profile?.timezone ?? "Asia/Riyadh";
  const sp = await searchParams;
  const status = one(sp.status);
  const service = one(sp.service);
  const queue = one(sp.queue);
  const q = (one(sp.q) ?? "").trim().slice(0, 100);
  const from = one(sp.from);
  const to = one(sp.to);

  const supabase = await serverClient();
  let query = supabase
    .from("orders")
    .select("id, ref, title, status, deadline, currency, estimate_amount, created_at, profiles(email, full_name), services(name_en, name_ar)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && isOrderStatus(status)) query = query.eq("status", status);
  else if (queue === "active" || queue === "overdue") query = query.in("status", ACTIVE_STATUSES);
  else if (queue && isOrderStatus(queue)) query = query.eq("status", queue);
  else query = query.neq("status", "draft");
  if (queue === "overdue") query = query.lt("deadline", new Date().toISOString());
  if (service && /^[0-9a-f-]{36}$/i.test(service)) query = query.eq("service_id", service);
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte("created_at", from);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lt("created_at", `${to}T23:59:59.999Z`);
  if (q) {
    const safe = q.replace(/[,()*%\\]/g, " ");
    query = query.or(`ref.ilike.*${safe}*,title.ilike.*${safe}*`);
  }
  const [{ data: orders }, services] = await Promise.all([query, getServices(true)]);
  const f = dict.admin.filters;
  const exportQuery = new URLSearchParams(Object.entries({ status, service, from, to }).filter(([, v]) => v) as Array<[string, string]>).toString();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{dict.admin.orders}</h1>
      <form className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" role="search">
        <Input name="q" defaultValue={q} placeholder={f.query} aria-label={f.query} className="lg:col-span-2" />
        <Select name="status" defaultValue={status ?? ""} aria-label={f.status}>
          <option value="">
            {f.status}: {f.all}
          </option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {dict.status[s]}
            </option>
          ))}
        </Select>
        <Select name="service" defaultValue={service ?? ""} aria-label={f.service}>
          <option value="">
            {f.service}: {f.all}
          </option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {localized(s, "name", locale)}
            </option>
          ))}
        </Select>
        <Input type="date" name="from" defaultValue={from} aria-label={f.from} />
        <Input type="date" name="to" defaultValue={to} aria-label={f.to} />
        <div className="flex gap-2 lg:col-span-6">
          <Button type="submit" size="sm">
            {dict.actions.apply}
          </Button>
          <a href={`/api/admin/reports/orders.csv?${exportQuery}`} className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted">
            {dict.actions.exportCsv}
          </a>
        </div>
      </form>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>{dict.portal.columns.ref}</Th>
              <Th>{dict.admin.customer}</Th>
              <Th>{dict.portal.columns.title}</Th>
              <Th>{dict.portal.columns.status}</Th>
              <Th>{dict.portal.columns.deadline}</Th>
              <Th className="text-end">{dict.admin.estimate}</Th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o) => {
              const customer = o.profiles as unknown as { email: string; full_name: string | null } | null;
              return (
                <tr key={o.id}>
                  <Td>
                    <Link className="font-mono text-accent hover:underline" href={`/${locale}/admin/orders/${o.id}`}>
                      {o.ref}
                    </Link>
                  </Td>
                  <Td>
                    <span className="block">{customer?.full_name ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">{customer?.email}</span>
                  </Td>
                  <Td>
                    <span className="block">{o.title}</span>
                    <span className="text-xs text-muted-foreground">{localized((o.services as unknown as object) ?? {}, "name", locale)}</span>
                  </Td>
                  <Td>
                    <StatusBadge status={o.status} dict={dict} />
                  </Td>
                  <Td className="whitespace-nowrap">{formatDateTime(o.deadline, locale, tz)}</Td>
                  <Td className="text-end">{o.estimate_amount ? formatMoney(o.estimate_amount, o.currency, locale) : "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
