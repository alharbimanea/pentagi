import "server-only";
import type { ChatMessage } from "@/actions/messages";
import { serverClient } from "@/lib/supabase/server";

// Everything an order workspace shows, loaded under the caller's RLS. The
// same loader serves the customer and the admin page; what comes back
// differs only because the policies differ.
export async function loadOrderWorkspace(orderId: string) {
  const supabase = await serverClient();
  const { data: order } = await supabase.from("orders").select("*, services(*)").eq("id", orderId).maybeSingle();
  if (!order) return null;
  const { data: conversation } = await supabase.from("conversations").select("id").eq("order_id", orderId).eq("channel", "web").maybeSingle();
  const [history, requirements, files, versions, quotes, invoices, payments, refunds, revisions, messages, reads] = await Promise.all([
    supabase.from("order_status_history").select("*").eq("order_id", orderId).order("created_at"),
    supabase.from("order_requirements").select("*").eq("order_id", orderId).order("created_at"),
    supabase.from("files").select("id, kind, original_name, size_bytes, scan_status, status, created_at, uploader_id").eq("order_id", orderId).eq("status", "ready").order("created_at"),
    supabase.from("deliverable_versions").select("*").eq("order_id", orderId).order("version", { ascending: false }),
    supabase.from("quotes").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
    supabase.from("invoices").select("*").eq("order_id", orderId).order("issued_at", { ascending: false }),
    supabase.from("payments").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
    supabase.from("refunds").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
    supabase.from("revisions").select("*").eq("order_id", orderId).order("number", { ascending: false }),
    conversation
      ? supabase.from("messages").select("id, sender_id, sender_kind, body, file_id, created_at, delivery_status").eq("conversation_id", conversation.id).order("created_at").limit(500)
      : Promise.resolve({ data: [] }),
    conversation ? supabase.from("conversation_reads").select("user_id, last_read_at").eq("conversation_id", conversation.id) : Promise.resolve({ data: [] }),
  ]);
  return {
    order,
    service: order.services as Record<string, unknown> & { unit: string; name_en: string; name_ar: string },
    conversationId: conversation?.id ?? null,
    history: history.data ?? [],
    requirements: requirements.data ?? [],
    files: files.data ?? [],
    versions: versions.data ?? [],
    quotes: quotes.data ?? [],
    invoices: invoices.data ?? [],
    payments: payments.data ?? [],
    refunds: refunds.data ?? [],
    revisions: revisions.data ?? [],
    messages: (messages.data ?? []) as ChatMessage[],
    reads: (reads.data ?? []) as Array<{ user_id: string; last_read_at: string }>,
  };
}

export type OrderWorkspace = NonNullable<Awaited<ReturnType<typeof loadOrderWorkspace>>>;
