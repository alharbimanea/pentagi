import "server-only";
import { adminClient } from "@/lib/supabase/admin";

export type ExternalChannel = "telegram" | "whatsapp" | "email";

// Files an inbound external message into the unified inbox. The conversation
// is attached to a customer only through a verified channel identity, so an
// unverified sender lands in an unlinked thread that reveals nothing.
export async function recordInboundMessage(args: {
  channel: ExternalChannel;
  threadId: string;
  externalId: string;
  messageId: string;
  text: string;
  payload: unknown;
}): Promise<"stored" | "duplicate" | "failed"> {
  const db = adminClient();
  const { error: eventError } = await db.from("integration_events").insert({
    provider: args.channel,
    direction: "inbound",
    event_type: "message",
    external_id: args.messageId,
    payload: args.payload,
  });
  if (eventError) return eventError.code === "23505" ? "duplicate" : "failed";

  const { data: identity } = await db
    .from("channel_identities")
    .select("user_id")
    .eq("channel", args.channel)
    .eq("external_id", args.externalId)
    .not("verified_at", "is", null)
    .maybeSingle();

  let { data: conversation } = await db
    .from("conversations")
    .select("id, customer_id")
    .eq("channel", args.channel)
    .eq("external_thread_id", args.threadId)
    .maybeSingle();
  if (!conversation) {
    const inserted = await db
      .from("conversations")
      .insert({ channel: args.channel, external_thread_id: args.threadId, customer_id: identity?.user_id ?? null, subject: args.channel })
      .select("id, customer_id")
      .single();
    conversation = inserted.data;
  } else if (identity && conversation.customer_id !== identity.user_id) {
    await db.from("conversations").update({ customer_id: identity.user_id }).eq("id", conversation.id);
  }
  if (!conversation) return "failed";

  const { error } = await db.from("messages").insert({
    conversation_id: conversation.id,
    sender_id: null,
    sender_kind: "external",
    body: args.text.slice(0, 10_000) || "(empty message)",
    channel: args.channel,
    external_message_id: args.messageId,
  });
  await db
    .from("integration_events")
    .update({ status: error ? "failed" : "processed", processed_at: new Date().toISOString(), last_error: error?.message ?? null })
    .eq("provider", args.channel)
    .eq("direction", "inbound")
    .eq("external_id", args.messageId);
  return error ? "failed" : "stored";
}
