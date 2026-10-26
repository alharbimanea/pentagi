import "server-only";
import { serverEnv } from "@/lib/env";

export function whatsappConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.WHATSAPP_APP_SECRET && env.WHATSAPP_VERIFY_TOKEN);
}

export function whatsappCanSend(): boolean {
  const env = serverEnv();
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

export interface WhatsAppWebhook {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{ id: string; from: string; type: string; text?: { body?: string } }>;
        contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
      };
    }>;
  }>;
}

export function extractWhatsAppMessages(body: WhatsAppWebhook) {
  return (body.entry ?? []).flatMap((e) =>
    (e.changes ?? []).flatMap((c) =>
      (c.value?.messages ?? []).map((m) => ({
        id: m.id,
        from: m.from,
        text: m.type === "text" ? (m.text?.body ?? "") : `(${m.type} message)`,
        name: c.value?.contacts?.find((x) => x.wa_id === m.from)?.profile?.name ?? null,
      })),
    ),
  );
}

// Free-form replies are allowed only inside WhatsApp's 24-hour customer
// service window; outside it the platform requires an approved template,
// which this MVP does not send.
export async function sendWhatsAppText(to: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const env = serverEnv();
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return { ok: false, error: "WhatsApp sending not configured" };
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 4096) } }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}
