import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@/lib/csv";
import { isOrderStatus } from "@/lib/orders/status";
import { serverClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Runs under the caller's session: without an aal2 admin session RLS
// returns no rows, so the export cannot leak through a forgotten check.
export async function GET(request: NextRequest) {
  const supabase = await serverClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return new NextResponse("forbidden", { status: 403 });

  const sp = request.nextUrl.searchParams;
  let query = supabase
    .from("orders")
    .select("ref, status, title, currency, estimate_amount, deadline, submitted_at, delivered_at, completed_at, created_at, profiles(email), services(slug), invoices(number, total, amount_paid, amount_refunded, status)")
    .neq("status", "draft")
    .order("created_at", { ascending: true })
    .limit(10_000);
  const from = sp.get("from");
  const to = sp.get("to");
  const status = sp.get("status");
  const service = sp.get("service");
  const currency = sp.get("currency");
  if (from && DATE.test(from)) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to && DATE.test(to)) query = query.lte("created_at", `${to}T23:59:59.999Z`);
  if (status && isOrderStatus(status)) query = query.eq("status", status);
  if (service && /^[0-9a-f-]{36}$/i.test(service)) query = query.eq("service_id", service);
  if (currency === "SAR" || currency === "USD") query = query.eq("currency", currency);

  const { data, error } = await query;
  if (error) return new NextResponse("query failed", { status: 500 });
  const rows = (data ?? []).flatMap((o) => {
    const invoices = (o.invoices as unknown as Array<Record<string, unknown>> | null) ?? [];
    const base = [o.ref, o.status, o.title, (o.profiles as unknown as { email: string } | null)?.email, (o.services as unknown as { slug: string } | null)?.slug, o.currency, o.estimate_amount, o.deadline, o.submitted_at, o.delivered_at, o.completed_at];
    return invoices.length
      ? invoices.map((i) => [...base, i.number, i.total, i.amount_paid, i.amount_refunded, i.status])
      : [[...base, "", "", "", "", ""]];
  });
  const csv = toCsv(
    ["order_ref", "status", "title", "customer_email", "service", "currency", "estimate", "deadline", "submitted_at", "delivered_at", "completed_at", "invoice", "invoice_total", "paid", "refunded", "invoice_status"],
    rows,
  );
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="researchdesk-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
