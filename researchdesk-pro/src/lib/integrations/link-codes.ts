import "server-only";
import { createHash, randomInt } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LINK_CODE_TTL_MS = 10 * 60_000;

export function hashCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export function generateCode(): string {
  return Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

export async function issueLinkCode(userId: string, channel: "telegram" | "whatsapp"): Promise<string> {
  const code = generateCode();
  const db = adminClient();
  await db.from("channel_link_codes").delete().eq("user_id", userId).eq("channel", channel).is("used_at", null);
  const { error } = await db.from("channel_link_codes").insert({
    user_id: userId,
    channel,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + LINK_CODE_TTL_MS).toISOString(),
  });
  if (error) throw new Error(error.message);
  return code;
}

// Binds an external identity to an account only when the sender proves
// possession of a fresh code issued inside the authenticated portal.
export async function redeemLinkCode(
  channel: "telegram" | "whatsapp",
  code: string,
  externalId: string,
  display: string | null,
): Promise<"linked" | "invalid"> {
  const db = adminClient();
  const { data: row } = await db
    .from("channel_link_codes")
    .select("id, user_id, expires_at, used_at")
    .eq("channel", channel)
    .eq("code_hash", hashCode(code))
    .maybeSingle();
  if (!row || row.used_at || new Date(row.expires_at) < new Date()) return "invalid";

  const { data: claimed } = await db
    .from("channel_link_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id");
  if (!claimed?.length) return "invalid";

  const { error } = await db.from("channel_identities").upsert(
    { user_id: row.user_id, channel, external_id: externalId, display, verified_at: new Date().toISOString(), opted_in_at: new Date().toISOString() },
    { onConflict: "channel,external_id" },
  );
  if (error) return "invalid";
  await db.from("consent_records").insert({ user_id: row.user_id, kind: `${channel}_opt_in`, version: "link-code", granted: true });
  return "linked";
}
