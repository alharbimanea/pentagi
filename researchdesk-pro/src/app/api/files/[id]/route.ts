import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";
import { adminClient } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse(null, { status: 404 });
  const supabase = await serverClient();
  // RLS decides visibility: a customer sees only their order's files, and a
  // deliverable only after it has been delivered.
  const { data: file } = await supabase.from("files").select("id, order_id, kind, path, original_name, status, scan_status").eq("id", id).maybeSingle();
  if (!file || file.status !== "ready") return new NextResponse(null, { status: 404 });
  if (file.scan_status === "infected") return new NextResponse(null, { status: 403 });

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin && file.kind === "deliverable") {
    const { data: invoices } = await supabase.from("invoices").select("total, amount_paid, status, quote_id, quotes(revision_id)").eq("order_id", file.order_id);
    const base = (invoices ?? []).filter((i) => !(i.quotes as unknown as { revision_id: string | null } | null)?.revision_id && i.status !== "void");
    const outstanding = base.some((i) => Number(i.amount_paid) < Number(i.total) && !["refunded", "partially_refunded"].includes(i.status));
    if (outstanding) return new NextResponse("balance due", { status: 402 });
  }

  const { data: signed, error } = await adminClient().storage.from("order-files").createSignedUrl(file.path, 60, { download: file.original_name });
  if (error || !signed) return new NextResponse(null, { status: 500 });
  // The service client may talk to Supabase on an internal address; the
  // browser must be sent to the public one.
  const url = signed.signedUrl.replace(publicEnv.supabaseServerUrl, publicEnv.supabaseUrl);
  return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store" } });
}
