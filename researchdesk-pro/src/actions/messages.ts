"use server";

import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { sendTelegramMessage } from "@/lib/integrations/telegram";
import { sendWhatsAppText } from "@/lib/integrations/whatsapp";
import { rateLimit } from "@/lib/security/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(10_000),
  fileId: z.string().uuid().nullable().optional(),
});

export type SendResult = { ok: true; id: string } | { ok: false; error: "unauthorized" | "rate_limited" | "invalid" | "failed" };

export async function sendMessageAction(input: z.input<typeof sendSchema>): Promise<SendResult> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "unauthorized" };
  if (!(await rateLimit("message", viewer.user.id))) return { ok: false, error: "rate_limited" };

  const supabase = await serverClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  const { data: conversation } = await supabase.from("conversations").select("id, channel, external_thread_id").eq("id", parsed.data.conversationId).maybeSingle();
  if (!conversation) return { ok: false, error: "unauthorized" };

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: parsed.data.conversationId,
      sender_id: viewer.user.id,
      sender_kind: isAdmin ? "admin" : "customer",
      body: parsed.data.body,
      file_id: parsed.data.fileId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "failed" };

  // Replies in an external thread also go out on that channel; failures are
  // recorded on the message and in integration_events for retry.
  if (isAdmin && conversation.channel !== "web" && conversation.external_thread_id) {
    const db = adminClient();
    const result =
      conversation.channel === "telegram"
        ? await sendTelegramMessage(conversation.external_thread_id, parsed.data.body)
        : conversation.channel === "whatsapp"
          ? await sendWhatsAppText(conversation.external_thread_id, parsed.data.body)
          : { ok: false, error: "email replies are sent from the support mailbox" };
    await db.from("messages").update({ delivery_status: result.ok ? "delivered" : "failed" }).eq("id", data.id);
    await db.from("integration_events").insert({
      provider: conversation.channel,
      direction: "outbound",
      event_type: "message",
      external_id: data.id,
      payload: { conversation_id: conversation.id },
      status: result.ok ? "processed" : "failed",
      attempts: 1,
      last_error: result.ok ? null : (result.error ?? null),
      processed_at: result.ok ? new Date().toISOString() : null,
    });
  }
  return { ok: true, id: data.id };
}

export async function markConversationReadAction(conversationId: string): Promise<void> {
  if (!z.string().uuid().safeParse(conversationId).success) return;
  const supabase = await serverClient();
  await supabase.rpc("mark_conversation_read", { p_conversation: conversationId });
}

export interface ChatMessage {
  id: string;
  sender_id: string | null;
  sender_kind: "customer" | "admin" | "system" | "external";
  body: string;
  file_id: string | null;
  created_at: string;
  delivery_status: string;
}

export async function searchMessagesAction(conversationId: string, query: string): Promise<ChatMessage[]> {
  const q = query.trim();
  if (!z.string().uuid().safeParse(conversationId).success || q.length < 2 || q.length > 100) return [];
  const supabase = await serverClient();
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await supabase
    .from("messages")
    .select("id, sender_id, sender_kind, body, file_id, created_at, delivery_status")
    .eq("conversation_id", conversationId)
    .ilike("body", `%${escaped}%`)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as ChatMessage[];
}
