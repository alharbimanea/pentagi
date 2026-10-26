import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/site/status-badge";
import { Table, Td, Th } from "@/components/ui/table";
import { integrationStatus } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import { ACTIVE_STATUSES } from "@/lib/orders/status";
import { resolveLocale, type LocaleParams } from "@/lib/page";
import { serverClient } from "@/lib/supabase/server";

export default async function AdminDashboard({ params }: { params: LocaleParams }) {
  const { locale, dict } = await resolveLocale(params);
  const viewer = await requireAdmin(locale);
  const tz = viewer.profile?.timezone ?? "Asia/Riyadh";
  const supabase = await serverClient();
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  const [{ data: orders }, sar, usd, { data: refunds }, { data: unread }, { data: deletions }] = await Promise.all([
    supabase.from("orders").select("id, ref, title, status, deadline, updated_at").neq("status", "draft").order("updated_at", { ascending: false }).limit(500),
    supabase.rpc("admin_kpis", { p_from: from, p_to: now.toISOString(), p_currency: "SAR" }),
    supabase.rpc("admin_kpis", { p_from: from, p_to: now.toISOString(), p_currency: "USD" }),
    supabase.from("refunds").select("id").eq("status", "requested"),
    supabase.rpc("unread_counts"),
    supabase.from("profiles").select("id, email, deletion_requested_at").not("deletion_requested_at", "is", null),
  ]);
  const list = orders ?? [];
  const count = (s: string) => list.filter((o) => o.status === s).length;
  const overdue = list.filter((o) => ACTIVE_STATUSES.includes(o.status) && o.deadline && new Date(o.deadline) < now);
  const queues: Array<[string, number, string]> = [
    [dict.admin.queues.submitted, count("submitted"), "submitted"],
    [dict.admin.queues.needs_clarification, count("needs_clarification"), "needs_clarification"],
    [dict.admin.queues.awaiting_quote, count("awaiting_quote"), "awaiting_quote"],
    [dict.admin.queues.awaiting_payment, count("awaiting_payment"), "awaiting_payment"],
    [dict.admin.queues.active, list.filter((o) => ACTIVE_STATUSES.includes(o.status)).length, "active"],
    [dict.admin.queues.revision_requested, count("revision_requested"), "revision_requested"],
    [dict.admin.queues.overdue, overdue.length, "overdue"],
    [dict.admin.queues.refunds, refunds?.length ?? 0, ""],
    [dict.admin.queues.unread, (unread ?? []).length, "inbox"],
  ];
  const k = dict.admin.kpis;
  const kpi = (v: Record<string, unknown> | null, currency: string) => [
    [k.new_orders, String(v?.new_orders ?? 0)],
    [k.conversion_rate, formatPercent(v?.conversion_rate as number | null, locale)],
    [k.revenue, formatMoney(v?.revenue as number, currency, locale)],
    [k.average_order_value, v?.average_order_value === null ? "—" : formatMoney(v?.average_order_value as number, currency, locale)],
    [k.unpaid_balances, formatMoney(v?.unpaid_balances as number, currency, locale)],
    [k.revision_rate, formatPercent(v?.revision_rate as number | null, locale)],
    [k.avg_first_response_minutes, String(v?.avg_first_response_minutes ?? "—")],
    [k.avg_completion_hours, String(v?.avg_completion_hours ?? "—")],
    [k.repeat_customers, String(v?.repeat_customers ?? 0)],
  ];
  const attention = list.filter((o) => ["submitted", "needs_clarification", "awaiting_quote", "revision_requested"].includes(o.status)).slice(0, 10);
  const integrations = integrationStatus();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{dict.admin.title}</h1>
      <section aria-label={dict.admin.orders} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {queues.map(([label, n, key]) => (
          <Link
            key={label}
            href={key === "inbox" ? `/${locale}/admin/inbox` : key ? `/${locale}/admin/orders?queue=${key}` : `/${locale}/admin/orders?queue=refunds`}
            className="rounded-lg border bg-card p-4 hover:border-accent"
          >
            <p className="text-2xl font-semibold tabular-nums">{n}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {([["SAR", sar.data], ["USD", usd.data]] as const).map(([currency, values]) => (
          <Card key={currency}>
            <CardHeader>
              <CardTitle>
                {dict.admin.kpis.revenue} · {currency} · 30d
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                {kpi(values as Record<string, unknown> | null, currency).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{dict.admin.queues.submitted}</CardTitle>
          </CardHeader>
          <Table>
            <thead>
              <tr>
                <Th>{dict.portal.columns.ref}</Th>
                <Th>{dict.portal.columns.title}</Th>
                <Th>{dict.portal.columns.status}</Th>
                <Th>{dict.portal.columns.deadline}</Th>
              </tr>
            </thead>
            <tbody>
              {attention.map((o) => (
                <tr key={o.id}>
                  <Td>
                    <Link className="font-mono text-accent hover:underline" href={`/${locale}/admin/orders/${o.id}`}>
                      {o.ref}
                    </Link>
                  </Td>
                  <Td>{o.title}</Td>
                  <Td>
                    <StatusBadge status={o.status} dict={dict} />
                  </Td>
                  <Td className="whitespace-nowrap">{formatDateTime(o.deadline, locale, tz)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{dict.admin.integrations}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {integrations.map((i) => (
                <li key={i.name} className="flex justify-between gap-2">
                  <span>{i.name}</span>
                  <span className={i.state === "active" ? "text-success" : i.state === "unverified" ? "text-warning" : "text-muted-foreground"}>
                    {dict.admin.integrationStatus[i.state]}
                    {i.note ? ` · ${i.note}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      {deletions?.length ? (
        <Alert tone="warning">
          {dict.settings.requestDeletion}: {deletions.map((d) => d.email).join(", ")}
        </Alert>
      ) : null}
    </div>
  );
}
