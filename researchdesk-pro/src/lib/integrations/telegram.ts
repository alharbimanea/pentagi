import "server-only";
import { serverEnv } from "@/lib/env";

export function telegramConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET);
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const token = serverEnv().TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN not set" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
  };
}

export function parseLinkCommand(text: string | undefined): string | null {
  const match = /^\/(?:start|link)\s+([A-Za-z0-9]{8})\s*$/.exec(text?.trim() ?? "");
  return match?.[1] ?? null;
}
