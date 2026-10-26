import { NextResponse } from "next/server";
import { emailConfigured, MAX_EMAIL_ATTEMPTS, nextAttemptDelayMs, notificationEmail, sendEmail } from "@/lib/email";
import { serverEnv } from "@/lib/env";
import { safeEqual } from "@/lib/payments/hmac";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BATCH = 50;

// Email outbox for notifications. Vercel Cron (or n8n) calls this with
// `Authorization: Bearer $CRON_SECRET`. Failures back off exponentially and
// stop as `dead` after MAX_EMAIL_ATTEMPTS, where the owner can see them.
export async function GET(request: Request) {
  const secret = serverEnv().CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new NextResponse(null, { status: 401 });

  const db = adminClient();
  const { data: due } = await db
    .from("notifications")
    .select("id, user_id, type, payload, link, email_attempts, profiles(email, locale)")
    .in("email_status", ["pending", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at")
    .limit(BATCH);

  const counts = { sent: 0, failed: 0, dead: 0, skipped: 0 };
  for (const n of due ?? []) {
    const profile = n.profiles as unknown as { email: string; locale: string } | null;
    if (!emailConfigured() || !profile?.email) {
      await db.from("notifications").update({ email_status: "skipped" }).eq("id", n.id);
      counts.skipped++;
      continue;
    }
    // Claim the row first so overlapping cron runs do not send twice.
    const { data: claimed } = await db
      .from("notifications")
      .update({ email_attempts: n.email_attempts + 1, next_attempt_at: new Date(Date.now() + 10 * 60_000).toISOString() })
      .eq("id", n.id)
      .eq("email_attempts", n.email_attempts)
      .select("id");
    if (!claimed?.length) continue;

    const result = await sendEmail(notificationEmail(n as never, profile.email, profile.locale));
    const attempts = n.email_attempts + 1;
    if (result.ok) {
      await db.from("notifications").update({ email_status: "sent", email_last_error: null }).eq("id", n.id);
      counts.sent++;
    } else {
      const dead = !result.retryable || attempts >= MAX_EMAIL_ATTEMPTS;
      await db
        .from("notifications")
        .update({
          email_status: dead ? "dead" : "failed",
          email_last_error: result.error.slice(0, 500),
          next_attempt_at: new Date(Date.now() + nextAttemptDelayMs(attempts)).toISOString(),
        })
        .eq("id", n.id);
      counts[dead ? "dead" : "failed"]++;
    }
  }
  return NextResponse.json(counts);
}
