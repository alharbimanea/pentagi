"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/actions/types";
import { getViewer } from "@/lib/auth";
import { getDictionary, isLocale } from "@/lib/i18n";
import { issueLinkCode } from "@/lib/integrations/link-codes";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/request";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { adminClient } from "@/lib/supabase/admin";

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(5000),
});

export async function contactAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = isLocale(String(form.get("locale"))) ? (String(form.get("locale")) as "en" | "ar") : "en";
  const dict = getDictionary(locale);
  const parsed = contactSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { error: dict.errors.validation, fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), dict.errors.validation])) };
  }
  // Honeypot: real users never see or fill this field.
  if (String(form.get("website") ?? "")) return { ok: true, message: dict.contact.success };
  if (!(await rateLimit("contact"))) return { error: dict.errors.rateLimited };
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), await clientIp()))) return { error: dict.errors.captcha };

  const viewer = await getViewer();
  const db = adminClient();
  const { error } = await db.from("support_tickets").insert({ ...parsed.data, customer_id: viewer?.user.id ?? null, channel: "web" });
  if (error) {
    console.error("support ticket insert failed", error.message);
    return { error: dict.errors.generic };
  }
  await db.rpc("notify_admins", { p_type: "message", p_payload: { channel: "web", subject: parsed.data.subject }, p_link: "/admin/inbox" });
  return { ok: true, message: dict.contact.success };
}

export async function createTelegramLinkCodeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = isLocale(String(form.get("locale"))) ? (String(form.get("locale")) as "en" | "ar") : "en";
  const dict = getDictionary(locale);
  const viewer = await getViewer();
  if (!viewer) return { error: dict.errors.unauthorized };
  if (!(await rateLimit("linkCode", viewer.user.id))) return { error: dict.errors.rateLimited };
  const code = await issueLinkCode(viewer.user.id, "telegram");
  return { ok: true, data: { code } };
}

export async function unlinkChannelAction(form: FormData) {
  const viewer = await getViewer();
  if (!viewer) return;
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success) return;
  const { serverClient } = await import("@/lib/supabase/server");
  const supabase = await serverClient();
  await supabase.from("channel_identities").delete().eq("id", id.data);
  revalidatePath("/[locale]/portal/settings", "page");
}
