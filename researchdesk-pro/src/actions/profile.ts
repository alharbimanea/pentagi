"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/actions/types";
import { getViewer } from "@/lib/auth";
import { getDictionary, isLocale } from "@/lib/i18n";
import { adminClient } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/time";

const profileSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  locale: z.enum(["en", "ar"]),
  timezone: z.string().refine(isValidTimeZone),
  preferred_currency: z.enum(["SAR", "USD"]),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9][0-9]{6,14}$/)
    .or(z.literal(""))
    .transform((v) => v || null),
  marketing_opt_in: z.literal("on").optional(),
});

export async function updateProfileAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = isLocale(String(form.get("ui_locale"))) ? (String(form.get("ui_locale")) as "en" | "ar") : "en";
  const dict = getDictionary(locale);
  const viewer = await getViewer();
  if (!viewer) return { error: dict.errors.unauthorized };
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: dict.errors.validation, fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), dict.errors.validation])) };
  const marketing = parsed.data.marketing_opt_in === "on";
  const supabase = await serverClient();
  const { data: before } = await supabase.from("profiles").select("marketing_opt_in").eq("id", viewer.user.id).single();
  const { error } = await supabase
    .from("profiles")
    .update({ ...parsed.data, marketing_opt_in: marketing })
    .eq("id", viewer.user.id);
  if (error) return { error: dict.errors.generic };
  if (before && before.marketing_opt_in !== marketing) {
    await supabase.from("consent_records").insert({ user_id: viewer.user.id, kind: "marketing", version: "settings", granted: marketing });
  }
  revalidatePath(`/${locale}/portal/settings`);
  return { ok: true, message: dict.settings.saved };
}

// Deletion is a request, not an immediate purge: the owner must keep
// invoices and payment records for the statutory period, so the workflow in
// docs/06-operations.md anonymizes what can go and retains what must stay.
export async function requestDeletionAction(form: FormData) {
  const viewer = await getViewer();
  if (!viewer) return;
  await adminClient().from("profiles").update({ deletion_requested_at: new Date().toISOString() }).eq("id", viewer.user.id);
  await adminClient().rpc("notify_admins", { p_type: "message", p_payload: { subject: "account deletion request" }, p_link: "/admin" });
  const locale = String(form.get("locale")) === "ar" ? "ar" : "en";
  revalidatePath(`/${locale}/portal/settings`);
}
