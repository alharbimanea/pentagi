import "server-only";
import { emailConfigured } from "@/lib/email";
import { aiConfigured } from "@/lib/ai/assist";
import { serverEnv } from "@/lib/env";
import { telegramConfigured } from "@/lib/integrations/telegram";
import { whatsappConfigured } from "@/lib/integrations/whatsapp";
import { adapterById } from "@/lib/payments/registry";

export type IntegrationState = "active" | "inactive" | "unverified";

export function integrationStatus(): Array<{ name: string; state: IntegrationState; note?: string }> {
  const env = serverEnv();
  const adapter = (id: string): IntegrationState => {
    const a = adapterById(id);
    if (!a?.isConfigured()) return "inactive";
    return a.verified ? "active" : "unverified";
  };
  return [
    { name: "Payments · Sandbox", state: adapter("sandbox"), note: "development only" },
    { name: "Payments · Moyasar (cards, mada, Apple Pay)", state: adapter("moyasar") },
    { name: "Payments · HyperPay / Tap / PayTabs / PayPal", state: "inactive", note: "adapter not implemented" },
    { name: "Payments · Bitcoin", state: "inactive", note: "disabled pending legal review" },
    { name: "Email · Resend (outbound)", state: emailConfigured() ? "unverified" : "inactive" },
    { name: "Email · inbound support", state: "inactive", note: "not implemented" },
    { name: "Telegram bot", state: telegramConfigured() ? "unverified" : "inactive" },
    { name: "WhatsApp Business Platform", state: whatsappConfigured() ? "unverified" : "inactive", note: "receive only" },
    { name: "OpenAI assistance", state: aiConfigured() ? "unverified" : "inactive" },
    { name: "Malware scanning (ClamAV)", state: env.CLAMAV_REST_URL ? "unverified" : "inactive" },
    { name: "Bot protection (Turnstile)", state: env.TURNSTILE_SECRET_KEY ? "unverified" : "inactive" },
  ];
}
