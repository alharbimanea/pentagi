import "server-only";
import { serverEnv } from "@/lib/env";
import { fill, getDictionary, isLocale, type Locale } from "@/lib/i18n";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function emailConfigured(): boolean {
  return Boolean(serverEnv().RESEND_API_KEY);
}

export async function sendEmail(email: OutgoingEmail): Promise<{ ok: true; id: string } | { ok: false; error: string; retryable: boolean }> {
  const env = serverEnv();
  if (!env.RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY not set", retryable: false };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text, html: email.html, reply_to: env.SUPPORT_EMAIL }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, retryable: res.status === 429 || res.status >= 500 };
    const json = (await res.json()) as { id: string };
    return { ok: true, id: json.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error", retryable: true };
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Notification emails say only that something changed and link to the
// portal; order content stays behind the login.
export function notificationEmail(
  notification: { type: string; payload: Record<string, unknown>; link: string | null },
  to: string,
  localeValue: string,
): OutgoingEmail {
  const locale: Locale = isLocale(localeValue) ? localeValue : "en";
  const dict = getDictionary(locale);
  const templates = dict.notifications as Record<string, string>;
  const payload = { ...notification.payload } as Record<string, string | number>;
  if (typeof payload.to === "string") payload.to = (dict.status as Record<string, string>)[payload.to] ?? payload.to;
  const subject = fill(templates[notification.type] ?? dict.notifications.message, payload);
  const url = new URL(`/${locale}${notification.link ?? "/portal"}`, serverEnv().NEXT_PUBLIC_SITE_URL).toString();
  const text = `${subject}\n\n${url}\n\n— ${dict.brand.name}`;
  const align = locale === "ar" ? "right" : "left";
  const html = `<!doctype html><html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}"><body style="font-family:system-ui,sans-serif;color:#0f1f3d;text-align:${align}">
<p style="font-size:16px">${escapeHtml(subject)}</p>
<p><a href="${escapeHtml(url)}" style="background:#0d9488;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(dict.actions.view)}</a></p>
<p style="color:#64748b;font-size:12px">${escapeHtml(dict.brand.name)}</p></body></html>`;
  return { to, subject, text, html };
}

export const MAX_EMAIL_ATTEMPTS = 6;

// Exponential backoff for the notification outbox: 1, 2, 4, 8, 16 minutes.
export function nextAttemptDelayMs(attempts: number): number {
  return 60_000 * 2 ** Math.max(0, attempts - 1);
}
